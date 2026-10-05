import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { probe } from '../electron/media';
import { binPath, run } from '../electron/process';
import { ProjectSchema } from '../src/shared/project';
import { CAPTION_FONTS, captionRect, effectiveStyle } from '../src/shared/captions';

const root = resolve('.'), id = `font-trim-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(data, { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && key !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: data } });
const page = await app.firstWindow(), errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const input = (name: string) => page.getByRole('spinbutton', { name, exact: true });
async function setNumber(name: string, value: string) { await input(name).fill(value); await input(name).press('Enter'); }
async function range(start: number, end: number) {
  await expect(input('시작 프레임')).toHaveValue(String(start));
  await expect(input('종료 프레임')).toHaveValue(String(end));
}
async function seek(frame: number) {
  const box = (await page.locator('.ruler').boundingBox())!;
  await page.mouse.click(box.x + frame * 2, box.y + 12);
  await expect(page.getByRole('slider', { name: '재생 위치' })).toHaveAttribute('aria-valuenow', String(frame));
}
async function save(path: string) {
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
  await page.getByRole('button', { name: '저장 Ctrl S' }).click();
  await expect.poll(async () => { try { return (await stat(path)).size; } catch { return 0; } }).toBeGreaterThan(100);
  return ProjectSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}
try {
  await expect(page.getByRole('button', { name: '＋ 영상 가져오기' })).toBeEnabled();
  await page.getByRole('combobox', { name: '프로젝트 화면 비율' }).selectOption('16:9');
  await app.evaluate(({ dialog }, filePaths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths }); }, fixture.sourceFiles.slice(0, 2));
  await page.getByRole('button', { name: '＋ 영상 가져오기' }).click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2, { timeout: 60000 });
  await expect(page.locator('.task-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '클립 1 시작 길이 조절' }).click();
  await expect(page.getByRole('button', { name: '여기부터 시작', exact: true })).toBeDisabled();
  await setNumber('영상 시작 (초)', '0.5'); await range(15, 120);
  await setNumber('영상 종료 (초)', '3'); await range(15, 90);
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => Math.round(v.currentTime * 30))).toBe(89);
  await seek(45);
  await page.getByRole('button', { name: '여기부터 시작', exact: true }).click(); await range(60, 90);
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => Math.round(v.currentTime * 30))).toBe(60);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await range(15, 90);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await range(60, 90);
  await page.getByRole('button', { name: '원본 길이로' }).click(); await range(0, 120);
  await seek(89);
  await page.getByRole('button', { name: '여기까지 사용', exact: true }).click(); await range(0, 90);
  await expect(page.getByRole('button', { name: '여기까지 사용', exact: true })).toBeDisabled();
  await setNumber('영상 시작 (초)', '999'); await range(89, 90);
  await expect(page.getByRole('button', { name: '여기부터 시작', exact: true })).toBeDisabled();
  await setNumber('영상 종료 (초)', '0'); await range(89, 90);
  await expect(input('영상 종료 (초)')).toHaveValue('3.000');
  await setNumber('영상 시작 (초)', ''); await range(89, 90);
  await expect(input('영상 시작 (초)')).toHaveValue('2.967');
  await setNumber('영상 시작 (초)', '-1'); await range(89, 90);
  await page.getByRole('button', { name: '원본 길이로' }).click();
  await setNumber('영상 시작 (초)', '0.517'); await range(16, 120);
  await setNumber('영상 시작 (초)', '0.5');
  await setNumber('영상 종료 (초)', '3'); await range(15, 90);
  await page.getByRole('button', { name: '클립 2 시작 길이 조절' }).click();
  // The playhead is on a later clip: source time must exclude the preceding clip.
  await seek(105); await page.getByRole('button', { name: '여기부터 시작', exact: true }).click(); await range(30, 120);
  await page.getByRole('button', { name: '원본 길이로' }).click();
  await setNumber('영상 종료 (초)', '1.5'); await range(0, 45);
  const firstBox = (await page.getByTestId('timeline-clip').first().boundingBox())!;
  const secondBox = (await page.getByTestId('timeline-clip').nth(1).boundingBox())!;
  expect(Math.abs(secondBox.x - firstBox.x - firstBox.width)).toBeLessThan(1);
  await page.getByRole('button', { name: '클립 1 시작 길이 조절' }).click();
  await page.screenshot({ path: join(out, '01-front-and-back-trim.png') });
  await page.getByRole('button', { name: '＋ 자막', exact: true }).click();
  await expect(page.getByTestId('caption-object')).toHaveCount(1, { timeout: 30000 });
  await page.locator('.caption-list textarea').first().fill('마루 부리로 기록하는 오늘\nHello, Vlog!');
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click();
  await page.getByRole('combobox', { name: '자막 글꼴' }).selectOption('maruburi');
  expect(await page.getByRole('combobox', { name: '자막 굵기' }).locator('option').allTextContents()).toEqual(['200', '300', '400', '600', '700']);
  await page.getByRole('combobox', { name: '자막 굵기' }).selectOption('400');
  await page.getByRole('tab', { name: '스타일', exact: true }).click();
  await page.getByRole('textbox', { name: '내 자막 설정 이름' }).fill('마루 부리 검증');
  await page.getByRole('button', { name: '현재 스타일 저장' }).click();
  await expect(page.getByRole('button', { name: '디자인 마루 부리 검증', exact: true })).toBeVisible();
  const library = await page.evaluate(() => window.editor.captionPresets());
  expect(library.styles.at(-1)?.style.font).toBe('maruburi');
  const saved = join(out, '마루 부리 앞뒤 자르기.vlog.json'), p = await save(saved);
  expect(p.clips.map(c => [c.inFrame, c.outFrame])).toEqual([[15, 90], [0, 45]]);
  const style = effectiveStyle(p, p.captions[0]); expect(style.font).toBe('maruburi');
  const request = { text: p.captions[0].text, style, width: p.settings.width, height: p.settings.height };
  const preview = await page.evaluate(r => window.editor.captionBitmap(r), request);
  await expect(page.getByTestId('caption-object').locator('img')).toHaveAttribute('src', preview.url);
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click();
  await page.screenshot({ path: join(out, '02-maru-buri-caption.png') });
  const hashes: string[] = [];
  for (const weight of CAPTION_FONTS.maruburi.weights) {
    const bitmap = await page.evaluate(r => window.editor.captionBitmap(r), { ...request, style: { ...style, weight } });
    hashes.push(createHash('sha256').update(bitmap.url).digest('hex'));
    await writeFile(join(out, `maruburi-${weight}.png`), Buffer.from(bitmap.url.split(',')[1], 'base64'));
  }
  expect(new Set(hashes).size).toBe(5);
  const renderer = app.windows().find(w => w.url().endsWith('#caption-renderer'))!;
  const fonts = await renderer.evaluate(() => Array.from(document.fonts).filter(f => f.family === 'VlogMaruBuri').map(f => ({ weight: f.weight, status: f.status })));
  expect(fonts).toHaveLength(5); expect(fonts.every(f => f.status === 'loaded')).toBe(true);
  const exported = join(out, '마루 부리 앞뒤 자르기.mp4');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported);
  await page.getByRole('button', { name: '내보내기 ↗' }).click();
  await expect(page.locator('footer')).toContainText('MP4 내보내기 완료', { timeout: 90000 });
  const info = await probe(root, exported);
  expect(Number(info.streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(120);
  expect(Number(info.streams.find(s => s.codec_type === 'audio')?.duration)).toBeCloseTo(4, 1);
  // Compare the exported caption pixels with the preview bitmap on the red source frame.
  const bitmap = await page.evaluate(r => window.editor.captionBitmap(r), request);
  const rect = captionRect(bitmap, style, p.settings, p.captionSettings.margins);
  const expectedUrl = await page.evaluate(async ({ bitmap, rect, settings }) => {
    const canvas = document.createElement('canvas'); canvas.width = settings.width; canvas.height = settings.height;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'rgb(251,0,0)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image(); img.src = bitmap.url; await img.decode(); ctx.drawImage(img, rect.left, rect.top);
    return canvas.toDataURL('image/png');
  }, { bitmap, rect, settings: p.settings });
  const expectedPath = join(out, 'expected-caption.png'); await writeFile(expectedPath, Buffer.from(expectedUrl.split(',')[1], 'base64'));
  const ffmpeg = binPath(root, 'ffmpeg');
  async function pixels(path: string) { return (await run(ffmpeg, ['-v', 'error', '-i', path, '-vf', `crop=${rect.width}:${rect.height}:${rect.left}:${rect.top},format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])).stdout; }
  const [expected, actual] = await Promise.all([pixels(expectedPath), pixels(exported)]);
  expect(actual.length).toBe(expected.length);
  const meanError = expected.reduce((sum, value, i) => sum + Math.abs(value - actual[i]), 0) / expected.length;
  expect(meanError).toBeLessThan(6);
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, saved);
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.locator('footer')).toContainText('프로젝트 열기 완료');
  await page.getByRole('button', { name: '클립 1 시작 길이 조절' }).click(); await range(15, 90);
  await page.getByTestId('caption-block').click();
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '자막 글꼴' })).toHaveValue('maruburi');
  await expect(page.getByRole('combobox', { name: '자막 굵기' })).toHaveValue('400');
  // Starting a video trim must reveal its controls; Escape restores caption selection.
  const handle = (await page.getByRole('button', { name: '클립 1 시작 길이 조절' }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2, { steps: 8 });
  await range(30, 90);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.getByRole('heading', { name: '자막 속성', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '자막 글꼴' })).toHaveValue('maruburi');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.isVisible())!.setSize(1100, 760));
  await page.getByRole('button', { name: '클립 1 시작 길이 조절' }).click();
  await range(15, 90);
  await page.getByRole('button', { name: '여기부터 시작', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '여기부터 시작', exact: true })).toBeInViewport();
  await page.screenshot({ path: join(out, '03-small-window.png') });
  expect(errors).toEqual([]);
  const report = { out, saved, exported, frames: 120, fonts, hashes, meanCaptionPixelError: meanError, errors,
    checks: ['start/end seconds and frame rounding', 'blank/negative inputs and one-frame bounds', 'front/back playhead trims including later clip', 'undo/redo and ripple adjacency', 'five real font faces', 'saved style font', 'project save/reopen', 'caption pixels in MP4 match preview', 'four-second video/audio', 'small-window controls'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(root, 'artifacts/latest-font-trim.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: join(out, 'failure.png') }); console.error(await page.locator('body').innerText()); throw error;
} finally { await app.close(); }
