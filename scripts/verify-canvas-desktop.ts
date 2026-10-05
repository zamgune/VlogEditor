import { _electron as electron, expect } from '@playwright/test';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CANVAS_PRESETS } from '../src/shared/canvas';
import { probe } from '../electron/media';
import { run, binPath } from '../electron/process';

const root = resolve('.'), fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-canvas.json'), 'utf8')) as { sourceFiles: string[] };
const id = `canvas-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outputDir = join(root, 'output/playwright', id), dataDir = join(root, '.vlogtool-test', id);
await mkdir(outputDir, { recursive: true }); await mkdir(dataDir, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined && item[0] !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: dataDir } });
const page = await app.firstWindow(), errors: string[] = [], comparisons: { name: string; mean: number }[] = [];
page.on('pageerror', e => errors.push(e.message));
const ratio = page.getByRole('combobox', { name: '프로젝트 화면 비율' }), fit = page.getByRole('combobox', { name: '기본 화면 맞춤' });
const clipFit = page.getByRole('combobox', { name: '선택 영상 화면 맞춤' }), canvas = page.getByTestId('preview-canvas');
const ffmpeg = binPath(root, 'ffmpeg');
async function previewComparison(name: string) {
  const ruler = (await page.locator('.ruler').boundingBox())!;
  await page.mouse.move(ruler.x + 20, ruler.y + 28); await page.mouse.down();
  await expect(page.locator('.exact-frame')).toHaveCount(0);
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => !v.seeking && v.readyState >= 2)).toBe(true);
  const live = join(outputDir, `${name}-live.png`), still = join(outputDir, `${name}-still.png`);
  await canvas.screenshot({ path: live }); await page.mouse.up();
  await expect(page.locator('.exact-frame')).toBeVisible({ timeout: 15000 }); await canvas.screenshot({ path: still });
  const decode = async (file: string) => (await run(ffmpeg, ['-v', 'error', '-i', file, '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])).stdout;
  const [a, b] = await Promise.all([decode(live), decode(still)]);
  expect(a.length).toBe(b.length);
  const mean = a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
  expect(mean).toBeLessThan(4); comparisons.push({ name, mean });
}
try {
  await expect(page.getByRole('button', { name: '＋ 영상 가져오기' })).toBeEnabled(); await expect(ratio).toHaveValue('9:16');
  await app.evaluate(({ dialog }, filePaths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths }); }, fixture.sourceFiles.slice(0, 2));
  await page.getByRole('button', { name: '＋ 영상 가져오기' }).click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await page.getByTestId('timeline-clip').first().click({ position: { x: 18, y: 25 } });
  await page.getByRole('button', { name: '흰색 여백' }).click();
  await expect(page.locator('[aria-label="여백 색상"]')).toHaveValue('#ffffff');
  await previewComparison('portrait-contain');
  await page.screenshot({ path: join(outputDir, '01-portrait-contain.png') });
  await fit.selectOption('cover'); await previewComparison('portrait-cover');
  const x = page.getByRole('slider', { name: '채우기 가로 위치' });
  await x.scrollIntoViewIfNeeded(); const slider = (await x.boundingBox())!;
  await page.mouse.move(slider.x + slider.width / 2, slider.y + slider.height / 2); await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.1, slider.y + slider.height / 2, { steps: 10 }); await page.mouse.up();
  await expect.poll(async () => Number(await x.inputValue())).toBeLessThan(20);
  await page.getByRole('button', { name: '실행 취소' }).click(); await expect(x).toHaveValue('50');
  await x.focus(); await x.press('Home'); await expect(x).toHaveValue('0'); await previewComparison('portrait-cover-left');
  await x.focus(); await x.press('End'); await expect(x).toHaveValue('100'); await previewComparison('portrait-cover-right');
  await page.getByRole('button', { name: '가운데로' }).click(); await expect(x).toHaveValue('50');
  await page.screenshot({ path: join(outputDir, '02-portrait-cover.png') });
  await clipFit.selectOption('contain'); await expect(fit).toHaveValue('cover'); await previewComparison('portrait-clip-override');
  await page.getByTestId('timeline-clip').nth(1).click({ position: { x: 18, y: 25 } }); await expect(clipFit).toHaveValue('inherit');
  for (const preset of CANVAS_PRESETS) {
    await ratio.selectOption(preset.id);
    await expect.poll(async () => { const b = (await canvas.boundingBox())!; return Math.abs(b.width / b.height - preset.width / preset.height); }).toBeLessThan(0.002);
    await expect(page.locator('.project-heading small')).toContainText(`${preset.width} × ${preset.height}`);
  }
  await ratio.selectOption('1:1');
  await page.getByRole('button', { name: '실행 취소' }).click(); await expect(ratio).toHaveValue('21:9');
  await page.getByRole('button', { name: '다시 실행' }).click(); await expect(ratio).toHaveValue('1:1');
  await previewComparison('square-override');
  await ratio.selectOption('9:16');
  // Small supported window keeps the portrait preview and controls within the workspace.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
  await expect.poll(async () => (await canvas.boundingBox())!.height).toBeGreaterThan(100);
  await expect.poll(async () => { const footer = (await page.locator('footer').boundingBox())!; return footer.y + footer.height <= await page.evaluate(() => window.innerHeight); }).toBe(true);
  await page.screenshot({ path: join(outputDir, '03-small-window.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
  const saved = join(outputDir, '숏츠 화면 설정.vlog.json');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
  await page.getByRole('button', { name: '저장 Ctrl S' }).click();
  await expect.poll(async () => { try { return (await stat(saved)).size; } catch { return 0; } }).toBeGreaterThan(100);
  const project = JSON.parse(await readFile(saved, 'utf8'));
  expect(project.version).toBe(7); expect(project.settings).toEqual({ width: 1080, height: 1920, fps: 30, color: 'SDR', fit: 'cover', background: '#ffffff' });
  expect(project.clips.map((c: any) => c.framing.fit)).toEqual(['contain', 'inherit']);
  const exported = join(outputDir, '9대16 숏츠.mp4');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported);
  await page.getByRole('button', { name: '내보내기 ↗' }).click();
  await expect(page.locator('footer')).toContainText('MP4 내보내기 완료', { timeout: 60000 });
  const v = (await probe(root, exported)).streams.find(s => s.codec_type === 'video')!;
  expect([v.width, v.height, Number(v.nb_frames)]).toEqual([1080, 1920, 60]);
  await ratio.selectOption('16:9');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, saved);
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.locator('footer')).toContainText('프로젝트 열기 완료', { timeout: 60000 });
  await expect(ratio).toHaveValue('9:16'); await expect(fit).toHaveValue('cover');
  await page.getByTestId('timeline-clip').first().click({ position: { x: 18, y: 25 } }); await expect(clipFit).toHaveValue('contain');
  const legacyPath = join(outputDir, '기존 와이드 프로젝트.vlog.json');
  await writeFile(legacyPath, JSON.stringify({ ...project, version: 2, settings: { width: 1920, height: 1080, fps: 30, color: 'SDR' }, clips: project.clips.map(({ framing: _, ...c }: any) => c) }));
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, legacyPath);
  await page.getByRole('button', { name: '열기', exact: true }).click(); await expect(page.locator('footer')).toContainText('프로젝트 열기 완료', { timeout: 60000 });
  await expect(ratio).toHaveValue('16:9'); await expect(fit).toHaveValue('contain');
  expect(errors).toEqual([]);
  const report = { verifiedAt: new Date().toISOString(), outputDir, saved, exported, comparisons, errors,
    checks: ['new portrait default', 'six canvas previews and dimensions', 'project fit/fill/background controls', 'per clip override', 'crop positioning and single-gesture undo', 'actual Chromium vs FFmpeg preview images', 'small window layout', 'canvas undo/redo', 'save/open v3', '1080x1920 60-frame UI MP4 export', 'legacy v2 retains wide fit'],
    limitations: ['synthetic media', 'native file dialogs stubbed', 'custom OS color picker not automated'] };
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(root, 'artifacts/latest-canvas-desktop.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (e) { await page.screenshot({ path: join(outputDir, 'failure.png') }); console.error(await page.locator('body').innerText()); throw e; }
finally { await app.close(); }
