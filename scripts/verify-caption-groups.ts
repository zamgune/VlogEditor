import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSchema, type Project } from '../src/shared/project';
import { effectiveStyle, captionRect, CAPTION_PRESETS } from '../src/shared/captions';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';

const root = resolve('.'), id = `caption-groups-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
const base = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
base.captions = []; base.narrations = []; base.clips = base.clips.slice(0, 1).map(c => ({ ...c, inFrame: 0, outFrame: 120 }));
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(base));
const legacyStyle = { id: crypto.randomUUID(), name: '이전 내 스타일', style: CAPTION_PRESETS[0].style };
await writeFile(join(data, 'caption-presets.json'), JSON.stringify({ version: 1, styles: [legacyStyle], favorites: [`user:${legacyStyle.id}`] }));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env: { ...env, VLOGTOOL_TEST_DATA: data } });
let app = await launch(), page = await app.firstWindow(); const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
const library = () => page.evaluate(() => window.editor.captionPresets());
const field = (name: string) => page.getByRole('spinbutton', { name, exact: true });
const select = async (id: string) => { await page.locator(`.caption-list-item[data-caption-id="${id}"] > button`).click(); };
async function typeNumber(name: string, text: string) {
  const input = field(name); await input.click(); await input.press('Control+A'); await input.press('Backspace');
  for (const digit of text) await input.pressSequentially(digit, { delay: 25 });
  await expect(input).toHaveValue(text); await input.press('Enter');
}
async function openProject(project: Project, name: string) {
  const path = join(out, `${name}.vlog.json`); await writeFile(path, JSON.stringify(project));
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path);
  await page.getByRole('button', { name: '열기', exact: true }).click(); await expect(page.locator('footer')).toContainText('프로젝트 열기 완료', { timeout: 60000 });
  await expect(page.locator('.task-overlay')).toHaveCount(0);
}
async function exportProject(project: Project, name: string) {
  const path = join(out, `${name}.mp4`);
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
  await page.evaluate(p => window.editor.exportProject(p), project); return path;
}
try {
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '＋ 전체 제목', exact: true }).click();
  await expect(page.getByTestId('caption-object')).toHaveCount(1);
  const first = (await state()).captions[0].id;
  await page.locator(`textarea[aria-label="자막 문장 ${first}"]`).fill('일단 이렇게 시작해보겠습니다.');
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click();
  const size = field('자막 글자 크기'); await size.click(); await size.press('Control+A'); await size.press('Backspace');
  await size.pressSequentially('6'); await expect(size).toHaveValue('6');
  expect(effectiveStyle(await state(), (await state()).captions[0]).size).toBe(74);
  await size.pressSequentially('0'); await expect(size).toHaveValue('60'); await size.press('Enter');
  await expect.poll(async () => effectiveStyle(await state(), (await state()).captions[0]).size).toBe(60);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(size).toHaveValue('74');
  await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await expect(size).toHaveValue('60');
  await size.fill(''); await size.blur(); await expect(size).toHaveValue('60');
  await size.fill('99'); await size.press('Escape'); await expect(size).toHaveValue('60');
  await typeNumber('자막 줄 간격', '1.8'); await expect(field('자막 줄 간격')).toHaveValue('1.8');
  await page.getByRole('button', { name: '＋ 전체 제목', exact: true }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(2);
  const second = (await state()).captions[1].id; expect(second).not.toBe(first);
  await page.locator(`textarea[aria-label="자막 문장 ${second}"]`).fill('에피소드 2');
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click(); await typeNumber('자막 글자 크기', '30');
  await page.getByRole('checkbox', { name: '배경 사용', exact: true }).check(); await typeNumber('배경 불투명도 (%)', '25');
  await expect(field('배경 불투명도 (%)')).toHaveValue('25');
  await page.getByRole('tab', { name: '움직임', exact: true }).click(); await page.getByRole('combobox', { name: '자막 등장 효과' }).selectOption('fade');
  await typeNumber('자막 등장 시간', '0.5'); await page.getByRole('combobox', { name: '자막 등장 효과' }).selectOption('none');
  await page.getByRole('button', { name: '자막 복제', exact: true }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(3);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(2);
  await page.getByRole('button', { name: '모두 선택', exact: true }).click(); await page.getByRole('textbox', { name: '새 글 그룹 이름' }).fill('에피소드 시작');
  await page.getByRole('button', { name: '선택한 글을 새 그룹으로 저장' }).click();
  await expect.poll(async () => (await library()).groups.length).toBe(1);
  const saved = (await library()).groups[0]; expect(saved.items.map(i => i.style.size)).toEqual([60, 30]); expect(saved.items[1].style.opacity).toBe(.25);
  expect((await library()).styles).toHaveLength(1); expect((await library()).favorites).toEqual([`user:${legacyStyle.id}`]);
  await select(second); await page.getByRole('tab', { name: '스타일', exact: true }).click();
  await page.getByRole('textbox', { name: '내 자막 설정 이름' }).fill('별도 작은 제목'); await page.getByRole('button', { name: '현재 스타일 저장', exact: true }).click();
  await expect.poll(async () => (await library()).styles.length).toBe(2); expect((await library()).groups).toEqual([saved]);
  // Reuse in another project, then edit and overwrite the stored group without changing already applied copies.
  await openProject(base, '새 프로젝트'); await page.getByRole('button', { name: '자막 목록 · 0' }).click();
  await page.locator('.group-library summary').click(); await page.getByRole('combobox', { name: '저장한 글 그룹' }).selectOption(saved.id);
  await page.getByRole('button', { name: '그룹 불러오기', exact: true }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(2);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(0);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(2);
  let project = await state(); const importedFirst = project.captions[0].id;
  expect(effectiveStyle(project, project.captions[1]).size).toBe(30); expect(effectiveStyle(project, project.captions[1]).opacity).toBe(.25);
  await select(importedFirst); await page.locator(`textarea[aria-label="자막 문장 ${importedFirst}"]`).fill('수정한 시작 문구');
  await page.getByRole('tab', { name: '꾸미기', exact: true }).click(); await typeNumber('자막 글자 크기', '72');
  await page.getByRole('button', { name: '선택한 글로 그룹 덮어쓰기' }).click();
  await expect.poll(async () => (await library()).groups[0].items[0].text).toBe('수정한 시작 문구'); expect((await library()).groups[0].items[0].style.size).toBe(72);
  await page.getByRole('textbox', { name: '글 그룹 새 이름' }).fill('수정한 인트로'); await page.getByRole('button', { name: '그룹 이름 변경' }).click();
  await expect.poll(async () => (await library()).groups[0].name).toBe('수정한 인트로');
  await page.getByRole('textbox', { name: '새 글 그룹 이름' }).fill('복사본'); await page.getByRole('button', { name: '선택한 글을 새 그룹으로 저장' }).click();
  await expect.poll(async () => (await library()).groups.length).toBe(2); await page.getByRole('button', { name: '그룹 삭제', exact: true }).click();
  await expect.poll(async () => (await library()).groups.length).toBe(1); await expect(page.getByTestId('caption-object')).toHaveCount(2);
  await page.getByRole('combobox', { name: '저장한 글 그룹' }).selectOption(saved.id);
  project = await state(); expect(project.version).toBe(7);
  const projectPath = join(out, '새 프로젝트.vlog.json');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, projectPath);
  await page.getByRole('button', { name: '저장 Ctrl S' }).click(); await expect.poll(async () => { try { return (await stat(projectPath)).size; } catch { return 0; } }).toBeGreaterThan(100);
  const exported = await exportProject(project, '두 제목'), bare = await exportProject({ ...project, captions: [] }, '자막 없는 비교 영상');
  expect(Number((await probe(root, exported)).streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(120);
  const ink: number[] = [];
  for (const caption of project.captions) {
    const style = effectiveStyle(project, caption);
    const bitmap = await page.evaluate(r => window.editor.captionBitmap(r), { text: caption.text, style, width: project.settings.width, height: project.settings.height });
    const rect = captionRect(bitmap, style, project.settings, project.captionSettings.margins);
    expect(rect.overflow).toBe(false);
    const pixels = async (path: string) => (await run(binPath(root, 'ffmpeg'), ['-v', 'error', '-i', path, '-vf', `crop=${rect.width}:${rect.height}:${rect.left}:${rect.top},format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])).stdout;
    const [actual, background] = await Promise.all([pixels(exported), pixels(bare)]);
    const mean = actual.reduce((sum, v, i) => sum + Math.abs(v - background[i]), 0) / actual.length; expect(mean).toBeGreaterThan(5); ink.push(mean);
  }
  await page.screenshot({ path: join(out, '01-groups.png') });
  await app.close(); app = await launch(); page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('caption-object')).toHaveCount(2, { timeout: 60000 });
  expect((await library()).groups[0].items[0].style.size).toBe(72); expect((await library()).styles).toHaveLength(2);
  expect((await state()).captions.map(c => c.text)).toEqual(['수정한 시작 문구', '에피소드 2']);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1100, 760));
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(1100);
  await page.getByRole('button', { name: '자막 목록 · 2' }).click(); await page.locator('.group-library summary').click();
  await page.getByRole('combobox', { name: '저장한 글 그룹' }).selectOption(saved.id); await page.getByRole('button', { name: '그룹 불러오기' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '그룹 불러오기' })).toBeInViewport(); await page.screenshot({ path: join(out, '02-small-window.png') });
  expect(errors).toEqual([]); await writeFile(join(out, 'report.json'), JSON.stringify({ projectPath, exported, ink, errors, checks: ['multiple titles', 'keyboard digits and decimals', 'blank and Escape', 'one-step undo', 'group create/apply/update/rename/delete', 'style coexistence and migration', 'project and app restart', 'both titles in MP4', 'small window'] }, null, 2));
  console.log(out);
} finally { await app.close(); }
