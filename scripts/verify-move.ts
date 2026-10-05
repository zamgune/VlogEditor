import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { probe } from '../electron/media';
import { run, binPath } from '../electron/process';

const root = resolve('.');
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8')) as { sourceFiles: string[] };
const id = `move-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outputDir = join(root, 'output/playwright', id), dataDir = join(root, '.vlogtool-test', id);
await mkdir(outputDir, { recursive: true }); await mkdir(dataDir, { recursive: true });
const env = Object.fromEntries(Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined && item[0] !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: dataDir } });
const page = await app.firstWindow(), errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const clips = page.getByTestId('timeline-clip'), names = clips.locator('strong');
async function beginBodyMove(from: number, to: number, after = true) {
  const a = (await clips.nth(from).boundingBox())!, b = (await clips.nth(to).boundingBox())!;
  await page.mouse.move(a.x + Math.min(60, a.width / 2), a.y + 30); await page.mouse.down();
  await page.mouse.move(b.x + b.width * (after ? 0.8 : 0.2), b.y + 30, { steps: 12 });
  await expect(page.getByTestId('move-ghost')).toBeVisible();
}
try {
  await expect(page.getByRole('button', { name: '＋ 영상 가져오기' })).toBeEnabled();
  await page.getByRole('combobox', { name: '프로젝트 화면 비율' }).selectOption('16:9');
  await app.evaluate(({ dialog }, filePaths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths }); }, fixture.sourceFiles);
  await page.getByRole('button', { name: '＋ 영상 가져오기' }).click();
  await expect(clips).toHaveCount(3, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  const original = await names.allTextContents();
  await clips.first().click({ position: { x: 59, y: 30 } });
  await expect(names).toHaveText(original); await expect(page.locator('.timecode')).toContainText('00:01:00');
  await beginBodyMove(0, 2);
  await expect(page.getByTestId('drop-marker')).toBeVisible(); await expect(names).toHaveText(original);
  await expect(page.getByTestId('move-ghost')).toContainText('3번째로 이동');
  await page.screenshot({ path: join(outputDir, '01-body-drag.png') });
  await page.mouse.up(); await expect(names).toHaveText([original[1], original[2], original[0]]);
  await expect(page.locator('.timecode')).toContainText('00:06:00');
  await expect(page.locator('.timecode em')).toHaveText('/ 00:09:00');
  await page.keyboard.press('Control+z'); await expect(names).toHaveText(original);
  await page.keyboard.press('Control+y'); await expect(names).toHaveText([original[1], original[2], original[0]]);
  await page.keyboard.press('Control+z');
  await beginBodyMove(0, 0); await page.mouse.up(); await expect(names).toHaveText(original);
  await expect(page.getByRole('button', { name: '다시 실행' })).toBeEnabled();
  const body = (await clips.first().boundingBox())!;
  await page.mouse.move(body.x + 60, body.y + 30); await page.mouse.down();
  await page.mouse.move(body.x + 63, body.y + 30); await page.mouse.up();
  await expect(page.getByTestId('move-ghost')).toHaveCount(0); await expect(names).toHaveText(original);
  await beginBodyMove(0, 2); await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(names).toHaveText(original); await expect(page.getByRole('button', { name: '다시 실행' })).toBeEnabled();
  await beginBodyMove(0, 2); await page.mouse.move(600, 200); await page.mouse.up();
  await expect(names).toHaveText(original); await expect(page.getByRole('button', { name: '다시 실행' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '내보내기 ↗' })).toBeEnabled();
  // Backward insertion before the first clip.
  await beginBodyMove(2, 0, false); await page.mouse.up();
  await expect(names).toHaveText([original[2], original[0], original[1]]);
  await page.keyboard.press('Control+z'); await expect(names).toHaveText(original);
  // The existing grip uses the same pointer operation.
  await page.getByRole('button', { name: '클립 1 순서 이동' }).dragTo(clips.nth(1), { targetPosition: { x: 200, y: 30 } });
  await expect(names).toHaveText([original[1], original[0], original[2]]);
  await page.keyboard.press('Control+z');
  const zoom = page.getByRole('slider', { name: '타임라인 확대' });
  await zoom.focus(); await zoom.press('End');
  const view = page.locator('.track-scroll'), bounds = (await view.boundingBox())!, a = (await clips.first().boundingBox())!;
  await page.mouse.move(a.x + 60, a.y + 30); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 9, a.y + 30, { steps: 12 });
  await expect.poll(() => view.evaluate(el => el.scrollLeft)).toBeGreaterThan(150);
  await expect(page.getByTestId('move-ghost')).toContainText('3번째로 이동');
  await page.mouse.up(); await expect(names).toHaveText([original[1], original[2], original[0]]);
  // Scroll back while carrying the last clip, then insert at the start.
  const last = (await clips.nth(2).boundingBox())!;
  await page.mouse.move(Math.max(bounds.x + 80, last.x + 80), last.y + 30); await page.mouse.down();
  await page.mouse.move(bounds.x + 8, last.y + 30, { steps: 12 });
  await expect.poll(() => view.evaluate(el => el.scrollLeft)).toBe(0);
  await page.mouse.up(); await expect(names).toHaveText(original);
  await zoom.focus(); await zoom.press('Home');
  for (let i = 0; i < 40; i++) await zoom.press('ArrowRight');
  await beginBodyMove(0, 2); await page.mouse.up();
  // Ruler still scrubs independently of moving clips.
  await page.locator('.ruler').click({ position: { x: 60, y: 28 } });
  await expect(page.locator('.timecode')).toContainText('00:01:00');
  await expect(names).toHaveText([original[1], original[2], original[0]]);
  const saved = join(outputDir, '이동한 프로젝트.vlog.json');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
  await page.getByRole('button', { name: '저장 Ctrl S' }).click();
  await expect.poll(async () => { try { return (await stat(saved)).size; } catch { return 0; } }).toBeGreaterThan(100);
  const project = JSON.parse(await readFile(saved, 'utf8'));
  expect(project.clips.map((c: any) => project.media.find((m: any) => m.id === c.mediaId).name)).toEqual([original[1], original[2], original[0]]);
  const exported = join(outputDir, '이동한 순서 검증.mp4');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported);
  await page.getByRole('button', { name: '내보내기 ↗' }).click();
  await expect(page.locator('footer')).toContainText('MP4 내보내기 완료', { timeout: 60000 });
  expect(Number((await probe(root, exported)).streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(270);
  async function pixel(frame: number) {
    return Array.from((await run(binPath(root, 'ffmpeg'), ['-v', 'error', '-i', exported, '-vf', `select=eq(n\\,${frame}),format=rgb24,crop=1:1:960:900`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])).stdout);
  }
  const pixels = [await pixel(119), await pixel(120), await pixel(149), await pixel(150)];
  expect(pixels[0][2]).toBeGreaterThan(220); expect(pixels[1][1]).toBeGreaterThan(100);
  expect(pixels[2][1]).toBeGreaterThan(100); expect(pixels[3][0]).toBeGreaterThan(220);
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, saved);
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.locator('footer')).toContainText('프로젝트 열기 완료', { timeout: 60000 });
  await expect(names).toHaveText([original[1], original[2], original[0]]);
  await page.screenshot({ path: join(outputDir, '02-moved.png') });
  expect(errors).toEqual([]);
  const report = { verifiedAt: new Date().toISOString(), outputDir, saved, exported, frames: 270, pixels, errors,
    checks: ['body click selects and seeks', 'body drag moves forward/backward', 'insertion marker before release', 'selected source frame follows moved clip', 'ripple preserves total duration', 'single undo/redo', 'no-op/jitter preserve redo', 'Escape and outside drop cancel', 'existing grip', 'zoomed edge scroll both directions', 'ruler seek retained', 'save/reopen order', 'MP4 270 frames', 'output pixels follow reordered cuts'],
    limitations: ['synthetic media', 'native file dialogs stubbed'] };
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(root, 'artifacts/latest-move.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (e) { await page.screenshot({ path: join(outputDir, 'failure.png') }); console.error(await page.locator('body').innerText()); throw e; }
finally { await app.close(); }
