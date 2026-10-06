import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSchema, type Project } from '../src/shared/project';
import { effectiveStyle, captionRect, activeCaptionSpans } from '../src/shared/captions';
import { textStyleAt } from '../src/shared/rich-text';
import { activeDecorations } from '../src/shared/decoration';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';

const root = resolve('.'), id = `rich-decoration-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
const base = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
base.captions = []; base.narrations = []; base.decorations = []; base.clips = base.clips.slice(0, 1).map(c => ({ ...c, inFrame: 30, outFrame: 120 }));
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(base));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env: { ...env, VLOGTOOL_TEST_DATA: data } });
let app = await launch(), page = await app.firstWindow(); const errors: string[] = [];
await page.evaluate('globalThis.__name = (fn) => fn');
page.on('pageerror', e => errors.push(e.message));
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
async function number(name: string, value: string) { const field = page.getByRole('spinbutton', { name, exact: true }); await field.fill(value); await field.press('Enter'); }
async function color(name: string, value: string) { await page.getByLabel(name, { exact: true }).fill(value); }
async function selectText(a: number, b: number) {
  const input = page.getByRole('textbox', { name: '부분 서식 문구', exact: true }); await input.click(); await input.press('Control+Home');
  for (let i = 0; i < a; i++) await input.press('ArrowRight');
  await page.keyboard.down('Shift'); for (let i = a; i < b; i++) await input.press('ArrowRight'); await page.keyboard.up('Shift');
}
async function selectShape(id: string) { await page.locator('.library-tabs').getByRole('button', { name: '꾸미기', exact: true }).click(); await page.locator(`[data-testid="decoration-list-item"][data-shape-id="${id}"]`).click(); }
async function seek(frame: number) { const ruler = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(ruler.x + frame * 2, ruler.y + 20); }
async function drag(selector: string, dx: number, dy: number, cancel = false) { const b = (await page.locator(selector).boundingBox())!; await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 8 }); if (cancel) await page.keyboard.press('Escape'); await page.mouse.up(); }
async function exportProject(project: Project, name: string) { const path = join(out, `${name}.mp4`); await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path); await page.evaluate(p => window.editor.exportProject(p), project); return path; }
const framePixels = async (path: string, frame: number, png = false) => (await run(binPath(root, 'ffmpeg'), ['-v', 'error', '-i', path, '-vf', `select=eq(n\\,${frame}),format=rgb24`, '-frames:v', '1', ...(png ? ['-c:v', 'png', '-f', 'image2pipe'] : ['-f', 'rawvideo']), 'pipe:1'])).stdout;
try {
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '＋ 전체 제목', exact: true }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(1);
  await page.getByRole('tab', { name: '문구', exact: true }).click(); await page.getByRole('textbox', { name: '부분 서식 문구' }).fill('오늘은 손글씨와 큰 글자');
  await selectText(4, 8); await page.getByRole('combobox', { name: '선택 글자 글꼴' }).selectOption('nanumpen'); await number('선택 글자 크기', '60');
  await expect.poll(async () => textStyleAt((await state()).captions[0].runs, 4)).toMatchObject({ font: 'nanumpen', size: 60, weight: 400 });
  await selectText(9, 13); await page.getByRole('combobox', { name: '선택 글자 글꼴' }).selectOption('serif'); await number('선택 글자 크기', '90'); await color('선택 글자 색상', '#163046');
  await expect.poll(async () => textStyleAt((await state()).captions[0].runs, 10)).toMatchObject({ font: 'serif', size: 90 });
  const beforeTyping = (await state()).captions[0].runs;
  const editor = page.getByRole('textbox', { name: '부분 서식 문구' }); await editor.click(); await editor.press('Control+End'); await editor.pressSequentially('!'); await editor.blur();
  expect(textStyleAt((await state()).captions[0].runs, 4)).toEqual(textStyleAt(beforeTyping, 4));
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(editor).toHaveValue('오늘은 손글씨와 큰 글자');
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click(); await page.getByRole('button', { name: '자막 가운데 중앙', exact: true }).click();
  await page.getByRole('checkbox', { name: '배경 그라데이션 사용', exact: true }).check(); await number('배경 불투명도 (%)', '100');
  await color('그라데이션 시작 색상', '#fff0aa'); await color('그라데이션 끝 색상', '#92d5ed'); await number('그라데이션 각도', '135');
  await expect.poll(async () => effectiveStyle(await state(), (await state()).captions[0]).gradient).toEqual({ angle: 135, from: '#fff0aa', to: '#92d5ed' });
  const beforeResize = await state(), title = beforeResize.captions[0], titleStyle = effectiveStyle(beforeResize, title);
  const sizedBitmap = await page.evaluate(r => window.editor.captionBitmap(r), { text: title.text, runs: title.runs, style: titleStyle, width: base.settings.width, height: base.settings.height });
  await expect.poll(() => page.getByTestId('caption-object').locator('img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(sizedBitmap.width);
  await drag('[data-testid="caption-object"] .caption-resize', 20, 8);
  await expect.poll(async () => textStyleAt((await state()).captions[0].runs, 4).size!).toBeGreaterThan(60);
  const resized = await state(); expect(textStyleAt(resized.captions[0].runs, 4).size! / 60).toBeCloseTo(effectiveStyle(resized, resized.captions[0]).size / titleStyle.size, 5);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).captions[0].runs).toEqual(title.runs);
  // Sample the background away from text to verify both gradient directions, not just saved settings.
  const gradientSamples = [];
  for (const angle of [90, 180]) {
    const bitmap = await page.evaluate(r => window.editor.captionBitmap(r), { text: 'MMMMMMMM', style: { ...titleStyle, font: 'sans' as const, size: 40, opacity: 1, padding: 40, radius: 0, outline: 0, outer: 0, shadow: 0, gradient: { angle, from: '#ff0000', to: '#0000ff' } }, width: 1920, height: 1080 });
    const pixels = await page.evaluate(async b => { const img = new Image(); img.src = b.url; await img.decode(); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); return [[12, 12], [b.width - 13, 12], [12, b.height - 13]].map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data)); }, bitmap);
    expect(pixels[0][0]).toBeGreaterThan(pixels[0][2]); const end = angle === 90 ? pixels[1] : pixels[2]; expect(end[2]).toBeGreaterThan(end[0]); gradientSamples.push({ angle, pixels });
  }
  await page.getByRole('button', { name: '모두 선택', exact: true }).click(); await page.getByRole('textbox', { name: '새 글 그룹 이름' }).fill('손글씨 그라데이션'); await page.getByRole('button', { name: '선택한 글·꾸미기 저장' }).click();
  await expect.poll(async () => (await page.evaluate(() => window.editor.captionPresets())).groups.length).toBe(1);
  const group = (await page.evaluate(() => window.editor.captionPresets())).groups[0]; expect(group.items[0].runs).toEqual((await state()).captions[0].runs); expect(group.items[0].style.gradient?.angle).toBe(135);
  await page.locator('.group-library summary').click(); await page.getByRole('combobox', { name: '저장한 글 그룹' }).selectOption(group.id); await page.getByRole('button', { name: '그룹 불러오기', exact: true }).click();
  await expect.poll(async () => (await state()).captions.length).toBe(2); expect((await state()).captions[1].runs).toEqual(group.items[0].runs);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(1);
  await page.locator('.library-tabs').getByRole('button', { name: '꾸미기', exact: true }).click(); await page.getByRole('button', { name: '＋ 사각형', exact: true }).click();
  await expect.poll(async () => (await state()).decorations.length).toBe(1); const rectId = (await state()).decorations[0].id;
  await color('도형 색상', '#3cac89'); await number('도형 가로 위치 (%)', '10'); await number('도형 세로 위치 (%)', '62'); await number('도형 너비 (%)', '35'); await number('도형 높이 (%)', '20'); await number('도형 둥글기', '50'); await number('도형 테두리 두께', '4');
  const shapeSelector = `[data-testid="decoration-object"][data-shape-id="${rectId}"]`;
  await expect.poll(async () => (await state()).decorations[0].x).toBe(.1);
  await drag(shapeSelector, 25, -12); await expect.poll(async () => (await state()).decorations[0].x).toBeGreaterThan(.1);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).decorations[0].x).toBe(.1);
  await drag(shapeSelector, 25, -12, true); await expect.poll(async () => (await state()).decorations[0].x).toBe(.1);
  await drag(`${shapeSelector} .caption-resize`, 20, 10); await expect.poll(async () => (await state()).decorations[0].width).toBeGreaterThan(.35);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).decorations[0].width).toBe(.35);
  await page.getByRole('button', { name: '도형 복제', exact: true }).click(); await expect.poll(async () => (await state()).decorations.length).toBe(2);
  await page.getByRole('button', { name: '도형 삭제', exact: true }).click(); await expect.poll(async () => (await state()).decorations.length).toBe(1);
  await page.getByRole('button', { name: '＋ 타원', exact: true }).click(); await expect.poll(async () => (await state()).decorations.length).toBe(2); const ellipseId = (await state()).decorations[1].id;
  await color('도형 색상', '#ffb551'); await number('도형 가로 위치 (%)', '60'); await number('도형 세로 위치 (%)', '18'); await number('도형 너비 (%)', '24'); await number('도형 높이 (%)', '30'); await number('도형 불투명도 (%)', '65'); await number('도형 시작 초', '1.5');
  await page.getByRole('combobox', { name: '도형 글과의 순서' }).selectOption('front');
  await page.getByRole('button', { name: '도형 맨 뒤로' }).click(); await expect.poll(async () => (await state()).decorations[1].zOrder).toBe(0);
  await seek(44); await expect(page.getByTestId('decoration-object')).toHaveCount(1); await seek(45); await expect(page.getByTestId('decoration-object')).toHaveCount(2);
  const project = await state(), exported = await exportProject(project, '혼합 글꼴과 꾸미기'), bare = await exportProject({ ...project, captions: [], decorations: [] }, '비교 배경');
  expect(Number((await probe(root, exported)).streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(90);
  const comparisons = [];
  for (const n of [0, 44, 45, 89]) {
    await seek(n); await expect(page.getByTestId('decoration-object')).toHaveCount(n < 45 ? 1 : 2);
    const bitmaps = await Promise.all(activeCaptionSpans(project, n).map(async span => { const style = effectiveStyle(project, span.caption), bitmap = await page.evaluate(r => window.editor.captionBitmap(r), { text: span.caption.text, runs: span.caption.runs, style, width: project.settings.width, height: project.settings.height }); return { bitmap, rect: captionRect(bitmap, style, project.settings, project.captionSettings.margins) }; }));
    const shapes = await Promise.all(activeDecorations(project, n).map(async shape => ({ shape, svg: await page.locator(`[data-shape-id="${shape.id}"] svg`).evaluate(svg => svg.outerHTML) })));
    const bg = await framePixels(bare, n, true);
    const expectedUrl = await page.evaluate(async ({ settings, bg, bitmaps, shapes }) => {
      const c = document.createElement('canvas'); c.width = settings.width; c.height = settings.height; const ctx = c.getContext('2d')!;
      const load = async (url: string) => { const img = new Image(); img.src = url; await img.decode(); return img; }; ctx.drawImage(await load(bg), 0, 0);
      const draw = async (item: typeof shapes[number]) => { const s = item.shape, svg = item.svg.replace('width="100%"', `width="${s.width * c.width}"`).replace('height="100%"', `height="${s.height * c.height}"`).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '); ctx.drawImage(await load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)), s.x * c.width, s.y * c.height, s.width * c.width, s.height * c.height); };
      for (const s of shapes.filter(s => s.shape.layer === 'behind')) await draw(s);
      for (const b of bitmaps) ctx.drawImage(await load(b.bitmap.url), b.rect.left, b.rect.top);
      for (const s of shapes.filter(s => s.shape.layer === 'front')) await draw(s);
      return c.toDataURL('image/png');
    }, { settings: project.settings, bg: `data:image/png;base64,${bg.toString('base64')}`, bitmaps, shapes });
    const reference = join(out, `frame-${n}.png`); await writeFile(reference, Buffer.from(expectedUrl.split(',')[1], 'base64'));
    const [expected, actual, background] = await Promise.all([framePixels(reference, 0), framePixels(exported, n), framePixels(bare, n)]);
    let sum = 0, ink = 0, count = 0; for (let i = 0; i < expected.length; i++) { const e = Math.abs(expected[i] - actual[i]); sum += e; if (Math.abs(expected[i] - background[i]) > 20) { ink += e; count++; } }
    const mean = sum / expected.length, inkMean = ink / count; expect(mean).toBeLessThan(3); expect(inkMean).toBeLessThan(12); comparisons.push({ frame: n, mean, inkMean });
  }
  const shapeOnly = await exportProject({ ...project, captions: [] }, '도형만 출력'); expect(Number((await probe(root, shapeOnly)).streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(90);
  const [shapePixels, barePixels] = await Promise.all([framePixels(shapeOnly, 0), framePixels(bare, 0)]);
  expect(shapePixels.reduce((n, v, i) => n + Math.abs(v - barePixels[i]), 0) / shapePixels.length).toBeGreaterThan(2);
  await selectShape(ellipseId); await seek(45); await page.screenshot({ path: join(out, '01-decoration.png') });
  await app.close(); app = await launch(); page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message)); await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('caption-block')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  expect((await state()).captions).toEqual(project.captions); expect((await state()).decorations).toEqual(project.decorations);
  await page.getByRole('button', { name: /자막 목록/ }).click(); await page.locator('.caption-list-item > button').click(); await page.getByRole('tab', { name: '문구', exact: true }).click(); await selectText(4, 8);
  await expect(page.getByRole('combobox', { name: '선택 글자 글꼴' })).toHaveValue('nanumpen'); await expect(page.getByRole('spinbutton', { name: '선택 글자 크기', exact: true })).toHaveValue('60');
  await expect.poll(() => page.evaluate(() => document.fonts.check('400 60px VlogNanumPen'))).toBe(true);
  await page.screenshot({ path: join(out, '02-rich-text.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1100, 760)); await page.getByRole('combobox', { name: '선택 글자 글꼴' }).scrollIntoViewIfNeeded(); await page.screenshot({ path: join(out, '03-small-window.png') });
  expect(errors).toEqual([]); const report = { out, exported, shapeOnly, comparisons, errors, checks: ['keyboard text selection and three mixed fonts/sizes', 'Nanum Pen font loads', 'typing and undo preserve runs', 'gradient colors and 135-degree angle', 'group save/load retains runs and gradient', 'shape add/move/resize/duplicate/delete and undo/Escape', 'shape layer and timing boundary', 'preview SVG+bitmap versus MP4 pixels', 'shape-only export', 'restart and small window'] }; await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(join(root, 'artifacts/latest-rich-decoration.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { await page.screenshot({ path: join(out, 'failure.png') }); console.error(await page.locator('body').innerText()); throw error; }
finally { await app.close(); }
