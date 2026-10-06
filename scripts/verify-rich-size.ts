import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSchema } from '../src/shared/project';
import { textStyleAt } from '../src/shared/rich-text';
import { effectiveStyle } from '../src/shared/captions';

const root = resolve('.'), id = `rich-size-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
const base = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
base.captions = []; base.narrations = []; base.decorations = []; base.clips = base.clips.slice(0, 1).map(c => ({ ...c, inFrame: 30, outFrame: 120 }));
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(base));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env: { ...env, VLOGTOOL_TEST_DATA: data } });
const page = await app.firstWindow(), errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
const partialSize = async () => textStyleAt((await state()).captions[0].runs, 4).size;
async function bitmap() {
  const p = await state(), caption = p.captions[0];
  const b = await page.evaluate(r => window.editor.captionBitmap(r), { text: caption.text, runs: caption.runs, style: effectiveStyle(p, caption), width: p.settings.width, height: p.settings.height });
  await expect.poll(async () => await page.getByTestId('caption-object').locator('img').getAttribute('src') === b.url).toBe(true);
  return b;
}
try {
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '＋ 제목', exact: true }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(1);
  await page.getByRole('button', { name: '부분 서식', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '부분 서식 문구' }); await editor.fill('오늘은 손글씨와 큰 글자');
  await editor.press('Control+Home'); for (let i = 0; i < 4; i++) await editor.press('ArrowRight');
  await page.keyboard.down('Shift'); for (let i = 0; i < 4; i++) await editor.press('ArrowRight'); await page.keyboard.up('Shift');
  await page.getByRole('combobox', { name: '선택 글자 글꼴' }).selectOption('nanumpen');
  await expect.poll(async () => textStyleAt((await state()).captions[0].runs, 4).font).toBe('nanumpen');
  const initial = await state(), initialRuns = initial.captions[0].runs, before = await bitmap();
  const sample = page.locator('.rich-text-sample span');
  const unselectedSize = await sample.first().evaluate(s => getComputedStyle(s).fontSize);
  const size = page.getByRole('spinbutton', { name: '선택 글자 크기', exact: true });
  // A partly typed number must stay intact; a valid one previews while focus stays here.
  await size.fill(''); await size.pressSequentially('1'); await expect(size).toHaveValue('1');
  await size.pressSequentially('0'); await expect(size).toHaveValue('10');
  expect(await partialSize()).toBeUndefined();
  await size.pressSequentially('0'); await expect(size).toHaveValue('100'); await expect(size).toBeFocused();
  await expect.poll(partialSize).toBe(100);
  await expect.poll(() => sample.nth(1).evaluate(s => parseFloat(getComputedStyle(s).fontSize))).toBeCloseTo(100 / 3, 3);
  const enlarged = await bitmap(); expect(enlarged.width).toBeGreaterThan(before.width);
  expect(await sample.first().evaluate(s => getComputedStyle(s).fontSize)).toBe(unselectedSize);
  expect(await sample.last().evaluate(s => getComputedStyle(s).fontSize)).toBe(unselectedSize);
  expect((await state()).captions[0].overrides).toEqual(initial.captions[0].overrides);
  await size.press('ArrowUp');
  await expect(size).toHaveValue('101'); await expect.poll(partialSize).toBe(101); await bitmap();
  await size.press('Escape'); await expect.poll(async () => (await state()).captions[0].runs).toEqual(initialRuns);
  await expect(size).toHaveValue(String(effectiveStyle(initial, initial.captions[0]).size));
  // All valid previews during one numeric edit produce a single undo step.
  await size.fill('120'); await expect.poll(partialSize).toBe(120);
  await size.fill('90'); await expect.poll(partialSize).toBe(90); await size.press('Enter');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).captions[0].runs).toEqual(initialRuns);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await expect(size).toHaveValue('90');
  await size.fill(''); await size.blur(); await expect(size).toHaveValue('90');
  await size.fill('201'); await expect(size).toHaveValue('201'); expect(await partialSize()).toBe(90);
  await size.press('Enter'); await expect.poll(partialSize).toBe(200);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(size).toHaveValue('90');
  const slider = page.getByRole('slider', { name: '선택 글자 크기 슬라이더', exact: true });
  await slider.focus(); await slider.press('End'); await expect.poll(partialSize).toBe(200);
  await slider.press('Home'); await expect.poll(partialSize).toBe(16);
  await slider.press('ArrowRight'); await expect.poll(partialSize).toBe(17); await bitmap();
  await slider.blur(); await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(size).toHaveValue('90');
  // Pointer movement updates the selected word before releasing the slider.
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height / 2, { steps: 5 });
  await expect.poll(partialSize).toBeGreaterThan(120); await bitmap(); await page.mouse.up();
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(size).toHaveValue('90');
  await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await expect.poll(partialSize).toBeGreaterThan(120);
  await size.fill('60'); await expect.poll(partialSize).toBe(60); await size.blur();
  expect(textStyleAt((await state()).captions[0].runs, 4)).toEqual({ font: 'nanumpen', weight: 400, size: 60 });
  // A selection containing mixed sizes can be set to its first character's size, too.
  const mixedRuns = (await state()).captions[0].runs;
  await page.getByRole('button', { name: '문구 전체 선택', exact: true }).click();
  await size.fill(''); await size.pressSequentially(String(effectiveStyle(initial, initial.captions[0]).size));
  await expect.poll(partialSize).toBe(effectiveStyle(initial, initial.captions[0]).size);
  await size.press('Escape'); await expect.poll(async () => (await state()).captions[0].runs).toEqual(mixedRuns);
  await editor.click(); await editor.press('Control+Home'); for (let i = 0; i < 4; i++) await editor.press('ArrowRight');
  await page.keyboard.down('Shift'); for (let i = 0; i < 4; i++) await editor.press('ArrowRight'); await page.keyboard.up('Shift'); await editor.blur();
  await bitmap(); await page.screenshot({ path: join(out, 'partial-size.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1100, 760));
  await slider.scrollIntoViewIfNeeded(); await page.screenshot({ path: join(out, 'small-window.png') });
  expect(errors).toEqual([]);
  const report = { out, errors, bitmapWidths: { before: before.width, enlarged: enlarged.width }, checks: ['valid numeric input previews without blur', 'unfinished digits are not clamped', 'only selected word changes', 'actual video overlay bitmap enlarges', 'ArrowUp previews immediately', 'Escape restores exact original runs', 'one undo step per numeric edit and redo', 'empty and out-of-range input', 'slider keyboard and pointer live preview with undo/redo', 'mixed-size selection set to representative size', '1100x760 layout'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(join(root, 'artifacts/latest-rich-size.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({ path: join(out, 'failure.png') }); throw error;
} finally { await app.close(); }
