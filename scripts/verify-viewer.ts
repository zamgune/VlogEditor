import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { addCaption, captionRect, effectiveStyle } from '../src/shared/captions';
import { CANVAS_PRESETS } from '../src/shared/canvas';
import { addDecoration } from '../src/shared/decoration';
import { ProjectSchema } from '../src/shared/project';
import { textStyleAt } from '../src/shared/rich-text';
import { DEVICE_PRESETS } from '../src/shared/viewer';
import { binPath, run } from '../electron/process';

const root = resolve('.'), out = join(root, 'output/playwright', `viewer-${Date.now()}`), data = join(out, 'profile');
await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
let p = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
p.clips = p.clips.slice(0, 1).map(c => ({ ...c, inFrame: 30, outFrame: 120 }));
p.captions = []; p.narrations = []; p.decorations = []; p.settings = { ...p.settings, width: 1080, height: 1920 };
p = addCaption(p, p.clips[0].id, 'normal', 30).project;
p.captions[0] = { ...p.captions[0], text: '오늘의 한 장면', inFrame: 30, outFrame: 75, overrides: { size: 60, position: { h: .5, v: .5, x: .5, y: .88 } } };
p = addCaption(p, p.clips[0].id, 'title', 30).project;
p.captions[1] = { ...p.captions[1], text: 'EPISODE 02', overrides: { size: 60, position: { h: .5, v: .5, x: .5, y: .3 } } };
p = addDecoration(p, p.clips[0].id, 'rectangle', 30).project;
p.decorations[0] = { ...p.decorations[0], x: .38, y: .58, width: .2, height: .08 };
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(p));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: data } });
const page = await app.firstWindow(), errors: string[] = [], checks: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
const caption = page.locator(`[data-testid="caption-object"][data-caption-id="${p.captions[0].id}"]`);
const title = page.locator(`[data-testid="caption-object"][data-caption-id="${p.captions[1].id}"]`);
async function numeric(label: string, value: string) { const input = page.getByRole('spinbutton', { name: label, exact: true }); await input.fill(value); await input.press('Enter'); }
async function seek(frame: number) { const b = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(b.x + frame * 2, b.y + 12); await expect(page.getByRole('slider', { name: '재생 위치' })).toHaveAttribute('aria-valuenow', String(frame)); }
async function drag(locator: typeof caption, dx: number, dy: number, alt = true) {
  const b = (await locator.boundingBox())!; if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 5 }); await page.mouse.up(); if (alt) await page.keyboard.up('Alt');
}
async function exported(name: string) {
  const path = join(out, `${name}.mp4`);
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
  await page.getByRole('button', { name: '내보내기 ↗' }).click();
  await expect(page.locator('footer')).toContainText(`MP4 내보내기 완료 · ${path}`, { timeout: 90000 });
  return path;
}
try {
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await expect(caption).toBeVisible(); await expect(page.locator('.library')).toBeHidden(); await expect(page.locator('.inspector')).toBeHidden();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1366, 768));
  await caption.click(); await page.getByRole('button', { name: '크게 보기', exact: true }).click();
  await numeric('빠른 글자 크기', '72'); await expect.poll(async () => effectiveStyle(await state(), (await state()).captions[0]).size).toBe(72);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => effectiveStyle(await state(), (await state()).captions[0]).size).toBe(60);
  await page.getByRole('button', { name: '부분 서식', exact: true }).click(); await expect(page.locator('.inspector')).toBeVisible();
  const text = page.getByRole('textbox', { name: '부분 서식 문구' }); await text.focus(); await text.press('Control+Home'); await page.keyboard.down('Shift'); await text.press('ArrowRight'); await text.press('ArrowRight'); await page.keyboard.up('Shift');
  await page.getByRole('combobox', { name: '선택 글자 글꼴' }).selectOption('nanumpen'); await numeric('선택 글자 크기', '100');
  await expect.poll(async () => textStyleAt((await state()).captions[0].runs, 0).size).toBe(100);
  await expect.poll(async () => textStyleAt((await state()).captions[0].runs, 0).font).toBe('nanumpen');
  await page.getByRole('button', { name: '상세 편집 닫기' }).click(); checks.push('large preview quick edit, undo and partial font/size');
  await seek(0); const beforePlayback = await state();
  await page.evaluate(() => { (window as any).viewerVideo = document.querySelector('video'); });
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(v => (v as HTMLVideoElement).currentTime)).toBeGreaterThan(1.1);
  await page.getByRole('combobox', { name: '미리보기 방식' }).selectOption('device');
  await page.getByRole('combobox', { name: '기기 방향' }).selectOption('landscape');
  await page.getByRole('button', { name: '상세 편집', exact: true }).click();
  expect(await page.evaluate(() => (window as any).viewerVideo === document.querySelector('video'))).toBe(true);
  await expect(page.getByRole('button', { name: '일시 정지', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '일시 정지', exact: true }).click();
  expect(await state()).toEqual(beforePlayback); await page.getByRole('button', { name: '상세 편집 닫기' }).click();
  await page.getByRole('combobox', { name: '기기 방향' }).selectOption('portrait');
  await page.getByRole('combobox', { name: '미리보기 방식' }).selectOption('original'); await seek(0);
  checks.push('device/direction/panel changes preserve the video element and uninterrupted playback');
  const beforeView = await state(); const baseline = await exported('original');
  await page.getByRole('combobox', { name: '미리보기 방식' }).selectOption('device');
  await expect(page.getByTestId('safe-area-overlay')).toBeVisible(); await expect(caption).toHaveAttribute('data-safe-warning', /하단 정보/);
  await page.screenshot({ path: join(out, 'focus-safe-area.png') });
  await seek(50); await expect(caption).toHaveCount(0); await expect(page.getByRole('status', { name: '현재 화면 가림 확인' })).not.toContainText('오늘의 한 장면');
  await seek(0); await expect(caption).toHaveAttribute('data-safe-warning', /하단 정보/);
  await page.getByRole('combobox', { name: '유튜브 보기' }).selectOption('video'); await page.getByRole('button', { name: '가이드 설정', exact: true }).click();
  await page.getByRole('checkbox', { name: '재생 조작부 보임' }).uncheck(); await expect(caption).not.toHaveAttribute('data-safe-warning');
  await page.getByRole('checkbox', { name: '하단 배너 고려' }).check(); await numeric('하단 배너 높이', '30'); await expect(caption).toHaveAttribute('data-safe-warning', /하단 배너/);
  await page.getByRole('button', { name: '가이드 설정 닫기' }).click(); expect(await state()).toEqual(beforeView);
  const guided = await exported('device-guides');
  const ffmpeg = binPath(root, 'ffmpeg');
  const hashes = await Promise.all([baseline, guided].map(path => run(ffmpeg, ['-v', 'error', '-i', path, '-map', '0:v:0', '-f', 'hash', '-hash', 'sha256', 'pipe:1']).then(r => r.stdout.toString())));
  expect(hashes[0]).toBe(hashes[1]); checks.push('timed warnings, controls/banner, unchanged project and identical decoded MP4 with guides');
  await page.getByRole('combobox', { name: '유튜브 보기' }).selectOption('shorts');
  await title.click(); const initial = await state(); const canvas = page.getByTestId('preview-canvas');
  const cv = (await canvas.boundingBox())!, oldBox = (await title.boundingBox())!;
  await drag(title, 11, 13); await expect.poll(async () => (await state()).captions[1].overrides.position?.x).not.toBe(initial.captions[1].overrides.position?.x);
  const nextBox = (await title.boundingBox())!;
  expect(Math.abs((nextBox.x - oldBox.x - 11) / cv.width * initial.settings.width)).toBeLessThanOrEqual(1);
  expect(Math.abs((nextBox.y - oldBox.y - 13) / cv.height * initial.settings.height)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await title.click(); await drag(title.locator('.caption-resize'), 10, 5);
  await expect.poll(async () => effectiveStyle(await state(), (await state()).captions[1]).size).toBeGreaterThan(60);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect.poll(async () => effectiveStyle(await state(), (await state()).captions[1]).size).toBe(60);
  const beforeResize = (await page.locator('.preview-stage').boundingBox())!.height;
  await drag(page.getByRole('separator', { name: '타임라인 높이' }), 0, -30, false);
  await expect.poll(async () => (await page.locator('.preview-stage').boundingBox())!.height).toBeLessThan(beforeResize - 20);
  await page.getByRole('button', { name: '크게 보기', exact: true }).click();
  const shape = page.getByTestId('decoration-object'); await shape.click(); await numeric('빠른 도형 라운드', '40'); await expect.poll(async () => (await state()).decorations[0].radius).toBe(40);
  await expect(shape).not.toHaveAttribute('data-safe-warning');
  await caption.click(); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await expect.poll(async () => (await state()).captions.length).toBe(3); await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await caption.click(); await page.getByRole('button', { name: '묶음 저장', exact: true }).click(); await page.getByRole('textbox', { name: '새 글 그룹 이름' }).fill('기기 미리보기 테스트'); await page.getByRole('button', { name: '기본 자막 스타일로 저장', exact: true }).click();
  await expect(page.locator('.group-status')).toContainText('저장됨'); await page.getByRole('button', { name: '보관함 닫기' }).click(); checks.push('device drag <=1px, shape edit, keyboard copy/paste, group save');
  console.log('Editing and output checks passed');
  // All source aspect ratios and every orientation use the same output-space caption bounds.
  let comparisons = 0;
  for (const preset of CANVAS_PRESETS) {
    await page.getByRole('button', { name: /출력 설정 ·/ }).click(); await page.getByRole('combobox', { name: '프로젝트 화면 비율' }).selectOption(preset.id); await page.getByRole('button', { name: '상세 편집 닫기' }).click();
    await expect.poll(async () => (await state()).settings.width).toBe(preset.width);
    const q = await state(), c = q.captions[1], style = effectiveStyle(q, c);
    const bitmap = await page.evaluate(r => window.editor.captionBitmap(r), { text: c.text, runs: c.runs, style, width: preset.width, height: preset.height });
    await expect(title.locator('img')).toHaveAttribute('src', bitmap.url);
    const rect = captionRect(bitmap, style, q.settings, q.captionSettings.margins);
    for (const d of DEVICE_PRESETS) for (const orientation of ['portrait', 'landscape']) for (const fit of ['contain', 'cover']) {
      await page.getByRole('combobox', { name: '미리보기 기기' }).selectOption(d.id); await page.getByRole('combobox', { name: '기기 방향' }).selectOption(orientation); await page.getByRole('combobox', { name: '기기 화면 맞춤' }).selectOption(fit);
      await expect.poll(async () => { const cb = (await canvas.boundingBox())!, b = (await title.boundingBox())!; return Math.max(Math.abs((b.x - cb.x) / cb.width * preset.width - rect.left), Math.abs((b.y - cb.y) / cb.height * preset.height - rect.top)); }).toBeLessThanOrEqual(1);
      comparisons++;
    }
  }
  checks.push(`${comparisons} canvas/device/orientation/fit DOM coordinate checks <=1px`);
  await page.getByRole('combobox', { name: '미리보기 기기' }).selectOption('custom'); await page.getByRole('textbox', { name: '사용자 기기 이름' }).fill('내 폴드'); await numeric('사용자 기기 너비', '1600'); await numeric('사용자 기기 높이', '1800'); await page.getByRole('button', { name: '기기 저장', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '미리보기 기기' })).toContainText('내 폴드'); await page.getByRole('button', { name: '가이드 설정 닫기' }).click();
  const savedView = await page.evaluate(() => localStorage.getItem('vlog-viewer-v1')); await page.reload(); await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.locator('.task-overlay')).toHaveCount(0); expect(await page.evaluate(() => localStorage.getItem('vlog-viewer-v1'))).toBe(savedView);
  checks.push('custom device saved and restored');
  for (const factor of [1, 1.25, 1.5]) {
    await app.evaluate(({ BrowserWindow }, zoom) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!; w.setSize(1366, 768); w.webContents.setZoomFactor(zoom); }, factor);
    await page.getByRole('button', { name: '크게 보기', exact: true }).click(); await title.click({ force: true }); await page.getByRole('button', { name: '상세 편집', exact: true }).click();
    await expect(page.getByRole('button', { name: '상세 편집 닫기' })).toBeInViewport(); await expect(page.getByRole('button', { name: '내보내기 ↗' })).toBeInViewport(); await expect(page.getByRole('button', { name: '재생', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, stage: document.querySelector('.preview-stage')!.getBoundingClientRect().height })); console.log({ factor, metrics }); expect(metrics.stage).toBeGreaterThan(80);
    const native = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.webContents.capturePage()).toPNG().toString('base64')); await writeFile(join(out, `layout-${factor}.png`), Buffer.from(native, 'base64')); await page.getByRole('button', { name: '상세 편집 닫기' }).click(); await page.getByRole('button', { name: '편집 화면으로', exact: true }).click();
  }
  checks.push('1366x768 at 100/125/150% UI scale');
  expect(errors).toEqual([]); await writeFile(join(out, 'report.json'), JSON.stringify({ out, checks, errors }, null, 2)); console.log(JSON.stringify({ out, checks, errors }));
} catch (error) { await page.screenshot({ path: join(out, 'failure.png') }); console.error('Viewer verification output:', out); throw error; }
finally { await app.close(); }
