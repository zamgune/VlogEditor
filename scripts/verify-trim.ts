import { _electron as electron, expect, type Locator } from '@playwright/test';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { probe } from '../electron/media';
import { binPath, run } from '../electron/process';

const root = resolve('.');
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8')) as { sourceFiles: string[] };
const id = `trim-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outputDir = join(root, 'output/playwright', id), dataDir = join(root, '.vlogtool-test', id);
await mkdir(outputDir, { recursive: true }); await mkdir(dataDir, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined && item[0] !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: dataDir } });
const page = await app.firstWindow(), errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const hashSources = () => Promise.all(fixture.sourceFiles.slice(0, 2).map(async p => createHash('sha256').update(await readFile(p)).digest('hex')));
const sourceHashes = await hashSources();
const input = (name: string) => page.getByRole('spinbutton', { name, exact: true });
async function range(start: number, end: number) {
  await expect(input('시작 프레임')).toHaveValue(String(start));
  await expect(input('종료 프레임')).toHaveValue(String(end));
}
async function drag(handle: Locator, dx: number, release = true) {
  const box = await handle.boundingBox(); if (!box) throw new Error('Missing trim handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 12 });
  if (release) await page.mouse.up();
}
const startHandle = (i = 1) => page.getByRole('button', { name: `클립 ${i} 시작 길이 조절` });
const endHandle = (i = 1) => page.getByRole('button', { name: `클립 ${i} 끝 길이 조절` });
async function setSeconds(value: string) { await input('영상 길이 (초)').fill(value); await input('영상 길이 (초)').press('Enter'); }
try {
  await expect(page.getByRole('button', { name: '＋ 영상 가져오기' })).toBeEnabled();
  await page.getByRole('combobox', { name: '프로젝트 화면 비율' }).selectOption('16:9');
  await app.evaluate(({ dialog }, filePaths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths }); }, fixture.sourceFiles.slice(0, 2));
  await page.getByRole('button', { name: '＋ 영상 가져오기' }).click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2, { timeout: 60000 });
  await expect(page.locator('.task-overlay')).toHaveCount(0);
  await drag(endHandle(), -60, false); await range(0, 90);
  await expect(page.locator('.trim-readout')).toContainText('길이 3.00초');
  await expect(page.getByRole('slider', { name: '재생 위치' })).toHaveAttribute('aria-valuenow', '89');
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => Math.round(v.currentTime * 30))).toBe(89);
  await page.screenshot({ path: join(outputDir, '01-during-drag.png') });
  await page.mouse.up(); await range(0, 90);
  await page.getByRole('button', { name: '실행 취소' }).click(); await range(0, 120);
  // A no-op gesture and an escaped drag must retain the earlier redo entry.
  await endHandle().click(); await expect(page.getByRole('button', { name: '다시 실행' })).toBeEnabled();
  await drag(endHandle(), -90, false); await range(0, 75);
  await page.keyboard.press('Escape'); await page.mouse.up(); await range(0, 120);
  await page.getByRole('button', { name: '다시 실행' }).click(); await range(0, 90);
  await drag(startHandle(), 30); await range(15, 90);
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => Math.round(v.currentTime * 30))).toBe(15);
  const clips = page.getByTestId('timeline-clip');
  const firstBox = await clips.first().boundingBox(), nextBox = await clips.nth(1).boundingBox();
  expect(Math.abs(nextBox!.x - firstBox!.x - 150)).toBeLessThan(1);
  // Keep at least one frame and make a tiny clip expandable again.
  await drag(endHandle(), -400); await range(15, 16);
  await drag(endHandle(), 60); await range(15, 46);
  await page.getByRole('button', { name: '원본 길이로' }).click(); await range(0, 120);
  await drag(endHandle(), 100); await range(0, 120);
  await drag(startHandle(), -100); await range(0, 120);
  await setSeconds('1.5'); await range(0, 45);
  await setSeconds('999'); await range(0, 120);
  await setSeconds('0.01'); await range(0, 1);
  await page.getByRole('button', { name: '원본 길이로' }).click(); await range(0, 120);
  // Scroll and zoom change the screen coordinates, not the source trim math.
  const zoom = page.getByRole('slider', { name: '타임라인 확대' });
  await zoom.focus(); await zoom.press('End'); await expect(zoom).toHaveValue('160');
  await page.locator('.track-scroll').hover(); await page.mouse.wheel(0, 1000);
  await expect.poll(() => page.locator('.track-scroll').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await drag(endHandle(2), -160); await range(0, 90);
  await page.getByRole('button', { name: '실행 취소' }).click(); await range(0, 120);
  await zoom.focus(); await zoom.press('Home');
  for (let i = 0; i < 40; i++) await zoom.press('ArrowRight');
  await expect(zoom).toHaveValue('60');
  // Commit by releasing outside the timeline viewport.
  await drag(endHandle(), -60, false); await range(0, 90);
  const pointer = await endHandle().boundingBox();
  await page.mouse.move(pointer!.x + pointer!.width / 2, 150); await page.mouse.up();
  await expect(page.locator('.trim-readout')).toHaveCount(0); await range(0, 90);
  await drag(startHandle(), 30); await range(15, 90);
  await startHandle(2).click(); await setSeconds('1.5'); await range(0, 45);
  await expect(page.locator('.timecode em')).toHaveText('/ 00:04:00');
  await page.getByRole('button', { name: '다음 프레임' }).click();
  const saved = join(outputDir, '길이 조절 프로젝트.vlog.json');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
  await page.getByRole('button', { name: '저장 Ctrl S' }).click();
  await expect.poll(async () => { try { return (await stat(saved)).size; } catch { return 0; } }).toBeGreaterThan(100);
  const project = JSON.parse(await readFile(saved, 'utf8'));
  expect(project.clips.map((c: any) => [c.inFrame, c.outFrame])).toEqual([[15, 90], [0, 45]]);
  const exported = join(outputDir, '길이 조절 검증.mp4');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported);
  await page.getByRole('button', { name: '내보내기 ↗' }).click();
  await expect(page.locator('footer')).toContainText('MP4 내보내기 완료', { timeout: 60000 });
  const info = await probe(root, exported);
  expect(Number(info.streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(120);
  expect(Number(info.streams.find(s => s.codec_type === 'audio')?.duration)).toBeCloseTo(4, 1);
  const ffmpeg = binPath(root, 'ffmpeg');
  async function pixel(frame: number, x: number, y: number) {
    return Array.from((await run(ffmpeg, ['-v', 'error', '-i', exported, '-vf', `select=eq(n\\,${frame}),format=rgb24,crop=1:1:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])).stdout);
  }
  const pixels = { beforeCut: await pixel(74, 960, 900), afterCut: await pixel(75, 960, 900), beforeMarker: await pixel(44, 800, 200), afterMarker: await pixel(45, 800, 200) };
  expect(pixels.beforeCut[0]).toBeGreaterThan(220); expect(pixels.afterCut[2]).toBeGreaterThan(220);
  expect(pixels.beforeMarker[1]).toBeLessThan(20); expect(pixels.afterMarker[1]).toBeGreaterThan(220);
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, saved);
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.locator('footer')).toContainText('프로젝트 열기 완료', { timeout: 60000 });
  await endHandle().click(); await range(15, 90);
  await page.screenshot({ path: join(outputDir, '02-length-editor.png') });
  expect(await hashSources()).toEqual(sourceHashes); expect(errors).toEqual([]);
  const report = { verifiedAt: new Date().toISOString(), outputDir, saved, exported, frames: 120, pixels, sourceHashes, errors,
    checks: ['start and end mouse trim', 'live duration and source boundary preview', 'ripple adjacency', 'one gesture one undo', 'redo survives no-op and Escape cancel', 'minimum one frame and re-extension', 'source limits', 'seconds input and reset', 'zoomed and scrolled trim', 'release outside timeline', 'save/open exact ranges', 'UI MP4 export 120 frames', 'cut and source-time marker pixels', 'audio duration', 'source hashes unchanged'],
    limitations: ['synthetic input clips', 'native file dialogs stubbed'] };
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(root, 'artifacts/latest-trim.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: join(outputDir, 'failure.png') }); console.error(await page.locator('body').innerText()); throw error;
} finally { await app.close(); }
