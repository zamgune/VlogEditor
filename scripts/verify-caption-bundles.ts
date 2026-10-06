import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSchema, type Project } from '../src/shared/project';
import { addCaption, captionSpans, captureCaptionGroup, effectiveStyle } from '../src/shared/captions';
import { addDecoration, decorationSpans } from '../src/shared/decoration';
import { formatTextRange } from '../src/shared/rich-text';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';

const root = resolve('.'), id = `caption-bundles-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
const base = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
base.captions = []; base.narrations = []; base.decorations = []; base.clips = base.clips.slice(0, 1).map(c => ({ ...c, inFrame: 30, outFrame: 120 }));
let source = structuredClone(base);
for (let i = 0; i < 2; i++) source = addCaption(source, source.clips[0].id, 'title', 30).project;
source.captions[0].text = '우리의 여행 이야기'; source.captions[0].overrides = { size: 60, position: { h: .5, v: .5, x: .5, y: .5 }, opacity: .9, gradient: { angle: 125, from: '#ffdfad', to: '#aacdee' } };
source.captions[0].runs = formatTextRange(source.captions[0].text, [], 4, 6, { font: 'nanumpen', size: 95 });
source.captions[1].text = '에피소드 2'; source.captions[1].overrides = { size: 30, font: 'maruburi', position: { h: .5, v: .5, x: .5, y: .65 } };
source = addDecoration(source, source.clips[0].id, 'rectangle', 30).project;
Object.assign(source.decorations[0], { name: '초록 카드', x: .22, y: .33, width: .56, height: .39, radius: 48, color: '#357862', stroke: 4 });
source = addDecoration(source, source.clips[0].id, 'ellipse', 30).project;
Object.assign(source.decorations[1], { name: '노란 점', x: .73, y: .31, width: .09, height: .16, color: '#ffdb6c', opacity: .85, layer: 'front' });
source = addDecoration(source, source.clips[0].id, 'ellipse', 100).project;
source.decorations[2].name = '다음 구간 장식';
const { decorations: _, ...oldGroup } = captureCaptionGroup(source, [source.captions[1].id], '예전 글 그룹');
const oldStyle = { id: crypto.randomUUID(), name: '기존 즐겨찾기', style: effectiveStyle(source, source.captions[1]) };
await writeFile(join(data, 'caption-presets.json'), JSON.stringify({ version: 3, styles: [oldStyle], favorites: [`user:${oldStyle.id}`], groups: [oldGroup] }));
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(source));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env: { ...env, VLOGTOOL_TEST_DATA: data } });
let app = await launch(), page = await app.firstWindow(); const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
const library = () => page.evaluate(() => window.editor.captionPresets());
async function recover() { await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0); }
async function openProject(project: Project) {
  const path = join(out, '빈 프로젝트.vlog.json'); await writeFile(path, JSON.stringify(project));
  await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, path);
  await page.getByRole('button', { name: '열기', exact: true }).click(); await expect(page.locator('footer')).toContainText('프로젝트 열기 완료'); await expect(page.locator('.task-overlay')).toHaveCount(0);
}
async function seek(frame: number) { const ruler = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(ruler.x + frame * 2, ruler.y + 20); }
async function exportProject(project: Project, name: string) {
  const path = join(out, `${name}.mp4`); await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
  await page.evaluate(p => window.editor.exportProject(p), project); return path;
}
const pixels = async (path: string, frame: number) => (await run(binPath(root, 'ffmpeg'), ['-v', 'error', '-i', path, '-vf', `select=eq(n\\,${frame}),format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])).stdout;
async function manage(groupId: string) {
  await page.getByRole('button', { name: /자막 목록/ }).click();
  if (!await page.locator('.group-library').evaluate(el => (el as HTMLDetailsElement).open)) await page.locator('.group-library summary').click();
  await page.getByRole('combobox', { name: '저장한 글 그룹' }).selectOption(groupId);
}
try {
  await recover();
  await page.getByRole('button', { name: /자막 목록/ }).click(); await page.locator('.caption-list-item > button').first().click();
  await page.getByRole('tab', { name: '스타일', exact: true }).click(); await page.getByRole('button', { name: '제목·꾸미기 함께 저장하기' }).click();
  await expect(page.getByRole('textbox', { name: '새 글 그룹 이름' })).toBeFocused();
  await expect(page.locator('.group-selection')).toContainText('글 2 · 도형 2개 선택');
  await page.locator('.group-shapes summary').click();
  await expect(page.getByRole('checkbox', { name: '묶음에 포함할 도형 다음 구간 장식' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: '묶음에 포함할 도형 노란 점' }).uncheck(); await expect(page.locator('.group-selection')).toContainText('도형 1개 선택');
  await page.getByRole('button', { name: '현재 화면 선택', exact: true }).click();
  await page.getByRole('textbox', { name: '새 글 그룹 이름' }).fill('여행 기본 자막'); await page.getByRole('button', { name: '기본 자막 스타일로 저장', exact: true }).click();
  await expect.poll(async () => (await library()).groups.length).toBe(2);
  const saved = (await library()).groups.find(g => g.name === '여행 기본 자막')!;
  expect(saved.items).toHaveLength(2); expect(saved.decorations).toHaveLength(2); expect(saved.items[0].runs).toEqual(source.captions[0].runs);
  expect(saved.items[0].style.gradient).toEqual(source.captions[0].overrides.gradient);
  expect((await library()).defaultGroupId).toBe(saved.id); expect((await library()).styles).toEqual([oldStyle]); expect((await library()).favorites).toEqual([`user:${oldStyle.id}`]);
  expect((await library()).groups[0].decorations).toEqual([]); expect((await library()).version).toBe(4);
  await page.screenshot({ path: join(out, '01-save-default.png') });
  await openProject(base); await manage(saved.id); await page.getByRole('button', { name: '그룹 불러오기', exact: true }).click();
  await expect.poll(async () => (await state()).decorations.length).toBe(2); expect((await state()).captions.map(c => c.kind)).toEqual(['title', 'title']);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).decorations.length).toBe(0);
  await seek(30); await page.getByRole('button', { name: '＋ 자막', exact: true }).click();
  await expect.poll(async () => (await state()).captions.length).toBe(2); await expect.poll(async () => (await state()).decorations.length).toBe(2);
  let project = await state(); expect(project.captions.map(c => c.kind)).toEqual(['normal', 'normal']);
  expect(captionSpans(project).map(s => [s.start, s.end])).toEqual([[30, 90], [30, 90]]);
  expect(decorationSpans(project).map(s => [s.start, s.end])).toEqual([[30, 90], [30, 90]]);
  expect(project.captions[0].runs).toEqual(saved.items[0].runs); expect(effectiveStyle(project, project.captions[0])).toEqual(saved.items[0].style);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).captions.length + (await state()).decorations.length).toBe(0);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await expect.poll(async () => (await state()).decorations.length).toBe(2);
  await seek(29); await expect(page.getByTestId('caption-object')).toHaveCount(0); await expect(page.getByTestId('decoration-object')).toHaveCount(0);
  await seek(30); await expect(page.getByTestId('caption-object')).toHaveCount(2); await expect(page.getByTestId('decoration-object')).toHaveCount(2);
  const reference = await exportProject({ ...source, decorations: source.decorations.slice(0, 2) }, '꾸며 둔 원본');
  const exported = await exportProject(project, '기본 자막으로 복원'); const bare = await exportProject(base, '비교 배경');
  expect(Number((await probe(root, exported)).streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(90);
  const comparisons = [];
  for (const frame of [29, 30, 89]) {
    const [expected, actual] = await Promise.all([pixels(frame < 30 ? bare : reference, frame), pixels(exported, frame)]);
    expect(expected.length).toBe(base.settings.width * base.settings.height * 3);
    const mean = expected.reduce((n, v, i) => n + Math.abs(v - actual[i]), 0) / expected.length; expect(mean).toBeLessThan(2); comparisons.push({ frame, mean });
  }
  await page.locator(`textarea[aria-label="자막 문장 ${project.captions[0].id}"]`).fill('새로 편집한 자막'); await page.locator(`textarea[aria-label="자막 문장 ${project.captions[0].id}"]`).blur();
  await page.locator('.library-tabs').getByRole('button', { name: '꾸미기', exact: true }).click(); await page.getByTestId('decoration-list-item').first().click();
  await page.getByLabel('도형 색상', { exact: true }).fill('#4455aa');
  expect((await library()).groups.find(g => g.id === saved.id)!.decorations[0].color).toBe('#357862');
  await manage(saved.id); await page.getByRole('button', { name: '선택한 글·꾸미기로 덮어쓰기' }).click();
  await expect.poll(async () => (await library()).groups.find(g => g.id === saved.id)!.decorations[0].color).toBe('#4455aa');
  expect((await library()).defaultGroupId).toBe(saved.id); expect((await library()).groups.find(g => g.id === saved.id)!.items[0].text).toBe('새로 편집한 자막');
  await page.getByRole('textbox', { name: '글 그룹 새 이름' }).fill('수정한 기본 자막'); await page.getByRole('button', { name: '그룹 이름 변경' }).click();
  await expect.poll(async () => (await library()).groups.find(g => g.id === saved.id)!.name).toBe('수정한 기본 자막');
  await openProject(base); await page.getByRole('button', { name: '＋ 자막', exact: true }).click();
  await expect.poll(async () => (await state()).decorations[0]?.color).toBe('#4455aa');
  project = await state(); expect(project.captions[0].text).toBe('새로 편집한 자막');
  await app.close(); app = await launch(); page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message)); await recover();
  expect((await library()).defaultGroupId).toBe(saved.id); expect((await state()).captions).toEqual(project.captions); expect((await state()).decorations).toEqual(project.decorations);
  await seek(45); await page.getByRole('button', { name: '＋ 자막', exact: true }).click(); await expect.poll(async () => (await state()).decorations.length).toBe(4);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).decorations.length).toBe(2);
  await page.getByRole('button', { name: '기본 지정 해제', exact: true }).click(); await expect.poll(async () => (await library()).defaultGroupId).toBeNull();
  await page.getByRole('button', { name: '＋ 자막', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(3); expect((await state()).decorations.length).toBe(2);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(2);
  await manage(saved.id); await page.getByRole('button', { name: '기본 자막으로 지정', exact: true }).click(); await expect.poll(async () => (await library()).defaultGroupId).toBe(saved.id);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1100, 760));
  await page.locator('.group-default').scrollIntoViewIfNeeded(); await page.screenshot({ path: join(out, '02-small-window.png') });
  await page.getByRole('button', { name: '그룹 삭제', exact: true }).click(); await expect.poll(async () => (await library()).defaultGroupId).toBeNull();
  expect((await state()).captions).toEqual(project.captions); expect((await state()).decorations).toEqual(project.decorations); expect((await library()).groups).toHaveLength(1);
  expect(errors).toEqual([]);
  const report = { out, exported, comparisons, errors, checks: ['existing v3 library migration', 'current screen and individual shape selection', 'two titles with rich fonts and gradient plus two decorations saved as default', 'manual group insertion preserves titles', 'default creates subtitles and decorations at playhead', 'single undo/redo for all components', 'MP4 before/start/end pixel comparison with original design', 'editing copies does not mutate saved design', 'overwrite and rename preserve default', 'cross-project reuse and app restart', 'default reset/reassign/delete preserve applied copies', '1100x760 layout'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(join(root, 'artifacts/latest-caption-bundles.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { await page.screenshot({ path: join(out, 'failure.png') }); throw error; }
finally { await app.close(); }
