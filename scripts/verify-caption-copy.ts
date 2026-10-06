import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSchema, type Project } from '../src/shared/project';
import { addCaption, captionRange, effectiveStyle } from '../src/shared/captions';
import { formatTextRange } from '../src/shared/rich-text';

const root = resolve('.'), id = `caption-copy-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
let base = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
base.captions = []; base.narrations = []; base.decorations = []; base.clips = base.clips.slice(0, 1).map(c => ({ ...c, inFrame: 30, outFrame: 120 }));
const added = addCaption(base, base.clips[0].id, 'normal', 30), first = added.id;
base = captionRange(added.project, first, 30, 45); base.captions[0].inFrame = 0;
base.captions[0].text = '복사할 예쁜 자막'; base.captions[0].runs = formatTextRange(base.captions[0].text, [], 4, 6, { font: 'nanumpen', size: 80 });
base.captions[0].overrides.gradient = { angle: 135, from: '#ffaacc', to: '#99bbff', mode: 'hard' };
const block = addCaption(base, base.clips[0].id, 'emphasis', 45); base = captionRange(block.project, block.id, 45, 60);
base.captions[1].text = '이미 있는 자막';
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(base));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env: { ...env, VLOGTOOL_TEST_DATA: data } });
let app = await launch(), page = await app.firstWindow(); const errors: string[] = [];
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
async function ready() { await page.evaluate('globalThis.__name = (fn) => fn'); page.on('pageerror', e => errors.push(e.message)); await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0); }
async function select(id: string) { await page.getByRole('button', { name: /자막 목록/ }).click(); await page.locator(`.caption-list-item[data-caption-id="${id}"] > button`).click(); }
async function undoCount(count: number) { await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(count); }
async function openProject(p: Project) { const path = join(out, '다른 프로젝트.vlog.json'); await writeFile(path, JSON.stringify(p)); await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, path); await page.getByRole('button', { name: '열기', exact: true }).click(); await expect(page.locator('footer')).toContainText('프로젝트 열기 완료'); await expect(page.locator('.task-overlay')).toHaveCount(0); }
async function openOptions() { if (!await page.locator('.caption-copy-options').evaluate(el => (el as HTMLDetailsElement).open)) await page.locator('.caption-copy-options summary').click(); }
try {
  await ready(); await select(first); await openOptions();
  const option = page.getByRole('checkbox', { name: '복제할 때 뒤쪽 빈 시간에 자동 배치', exact: true }); await expect(option).not.toBeChecked();
  const editor = page.locator(`textarea[aria-label="자막 문장 ${first}"]`); await editor.focus();
  // Native editing retains the clipboard key events; this check does not touch the OS clipboard.
  const passthrough = await editor.evaluate(el => ['KeyC', 'KeyV'].map(code => el.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'KeyC' ? 'c' : 'v', ctrlKey: true, bubbles: true, cancelable: true }))));
  expect(passthrough).toEqual([true, true]); expect((await state()).captions.length).toBe(2);
  // Clicking a timeline item must take focus away from a previously edited textarea.
  const firstBlock = page.locator(`[data-testid="caption-block"][data-caption-id="${first}"]`); await firstBlock.click(); await expect(firstBlock).toBeFocused();
  await page.keyboard.press('Control+c'); await expect(page.locator('footer')).toContainText('자막을 복사했습니다');
  await editor.fill('복사 후 바뀐 원문'); await editor.blur(); await firstBlock.click(); await page.keyboard.press('Control+v');
  await expect.poll(async () => (await state()).captions.length).toBe(3); let pasted = (await state()).captions.at(-1)!;
  expect(pasted.text).toBe('복사할 예쁜 자막'); expect(pasted.runs).toEqual(base.captions[0].runs); expect([pasted.inFrame, pasted.outFrame]).toEqual([0, 45]);
  expect(effectiveStyle(await state(), pasted).gradient?.mode).toBe('hard'); await undoCount(2);
  await option.check(); // Ctrl+V also works directly after checking the option.
  await page.keyboard.press('Control+v'); await expect.poll(async () => (await state()).captions.length).toBe(3);
  const sequence = [[60, 75], [75, 90], [90, 105], [105, 120]];
  pasted = (await state()).captions.at(-1)!; expect([pasted.inFrame, pasted.outFrame]).toEqual(sequence[0]);
  for (let i = 1; i < sequence.length; i++) { await page.keyboard.press('Control+v'); await expect.poll(async () => (await state()).captions.length).toBe(3 + i); pasted = (await state()).captions.at(-1)!; expect([pasted.inFrame, pasted.outFrame]).toEqual(sequence[i]); }
  await page.keyboard.press('Control+v'); await expect.poll(async () => (await state()).captions.length).toBe(7); pasted = (await state()).captions.at(-1)!; expect([pasted.inFrame, pasted.outFrame]).toEqual([0, 45]);
  await undoCount(6); await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(7); await undoCount(6);
  for (let n = 5; n >= 2; n--) await undoCount(n);
  // The existing duplicate button uses the same placement rule, with its current text.
  await select(first); await page.getByRole('button', { name: '자막 복제', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(3);
  pasted = (await state()).captions.at(-1)!; expect([pasted.inFrame, pasted.outFrame]).toEqual([60, 75]); expect(pasted.text).toBe('복사 후 바뀐 원문'); await undoCount(2);
  // A full-video title stays a title even when auto placement is enabled.
  await page.getByRole('button', { name: '＋ 전체 제목', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(3);
  await page.getByRole('button', { name: '자막 복제', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(4);
  expect((await state()).captions.at(-1)!.kind).toBe('title'); await undoCount(3); await undoCount(2);
  // Korean keyboard layout keys still identify the physical Ctrl+C / Ctrl+V keys.
  await select(first); await firstBlock.focus(); await firstBlock.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㅊ', code: 'KeyC', ctrlKey: true, bubbles: true, cancelable: true })));
  const other = { ...structuredClone(base), id: crypto.randomUUID(), captions: [] }; other.clips[0].id = crypto.randomUUID(); other.captionSettings.normal.size = 140;
  await openProject(other); await page.keyboard.press('Control+v'); await expect.poll(async () => (await state()).captions.length).toBe(1);
  pasted = (await state()).captions[0]; expect(pasted.text).toBe('복사 후 바뀐 원문'); expect([pasted.inFrame, pasted.outFrame]).toEqual([30, 45]); expect(effectiveStyle(await state(), pasted).size).toBe(54);
  await app.close(); app = await launch(); page = await app.firstWindow(); await ready(); await select(pasted.id); await openOptions();
  await expect(page.getByRole('checkbox', { name: '복제할 때 뒤쪽 빈 시간에 자동 배치', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: '붙여넣기 Ctrl+V', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '복사 Ctrl+C', exact: true }).click(); await page.getByRole('button', { name: '붙여넣기 Ctrl+V', exact: true }).click();
  await expect.poll(async () => (await state()).captions.length).toBe(2); expect([(await state()).captions[1].inFrame, (await state()).captions[1].outFrame]).toEqual([45, 60]);
  await page.screenshot({ path: join(out, 'copy-options.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1100, 760)); await page.locator('.caption-copy-options').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(out, 'small-window.png') });
  expect(errors).toEqual([]); const report = { out, errors, checks: ['Ctrl+C snapshot and Ctrl+V rich style copy', 'native text clipboard events untouched', 'timeline click restores caption keyboard focus', 'disabled option preserves original hidden timing', 'checkbox-focused shortcut', 'four sequential gaps skip existing emphasis', 'no room falls back without shortening', 'Undo/Redo and duplicate button', 'full-video title duplication', 'Korean-layout physical shortcuts', 'cross-project paste retains style and visible length', 'option survives restart while clipboard resets', 'copy/paste buttons and small window'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(join(root, 'artifacts/latest-caption-copy.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { await page.screenshot({ path: join(out, 'failure.png') }); throw error; }
finally { await app.close(); }
