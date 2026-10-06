import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSchema } from '../src/shared/project';
import { addCaption, captionRect, effectiveStyle } from '../src/shared/captions';
import { binPath, run } from '../electron/process';

const root = resolve('.'), id = `gradient-styles-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
let source = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
source.captions = []; source.narrations = []; source.decorations = []; source.clips = source.clips.slice(0, 1).map(c => ({ ...c, inFrame: 30, outFrame: 120 }));
source = addCaption(source, source.clips[0].id, 'title', 30).project;
source.captions[0].text = 'MMMMMMMM'; source.captions[0].overrides = { font: 'sans', size: 40, color: '#ffffff', outline: 0, outer: 0, shadow: 0, opacity: 1, padding: 60, radius: 0, position: { h: .5, v: .5, x: .5, y: .5 }, gradient: { angle: 90, from: '#ff0000', to: '#0000ff' } };
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(source));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], env: { ...env, VLOGTOOL_TEST_DATA: data } });
let app = await launch(), page = await app.firstWindow(); const errors: string[] = [];
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
const library = () => page.evaluate(() => window.editor.captionPresets());
async function ready() { await page.evaluate('globalThis.__name = (fn) => fn'); page.on('pageerror', e => errors.push(e.message)); await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0); }
async function decorate() { await page.getByRole('button', { name: /자막 목록/ }).click(); await page.locator('.caption-list-item > button').first().click(); await page.getByRole('tab', { name: '꾸미기', exact: true }).click(); }
try {
  await ready(); await decorate();
  const mode = page.getByRole('combobox', { name: '그라데이션 스타일', exact: true });
  await expect(mode).toHaveValue('soft'); // Old projects with no mode retain the soft background.
  await mode.selectOption('hard'); await expect.poll(async () => (await state()).captions[0].overrides.gradient?.mode).toBe('hard');
  await expect.poll(() => page.locator('.gradient-swatch').evaluate(el => (el as HTMLElement).style.background)).toContain('50%');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(mode).toHaveValue('soft');
  await page.getByRole('button', { name: '다시 실행', exact: true }).click(); await expect(mode).toHaveValue('hard');
  await page.getByRole('button', { name: '색 순서 바꾸기', exact: true }).click(); await expect.poll(async () => (await state()).captions[0].overrides.gradient?.from).toBe('#0000ff');
  await expect(mode).toHaveValue('hard'); await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  const angle = page.getByRole('spinbutton', { name: '그라데이션 각도', exact: true }); await angle.fill('135'); await angle.press('Enter');
  await expect.poll(async () => (await state()).captions[0].overrides.gradient?.angle).toBe(135);
  const style = effectiveStyle(await state(), (await state()).captions[0]);
  const checks = [];
  // Both rendering paths must produce pure colors away from the split, even at oblique angles.
  for (const rich of [false, true]) for (const angle of [0, 45, 90, 135, 180, 270]) {
    const request = { text: 'MMMMMMMM', runs: rich ? [{ start: 0, end: 4, style: { font: 'nanumpen' as const, size: 60 } }] : [], style: { ...style, gradient: { angle, from: '#ff0000', to: '#0000ff', mode: 'hard' as const } }, width: 1920, height: 1080 };
    const bitmap = await page.evaluate(r => window.editor.captionBitmap(r), request);
    const samples = await page.evaluate(async b => {
      const img = new Image(); img.src = b.url; await img.decode(); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const points: number[][] = []; for (let x = 10; x < b.width - 10; x += 7) { points.push([x, 10], [x, b.height - 11]); }
      for (let y = 10; y < b.height - 10; y += 7) { points.push([10, y], [b.width - 11, y]); }
      return points.map(([x, y]) => ({ x, y, rgba: Array.from(ctx.getImageData(x, y, 1, 1).data) }));
    }, bitmap);
    let red = 0, blue = 0;
    for (const sample of samples) {
      const side = (sample.x + .5 - bitmap.width / 2) * Math.sin(angle * Math.PI / 180) - (sample.y + .5 - bitmap.height / 2) * Math.cos(angle * Math.PI / 180);
      if (Math.abs(side) < 2) continue;
      const expected = side < 0 ? [255, 0, 0, 255] : [0, 0, 255, 255]; expect(sample.rgba).toEqual(expected); if (side < 0) red++; else blue++;
    }
    expect(red).toBeGreaterThan(0); expect(blue).toBeGreaterThan(0); checks.push({ rich, angle, red, blue });
    if (angle === 90) {
      const soft = await page.evaluate(r => window.editor.captionBitmap(r), { ...request, style: { ...request.style, gradient: { ...request.style.gradient, mode: 'soft' as const } } });
      const midpoint = await page.evaluate(async b => { const img = new Image(); img.src = b.url; await img.decode(); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); return Array.from(ctx.getImageData(Math.floor(b.width / 2), 10, 1, 1).data); }, soft);
      expect(midpoint[0]).toBeGreaterThan(110); expect(midpoint[0]).toBeLessThan(145); expect(midpoint[2]).toBeGreaterThan(110); expect(midpoint[2]).toBeLessThan(145);
    }
  }
  // Persist the choice in a regular preset and in a default text/decoration bundle.
  await page.getByRole('tab', { name: '스타일', exact: true }).click(); await page.getByRole('textbox', { name: '내 자막 설정 이름' }).fill('하드 배경'); await page.getByRole('button', { name: '현재 스타일 저장', exact: true }).click();
  await expect.poll(async () => (await library()).styles[0]?.style.gradient?.mode).toBe('hard');
  await page.getByRole('button', { name: '현재 화면 선택', exact: true }).click(); await page.getByRole('textbox', { name: '새 글 그룹 이름' }).fill('하드 기본 자막'); await page.getByRole('button', { name: '기본 자막 스타일로 저장', exact: true }).click();
  await expect.poll(async () => (await library()).groups[0]?.items[0].style.gradient?.mode).toBe('hard');
  const saved = await state(); await app.close(); app = await launch(); page = await app.firstWindow(); await ready(); await decorate();
  await expect(page.getByRole('combobox', { name: '그라데이션 스타일', exact: true })).toHaveValue('hard'); expect((await state()).captions).toEqual(saved.captions);
  await page.getByRole('button', { name: '＋ 자막', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(2);
  expect(effectiveStyle(await state(), (await state()).captions[1]).gradient?.mode).toBe('hard');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => (await state()).captions.length).toBe(1);
  const bitmap = await page.evaluate(r => window.editor.captionBitmap(r), { text: saved.captions[0].text, runs: saved.captions[0].runs, style, width: saved.settings.width, height: saved.settings.height });
  const exported = join(out, '하드 그라데이션.mp4'); await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported); await page.evaluate(p => window.editor.exportProject(p), saved);
  const frame = (await run(binPath(root, 'ffmpeg'), ['-v', 'error', '-i', exported, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])).stdout;
  expect(frame.length).toBe(saved.settings.width * saved.settings.height * 3);
  const rect = captionRect(bitmap, style, saved.settings, saved.captionSettings.margins), outputSamples = [];
  for (const [x, y, expected] of [[10, 10, [255, 0, 0]], [bitmap.width - 11, bitmap.height - 11, [0, 0, 255]]] as const) {
    const i = ((rect.top + y) * saved.settings.width + rect.left + x) * 3, actual = Array.from(frame.subarray(i, i + 3));
    expected.forEach((v, n) => expect(Math.abs(v - actual[n])).toBeLessThan(20)); outputSamples.push(actual);
  }
  await decorate(); await page.getByRole('combobox', { name: '그라데이션 스타일', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: join(out, 'hard-gradient.png') });
  expect(errors).toEqual([]); const report = { out, exported, checks, outputSamples, errors, persistence: ['project', 'style preset', 'default bundle', 'app restart', 'default insertion'], ui: ['legacy soft mode', 'mode switch', 'Undo/Redo', 'swap colors preserves mode', 'angle'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(join(root, 'artifacts/latest-gradient-styles.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { await page.screenshot({ path: join(out, 'failure.png') }); throw error; }
finally { await app.close(); }
