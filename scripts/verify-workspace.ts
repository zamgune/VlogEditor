import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { addCaption, effectiveStyle } from '../src/shared/captions';
import { addDecoration } from '../src/shared/decoration';
import { ProjectSchema } from '../src/shared/project';
import { textStyleAt } from '../src/shared/rich-text';

const root = resolve('.'), out = join(root, 'output/playwright', `workspace-${Date.now()}`), data = join(out, 'profile');
await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
let p = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
p.clips = p.clips.slice(0, 1).map(c => ({ ...c, inFrame: 30, outFrame: 120 }));
p.captions = []; p.narrations = []; p.decorations = []; p.settings = { ...p.settings, width: 1080, height: 1920 };
p = addCaption(p, p.clips[0].id, 'normal', 30).project;
p.captions[0] = { ...p.captions[0], text: '오늘의 한 장면', inFrame: 30, outFrame: 120, overrides: { size: 60, position: { h: .5, v: .5, x: .5, y: .5 } } };
p = addDecoration(p, p.clips[0].id, 'rectangle', 30).project;
p.decorations[0] = { ...p.decorations[0], x: .3, y: .75, width: .2, height: .08 };
const recovery = join(data, 'work/recovery.vlog.json'); await writeFile(recovery, JSON.stringify(p));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: data } });
const page = await app.firstWindow(), checks: string[] = [], errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
const state = async () => ProjectSchema.parse(JSON.parse(await readFile(recovery, 'utf8')));
const mode = page.getByRole('combobox', { name: '편집 레이아웃' });
const caption = page.getByTestId('caption-object').first();
async function numeric(label: string, value: string) { const input = page.getByRole('spinbutton', { name: label, exact: true }); await input.fill(value); await input.press('Enter'); }
async function seekStart() { const b = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(b.x + 1, b.y + 10); }
async function capture(name: string) {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.webContents.capturePage()).toPNG().toString('base64'));
  await writeFile(join(out, name + '.png'), Buffer.from(png, 'base64'));
}
async function drag(selector: string, dx: number, dy: number) { const b = (await page.locator(selector).boundingBox())!; await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:5});await page.mouse.up(); }
try {
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(1, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1366,768));
  await expect(mode).toHaveValue('current'); await caption.click();
  const originalStage = (await page.locator('.preview-stage').boundingBox())!.height;
  const before = await state(); await page.evaluate(() => { (window as any).layoutVideo = document.querySelector('video'); });
  await mode.selectOption('split'); await expect(page.locator('.app')).toHaveClass(/layout-split/);
  await expect.poll(async () => (await page.locator('.preview-stage').boundingBox())!.height).toBeGreaterThan(originalStage + 100);
  await numeric('빠른 글자 크기', '75'); await expect.poll(async () => effectiveStyle(await state(), (await state()).captions[0]).size).toBe(75);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect.poll(async () => effectiveStyle(await state(), (await state()).captions[0]).size).toBe(60);
  await page.getByRole('button', { name: '좌우 바꾸기 ⇄' }).click();
  const boxes = await page.evaluate(() => ({ preview:document.querySelector('.preview-surface')!.getBoundingClientRect().toJSON(), tools:document.querySelector('.quick-editor')!.getBoundingClientRect().toJSON(), timeline:document.querySelector('.timeline')!.getBoundingClientRect().toJSON() }));
  expect(boxes.preview.x).toBeGreaterThan(boxes.tools.x + boxes.tools.width); expect(boxes.timeline.x).toBe(boxes.tools.x);
  expect(await page.evaluate(() => (window as any).layoutVideo === document.querySelector('video'))).toBe(true);
  expect(await state()).toEqual(before); await capture('split-right');
  await drag('.split-divider', -35, 0); await expect.poll(async () => (await page.locator('.preview-surface').boundingBox())!.width).toBeGreaterThan(boxes.preview.width+25);
  const height = (await page.locator('.timeline').boundingBox())!.height; await drag('.editor-content>.divider-y',0,-25); await expect.poll(async () => (await page.locator('.timeline').boundingBox())!.height).toBeGreaterThan(height+20);
  for (const side of ['right','left']) {
    if(side==='left') await page.getByRole('button',{name:'좌우 바꾸기 ⇄'}).click();
    const canvas=(await page.getByTestId('preview-canvas').boundingBox())!, initial=(await caption.boundingBox())!;
    await page.keyboard.down('Alt');await drag('[data-testid="caption-object"]',11,7);await page.keyboard.up('Alt');
    await expect.poll(async()=>{const next=(await caption.boundingBox())!;return Math.max(Math.abs((next.x-initial.x-11)/canvas.width*p.settings.width),Math.abs((next.y-initial.y-7)/canvas.height*p.settings.height));}).toBeLessThanOrEqual(1);
    await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect.poll(async()=>effectiveStyle(await state(),(await state()).captions[0]).position.x).toBe(.5);
  }
  checks.push('caption drag within one output pixel in both left/right split layouts after resizing');
  checks.push('default current layout, split geometry, side swap, width/height resize and undo without changing project');
  await page.getByRole('button', { name: '부분 서식', exact: true }).click(); await expect(page.locator('.inspector')).toBeVisible(); await expect(page.locator('.quick-editor')).toBeHidden();
  const text = page.getByRole('textbox', { name: '부분 서식 문구' }); await text.focus(); await text.press('Control+Home'); await page.keyboard.down('Shift'); await text.press('ArrowRight'); await page.keyboard.up('Shift');
  await numeric('선택 글자 크기','100'); await expect.poll(async () => textStyleAt((await state()).captions[0].runs,0).size).toBe(100);
  await page.getByRole('button', { name: '상세 편집 닫기' }).click();
  await page.getByTestId('decoration-object').click(); await numeric('빠른 도형 라운드','40'); await expect.poll(async () => (await state()).decorations[0].radius).toBe(40);
  await caption.click(); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v'); await expect.poll(async () => (await state()).captions.length).toBe(2); await page.getByRole('button',{name:'실행 취소',exact:true}).click();
  await caption.click(); await page.getByRole('button',{name:'묶음 저장',exact:true}).click(); await page.getByRole('textbox',{name:'새 글 그룹 이름'}).fill('분할 화면 스타일'); await page.getByRole('button',{name:'기본 자막 스타일로 저장',exact:true}).click(); await expect(page.locator('.group-status')).toContainText('저장됨');await page.getByRole('button',{name:'보관함 닫기'}).click();
  checks.push('partial size, shape editing, copy/paste and group save in the tools column');
  await seekStart(); await page.getByRole('button',{name:'재생',exact:true}).click(); await expect.poll(()=>page.locator('video').evaluate(v=>(v as HTMLVideoElement).currentTime)).toBeGreaterThan(1.1);
  await mode.selectOption('current'); await mode.selectOption('split'); await page.getByRole('button',{name:'좌우 바꾸기 ⇄'}).click();
  expect(await page.evaluate(()=>(window as any).layoutVideo === document.querySelector('video'))).toBe(true); await expect(page.getByRole('button',{name:'일시 정지',exact:true})).toBeVisible(); await page.getByRole('button',{name:'일시 정지',exact:true}).click();
  checks.push('layout changes retain video node and uninterrupted playback');
  await seekStart(); await page.getByRole('combobox',{name:'미리보기 방식'}).selectOption('device');
  for(const factor of [1,1.25,1.5]) {
    await app.evaluate(({BrowserWindow},factor)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='vlog://editor/index.html')!;w.setSize(1366,768);w.webContents.setZoomFactor(factor);},factor);
    for(const layout of ['current','split']) {
      await mode.selectOption(layout); await caption.click(); await expect(mode).toBeInViewport(); await expect(page.getByRole('button',{name:'내보내기 ↗'})).toBeInViewport(); await expect(page.getByRole('button',{name:'재생',exact:true})).toBeInViewport();
      const metrics=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,stage:document.querySelector('.preview-stage')!.getBoundingClientRect().height}));expect(metrics.overflow).toBe(false);expect(metrics.stage).toBeGreaterThan(80);
      await page.getByRole('button',{name:'상세 편집',exact:true}).click(); await expect(page.getByRole('button',{name:'상세 편집 닫기'})).toBeInViewport(); await capture(`${layout}-${factor}`);await page.getByRole('button',{name:'상세 편집 닫기'}).click();
    }
  }
  checks.push('1366x768 at 100/125/150% for both layouts and detail panel');
  await mode.selectOption('split'); const preferences=await page.evaluate(()=>localStorage.getItem('vlog-workspace-v1'));
  const savedProject=await state();await page.reload();await page.getByRole('button',{name:'작업 복구'}).click();await expect(page.locator('.task-overlay')).toHaveCount(0);await expect(mode).toHaveValue('split');expect(await page.evaluate(()=>localStorage.getItem('vlog-workspace-v1'))).toBe(preferences);expect(await state()).toEqual(savedProject);
  checks.push('mode, side and sizes persist after restart without project changes');expect(errors).toEqual([]);
  await writeFile(join(out,'report.json'),JSON.stringify({out,checks,errors},null,2));console.log(JSON.stringify({out,checks,errors}));
} catch(error) {await capture('failure');console.error('Workspace verification output:',out);throw error;}
finally {await app.close();}
