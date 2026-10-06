import { _electron as electron, expect } from '@playwright/test';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';
import { readProject } from '../electron/storage';

// Run against an extracted release ZIP after its first-run setup, without app dependencies.
const directory = resolve(process.argv[2]);
const appRoot = join(directory, 'resources/app');
const { version } = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
const out = join(resolve('output'), `package-${Date.now()}`);
await mkdir(out, { recursive: true });
const video = join(out, 'sample.mp4'), microphone = join(out, 'microphone.wav');
await run(binPath(appRoot, 'ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
await run(binPath(appRoot, 'ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=997:sample_rate=48000:duration=5', '-c:a', 'pcm_s16le', microphone]);
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const application = await electron.launch({ executablePath: join(directory, 'VlogTool.exe'), args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${microphone}`], env: { ...env, VLOGTOOL_TEST_DATA: join(out, 'user-data') } });
const errors: string[] = [];
try {
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.milestone')).toContainText(`버전 ${version}`);
  const status = await page.evaluate(() => window.editor.status());
  expect(status.ffmpeg).toBe(true); expect(status.stage).toContain(version);
  expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
  await application.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, video);
  await page.getByRole('button', { name: '＋ 영상 가져오기' }).click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator('.task-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '클립 1 시작 길이 조절' }).click();
  for (const [name, value] of [['영상 시작 (초)', '0.5'], ['영상 종료 (초)', '2.5']]) {
    const input = page.getByRole('spinbutton', { name, exact: true }); await input.fill(value); await input.press('Enter');
  }
  await expect(page.getByRole('spinbutton', { name: '시작 프레임', exact: true })).toHaveValue('15');
  await expect(page.getByRole('spinbutton', { name: '종료 프레임', exact: true })).toHaveValue('75');
  await page.getByRole('button', { name: '＋ 자막', exact: true }).click();
  await page.locator('.caption-list textarea').first().fill('마루 부리 · 릴리스 확인');
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click();
  await page.getByRole('combobox', { name: '자막 글꼴' }).selectOption('maruburi');
  await expect(page.getByTestId('caption-object').locator('img')).toHaveAttribute('src', /^data:image\/png/, { timeout: 30000 });
  const ruler = (await page.locator('.ruler').boundingBox())!;
  await page.mouse.click(ruler.x + 1, ruler.y + 12);
  await page.getByRole('button', { name: '음성 녹음', exact: true }).click();
  await page.getByRole('button', { name: '● 녹음 시작', exact: true }).click();
  await expect(page.getByTestId('narration-item')).toHaveCount(1, { timeout: 20000 });
  const projectPath = join(out, 'portable.vlog.json');
  await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, projectPath);
  await page.getByRole('button', { name: '저장 Ctrl S' }).click();
  await expect.poll(async () => { try { return (await stat(projectPath)).size; } catch { return 0; } }).toBeGreaterThan(100);
  const project = await readProject(projectPath);
  expect(project.narrations).toHaveLength(1); expect(project.captions).toHaveLength(1);
  expect(project.clips[0].inFrame).toBe(15); expect(project.clips[0].outFrame).toBe(75);
  const exported = join(out, 'portable.mp4');
  await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported);
  await page.getByRole('button', { name: '내보내기 ↗' }).click();
  await expect(page.locator('footer')).toContainText('MP4 내보내기 완료', { timeout: 90000 });
  const metadata = await probe(appRoot, exported);
  expect(Number(metadata.streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(60);
  expect(Number(metadata.streams.find(s => s.codec_type === 'audio')?.duration)).toBeCloseTo(2, 1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: join(out, 'release-preview.png') });
  await writeFile(join(out, 'report.json'), JSON.stringify({ version, packaged: true, directory, status, projectPath, exported, errors }, null, 2));
  console.log(`Packaged app passed: ${out}`);
} finally { await application.close(); }
