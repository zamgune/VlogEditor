import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSchema, type Project } from '../src/shared/project';
import { addCaption, captionRange, activeCaptionSpans, captionSpans, effectiveStyle, captionRect } from '../src/shared/captions';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';

const root = resolve('.'), id = `caption-timing-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
let base = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
base.captions = []; base.narrations = []; base.clips = base.clips.slice(0, 1).map(c => ({ ...c, inFrame: 30, outFrame: 120 }));
const added = addCaption(base, base.clips[0].id, 'normal', 30), first = added.id;
base = captionRange(added.project, first, 30, 45);
base.captions[0].inFrame = 0; // A previously trimmed video hides this part of the caption.
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(base));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env: { ...env, VLOGTOOL_TEST_DATA: data } });
let app = await launch(), page = await app.firstWindow(); const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
const range = async (id: string) => { const c = (await state()).captions.find(c => c.id === id)!; return [c.inFrame, c.outFrame]; };
const select = async (id: string) => { await page.getByRole('button', { name: /자막 목록/ }).click(); await page.locator(`.caption-list-item[data-caption-id="${id}"] > button`).click(); };
const block = (id: string) => page.locator(`[data-testid="caption-block"][data-caption-id="${id}"]`);
async function drag(id: string, deltaFrames: number, edge?: 'start' | 'end', cancel = false) {
  const item = edge ? block(id).locator(`.caption-edge.${edge}`) : block(id); await item.scrollIntoViewIfNeeded();
  const box = (await item.boundingBox())!; const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + deltaFrames * 2, y, { steps: 10 });
  if (cancel) await page.keyboard.press('Escape'); await page.mouse.up();
}
async function number(label: string, value: string) {
  const input = page.getByRole('spinbutton', { name: label, exact: true });
  await input.fill(value); await input.press('Enter');
}
async function seek(frame: number) {
  const ruler = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(ruler.x + frame * 2, ruler.y + 20);
}
async function visible(ids: string[]) {
  await expect.poll(async () => (await page.getByTestId('caption-object').evaluateAll(els => els.map(el => el.getAttribute('data-caption-id')))).sort()).toEqual([...ids].sort());
}
async function textAndPosition(id: string, text: string, position: string) {
  await select(id); await page.locator(`textarea[aria-label="자막 문장 ${id}"]`).fill(text);
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click(); await page.getByRole('button', { name: position, exact: true }).click();
}
async function exportProject(project: Project, name: string) {
  const path = join(out, `${name}.mp4`);
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
  await page.evaluate(p => window.editor.exportProject(p), project); return path;
}
try {
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await select(first);
  await block(first).click(); expect(await range(first)).toEqual([0, 45]);
  const original = (await block(first).boundingBox())!;
  await page.mouse.move(original.x + original.width / 2, original.y + 12); await page.mouse.down();
  await page.mouse.move(original.x + original.width / 2 + 60, original.y + 12, { steps: 5 });
  await page.mouse.move(original.x + original.width / 2, original.y + 12, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => range(first)).toEqual([0, 45]);
  // Reproduces movement getting stuck at the caption's original end, growing its duration.
  await drag(first, 60); await expect.poll(() => range(first)).toEqual([90, 105]);
  await drag(first, -60); await expect.poll(() => range(first)).toEqual([30, 45]);
  await drag(first, 120); await expect.poll(() => range(first)).toEqual([105, 120]);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(() => range(first)).toEqual([30, 45]);
  await drag(first, 60, undefined, true); await expect.poll(() => range(first)).toEqual([30, 45]);
  await drag(first, 30, 'end'); await expect.poll(() => range(first)).toEqual([30, 75]);
  await drag(first, 15, 'start'); await expect.poll(() => range(first)).toEqual([45, 75]);
  await number('자막 시작 초', '0'); await expect.poll(() => range(first)).toEqual([30, 75]);
  await seek(45); await page.getByRole('button', { name: '＋ 자막', exact: true }).click();
  await expect.poll(async () => (await state()).captions.length).toBe(2);
  const second = (await state()).captions[1].id;
  await expect.poll(() => range(second)).toEqual([75, 120]);
  await expect(page.getByRole('spinbutton', { name: '자막 시작 초', exact: true })).toHaveValue('1.5');
  await seek(44); await visible([first]); await seek(45); await visible([second]);
  // Two independent captions per half, with unique screen regions for output verification.
  await select(first); await page.getByRole('button', { name: '자막 복제', exact: true }).click();
  await expect.poll(async () => (await state()).captions.length).toBe(3); const firstPair = (await state()).captions[2].id;
  await select(second); await page.getByRole('button', { name: '자막 복제', exact: true }).click();
  await expect.poll(async () => (await state()).captions.length).toBe(4); const secondPair = (await state()).captions[3].id;
  await textAndPosition(first, '1번 자막', '자막 아래 왼쪽'); await textAndPosition(firstPair, '2번 자막', '자막 위 왼쪽');
  await textAndPosition(second, '3번 자막', '자막 아래 오른쪽'); await textAndPosition(secondPair, '4번 자막', '자막 위 오른쪽');
  for (const frame of [0, 44, 45, 89]) { await seek(frame); await visible(frame < 45 ? [first, firstPair] : [second, secondPair]); }
  // Crossing the old edge and overlapping other rows preserves length and remains a single undo.
  await select(first); await drag(first, 45); await expect.poll(() => range(first)).toEqual([75, 120]);
  await visible([first, second, secondPair]);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(() => range(first)).toEqual([30, 75]);
  await select(first); await seek(45); await page.getByRole('button', { name: '현재 위치로 이동', exact: true }).click(); await expect.poll(() => range(first)).toEqual([75, 120]);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(() => range(first)).toEqual([30, 75]);
  await number('자막 길이 초', '1'); await expect.poll(() => range(first)).toEqual([30, 60]);
  await number('자막 길이 초', '1.5'); await expect.poll(() => range(first)).toEqual([30, 75]);
  const startInput = page.getByRole('spinbutton', { name: '자막 시작 초', exact: true });
  await startInput.fill('1'); await startInput.press('Escape'); await expect(startInput).toHaveValue('0');
  await startInput.fill(''); await startInput.blur(); await expect(startInput).toHaveValue('0');
  // Saved groups preserve the two time slots rather than resetting them to the clip start.
  await page.getByRole('button', { name: '모두 선택', exact: true }).click(); await page.getByRole('textbox', { name: '새 글 그룹 이름' }).fill('1.5초씩 두 자막');
  await page.getByRole('button', { name: '선택한 글을 새 그룹으로 저장' }).click();
  await expect.poll(async () => (await page.evaluate(() => window.editor.captionPresets())).groups.length).toBe(1);
  const group = (await page.evaluate(() => window.editor.captionPresets())).groups[0];
  expect(group.items.map(i => [i.startFrame, i.endFrame])).toEqual([[0, 45], [45, 90], [0, 45], [45, 90]]);
  await page.locator('.group-library summary').click(); await page.getByRole('combobox', { name: '저장한 글 그룹' }).selectOption(group.id);
  await page.getByRole('button', { name: '그룹 불러오기', exact: true }).click();
  await expect.poll(async () => (await state()).captions.length).toBe(8);
  expect((await state()).captions.slice(4).map(c => [c.inFrame, c.outFrame])).toEqual([[30, 75], [75, 120], [30, 75], [75, 120]]);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(4);
  const project = await state(), exported = await exportProject(project, '두 자막씩 교체'), bare = await exportProject({ ...project, captions: [] }, '비교 배경');
  expect(Number((await probe(root, exported)).streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(90);
  const differences: unknown[] = [];
  for (const caption of project.captions) {
    const style = effectiveStyle(project, caption), bitmap = await page.evaluate(r => window.editor.captionBitmap(r), { text: caption.text, style, width: project.settings.width, height: project.settings.height });
    const rect = captionRect(bitmap, style, project.settings, project.captionSettings.margins); expect(rect.overflow).toBe(false);
    for (const frame of [0, 44, 45, 89]) {
      const pixels = async (path: string) => (await run(binPath(root, 'ffmpeg'), ['-v', 'error', '-i', path, '-vf', `select=eq(n\\,${frame}),crop=${rect.width}:${rect.height}:${rect.left}:${rect.top},format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])).stdout;
      const [actual, background] = await Promise.all([pixels(exported), pixels(bare)]);
      const mean = actual.reduce((sum, v, i) => sum + Math.abs(v - background[i]), 0) / actual.length;
      const active = activeCaptionSpans(project, frame).some(s => s.caption.id === caption.id);
      if (active) expect(mean).toBeGreaterThan(10); else expect(mean).toBeLessThan(1);
      differences.push({ text: caption.text, frame, active, mean });
    }
  }
  await select(first); await seek(0); await visible([first, firstPair]);
  await page.locator('.caption-timing').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(out, '01-first-half.png') });
  await select(second); await seek(45); await visible([second, secondPair]); await page.screenshot({ path: join(out, '02-second-half.png') });
  await app.close(); app = await launch(); page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('caption-block')).toHaveCount(4, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  expect((await state()).captions).toEqual(project.captions);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1100, 760));
  await select(first); await page.locator('.caption-timing').scrollIntoViewIfNeeded(); await expect(page.getByRole('spinbutton', { name: '자막 시작 초', exact: true })).toBeInViewport(); await page.screenshot({ path: join(out, '03-small-window.png') });
  expect(errors).toEqual([]);
  const report = { out, exported, differences, errors, checks: ['reproduced old stuck start (44 instead of 90)', 'move beyond old edges in both directions', 'clip end clamp preserves length', 'trim both edges', 'undo and Escape', 'new normal at playhead', '3-second trimmed source: sequential and overlapping pairs at frames 44/45', 'cross overlapping rows', 'move to playhead', 'length and decimal fields; blank and Escape', 'group round trip retains independent timing', '90-frame MP4 with 16 region/boundary checks', 'restart persistence', 'small window timing fields'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(join(root, 'artifacts/latest-caption-timing.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { await page.screenshot({ path: join(out, 'failure.png') }); throw error; }
finally { await app.close(); }
