import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ProjectSchema, type Project } from '../src/shared/project';
import { addCaption } from '../src/shared/captions';

const root = resolve('.'), id = `caption-snap-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id), recovery = join(data, 'work/recovery.vlog.json');
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
let p = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
p.clips = [{ ...p.clips[0], inFrame: 0, outFrame: 120 }]; p.captions = []; p.decorations = []; p.settings = { ...p.settings, width: 1920, height: 1080 };
for (const kind of ['title', 'normal', 'normal', 'emphasis'] as const) p = addCaption(p, p.clips[0].id, kind, 0).project;
const [a, b, c, hidden] = p.captions.map(x => x.id);
p.captions = p.captions.map((cap, i) => ({ ...cap, text: ['위쪽 자막 기준', '아래 자막', '세 번째 줄', '나중에 보일 자막'][i],
  inFrame: i === 3 ? 60 : 0, outFrame: i === 0 ? 0 : 120, overrides: { ...cap.overrides, size: [64, 48, 44, 60][i], opacity: 1, background: '#ffffff', color: '#152d24', padding: 18,
    position: { h: 0, v: 0, x: [.15, .58, .72, .22][i], y: [.15, .6, .79, .39][i] } } }));
await writeFile(recovery, JSON.stringify(p));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: data } });
let app = await launch(), page = await app.firstWindow(); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
const state = async (): Promise<Project> => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
const object = (id: string) => page.locator(`[data-testid="caption-object"][data-caption-id="${id}"]`);
const bounds = async (id: string) => (await object(id).boundingBox())!;
const scale = async () => (await page.getByTestId('preview-canvas').boundingBox())!.width / (await state()).settings.width;
const position = async (id: string) => (await state()).captions.find(c => c.id === id)!.overrides.position;
async function recover() {
  await page.getByRole('button', { name: '작업 복구' }).click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator('.task-overlay')).toHaveCount(0); await expect(page.getByTestId('caption-object')).toHaveCount(3);
  await expect(object(hidden)).toHaveCount(0);
}
async function dragTo(id: string, x: number, y: number, alt = false) {
  const box = await bounds(id);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.down(); await page.mouse.move(x + box.width / 2, y + box.height / 2, { steps: 10 });
}
async function release(alt = false) { await page.mouse.up(); if (alt) await page.keyboard.up('Alt'); await expect(page.locator('.caption-guides')).toHaveCount(0); }
async function undo() { await page.getByRole('button', { name: '실행 취소', exact: true }).click(); }
async function redo() { await page.getByRole('button', { name: '다시 실행', exact: true }).click(); }
try {
  await recover(); const before = await position(b), s = await scale(), aBox = await bounds(a), bBox = await bounds(b);
  const desired = { x: aBox.x + (aBox.width - bBox.width) / 2, y: aBox.y + aBox.height + 24 * s };
  await dragTo(b, desired.x + 2, desired.y + 2);
  await expect(page.getByTestId('caption-snap-alignment')).not.toHaveCount(0); await expect(page.getByTestId('caption-snap-gap')).toHaveCount(1);
  await expect(page.locator('.caption-guides')).toContainText('자막 기준 정렬'); await expect(page.locator('.caption-snap-gap-label')).toHaveText('24 px');
  await expect.poll(async () => Math.abs((await bounds(b)).x - desired.x)).toBeLessThan(1);
  await expect.poll(async () => Math.abs((await bounds(b)).y - desired.y)).toBeLessThan(1);
  await page.screenshot({ path: join(out, 'stacked-caption.png') }); await release();
  await expect.poll(() => position(b)).not.toEqual(before); const snapped = await position(b);
  await undo(); await expect.poll(() => position(b)).toEqual(before); await redo(); await expect.poll(() => position(b)).toEqual(snapped);

  // Alt and the toggle allow fine movement inside the normal attraction distance.
  await dragTo(b, desired.x + 5, desired.y + 5, true); await expect(page.getByTestId('caption-snap-gap')).toHaveCount(0);
  await release(true); await expect.poll(async () => Math.abs((await bounds(b)).x - desired.x - 5)).toBeLessThan(1);
  await undo(); await expect.poll(() => position(b)).toEqual(snapped);
  await page.getByRole('button', { name: '자석 켜짐', exact: true }).click(); await dragTo(b, desired.x + 5, desired.y + 5);
  await expect(page.getByTestId('caption-snap-alignment')).toHaveCount(0); await release();
  await expect.poll(async () => Math.abs((await bounds(b)).y - desired.y - 5)).toBeLessThan(1);
  await undo(); await expect.poll(() => position(b)).toEqual(snapped); await page.getByRole('button', { name: '자석 꺼짐', exact: true }).click();

  // Use a custom 70 px gap, then repeat that gap for a third caption.
  await dragTo(b, desired.x, aBox.y + aBox.height + 70 * s, true); await release(true);
  const second = await bounds(b), third = await bounds(c), thirdBefore = await position(c);
  const gap = second.y - aBox.y - aBox.height;
  await dragTo(c, second.x + (second.width - third.width) / 2 + 1, second.y + second.height + gap + 1);
  await expect(page.locator('.caption-guides')).toContainText('같은 간격'); await expect(page.getByTestId('caption-snap-gap')).toHaveCount(2);
  await expect.poll(async () => Math.abs((await bounds(c)).y - second.y - second.height - gap)).toBeLessThan(1);
  await page.screenshot({ path: join(out, 'equal-spacing.png') });
  await page.keyboard.press('Escape'); await release(); await expect.poll(() => position(c)).toEqual(thirdBefore);
  await dragTo(c, second.x + (second.width - third.width) / 2 + 1, second.y + second.height + gap + 1); await release();
  await expect.poll(() => position(c)).not.toEqual(thirdBefore);

  // Left and right edge alignment still work when captions have different widths.
  let current = await bounds(b); await dragTo(b, aBox.x + 2, current.y, false); await release();
  await expect.poll(async () => Math.abs((await bounds(b)).x - aBox.x)).toBeLessThan(1); await undo();
  current = await bounds(b); await dragTo(b, aBox.x + aBox.width - current.width - 2, current.y); await release();
  await expect.poll(async () => { const box = await bounds(b); return Math.abs(box.x + box.width - aBox.x - aBox.width); }).toBeLessThan(1); await undo();

  // A hidden caption at a later time cannot create a guide or a target outline.
  await expect(object(hidden)).toHaveCount(0);
  const ids = await page.getByTestId('caption-object').evaluateAll(nodes => nodes.map(n => (n as HTMLElement).dataset.captionId)); expect(ids).not.toContain(hidden);
  const preserved = (await state()).captions;
  await app.close(); app = await launch(); page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message)); await recover();
  expect((await state()).captions).toEqual(preserved);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1100, 760));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(1100);
  await page.getByRole('combobox', { name: '프로젝트 화면 비율' }).selectOption('9:16');
  await expect.poll(async () => (await state()).settings.width).toBe(1080);
  const smallA = await bounds(a), smallB = await bounds(b), smallScale = await scale();
  await dragTo(b, smallA.x + (smallA.width - smallB.width) / 2 + 1, smallA.y + smallA.height + 24 * smallScale + 1);
  await expect(page.getByTestId('caption-snap-gap')).not.toHaveCount(0);
  await page.screenshot({ path: join(out, 'small-portrait.png') }); await release();
  await page.getByRole('button', { name: '크게 보기', exact: true }).click();
  const largeA = await bounds(a), largeB = await bounds(b), largeScale = await scale();
  await dragTo(b, largeA.x + (largeA.width - largeB.width) / 2 + 4, largeA.y + largeA.height + 24 * largeScale + 4);
  await expect(page.getByTestId('caption-snap-gap')).not.toHaveCount(0);
  await page.screenshot({ path: join(out, 'large-preview.png') }); await release();
  expect(errors).toEqual([]);
  const report = { out, errors, checks: ['caption/title center and edge alignment', '24 px stack gap and visible guides', 'Alt and snap toggle bypass', 'repeat custom 70 px gap with three captions', 'Escape and one-step undo/redo', 'only active captions are targets', 'restart preserves positions', 'portrait canvas and small window'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(join(root, 'artifacts/latest-caption-snap.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (e) { await page.screenshot({ path: join(out, 'failure.png') }); throw e; } finally { await app.close(); }
