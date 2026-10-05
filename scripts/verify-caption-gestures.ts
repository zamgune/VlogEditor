import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ProjectSchema, type Project } from '../src/shared/project';
import { addCaption, effectiveStyle, captionRect } from '../src/shared/captions';
import { CANVAS_PRESETS } from '../src/shared/canvas';
const root=resolve('.'),id=`caption-gestures-${new Date().toISOString().replace(/[:.]/g,'-')}`,out=join(root,'output/playwright',id),data=join(root,'.vlogtool-test',id),recovery=join(data,'work/recovery.vlog.json');
await mkdir(out,{recursive:true});await mkdir(join(data,'work'),{recursive:true});
const fixture=JSON.parse(await readFile(join(root,'artifacts/latest-media.json'),'utf8'));
let p=ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath,'utf8')));p.clips=p.clips.map(c=>({...c,inFrame:0,outFrame:p.media.find(m=>m.id===c.mediaId)!.durationFrames}));p.settings={...p.settings,width:1080,height:1920};
for(const c of p.clips)p=addCaption(p,c.id,'normal',0).project;
p=addCaption(p,p.clips[0].id,'title',0).project;
await writeFile(recovery,JSON.stringify(p));const first=p.captions[0].id, second=p.captions[1].id;
const env=Object.fromEntries(Object.entries(process.env).filter(([k,v])=>v!==undefined&&k!=='ELECTRON_RUN_AS_NODE'));
let app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env:{...env,VLOGTOOL_TEST_DATA:data}});let page=await app.firstWindow();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const state=async():Promise<Project>=>ProjectSchema.parse(JSON.parse(await readFile(recovery,'utf8')));
const select=async(id:string)=>{await page.getByRole('button',{name:/자막 목록/}).click();await page.locator(`.caption-list-item:has(textarea[aria-label="자막 문장 ${id}"]) > button`).click();};
async function drag(selector:string,dx:number,dy:number,cancel=false,alt=false){const el=page.locator(selector),b=(await el.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);if(alt)await page.keyboard.down('Alt');await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(alt)await page.keyboard.up('Alt');}
try{
 await page.getByRole('button',{name:'작업 복구'}).click();await expect(page.getByTestId('timeline-clip')).toHaveCount(2,{timeout:60000});await expect(page.locator('.task-overlay')).toHaveCount(0);await select(first);
 await page.getByRole('tab',{name:'꾸미기',exact:true}).click(); const scope=page.getByRole('combobox',{name:'자막 적용 대상'}),size=page.getByRole('spinbutton',{name:'자막 글자 크기'});
 await scope.selectOption('common');await size.fill('70');await size.blur();await expect.poll(async()=>effectiveStyle(await state(),(await state()).captions[1]).size).toBe(70);
 await scope.selectOption('one');await page.getByRole('button',{name:'자막 위 왼쪽',exact:true}).click();await expect.poll(async()=>(await state()).captions[0].overrides.position?.h).toBe(0);
 await scope.selectOption('common');await size.fill('62');await size.blur();await expect.poll(async()=>effectiveStyle(await state(),(await state()).captions[0]).size).toBe(62);expect(effectiveStyle(await state(),(await state()).captions[0]).position.h).toBe(0);
 await page.getByRole('button',{name:'공통 설정으로 복귀'}).click();await expect.poll(async()=>Object.keys((await state()).captions[0].overrides).length).toBe(0);await scope.selectOption('one');
 const obj=`[data-testid="caption-object"][data-caption-id="${first}"]`;await expect(page.locator(obj)).toBeVisible();await page.locator(obj).click();await expect.poll(async()=>Object.keys((await state()).captions[0].overrides).length).toBe(0);
 const original=(await page.locator(obj).boundingBox())!;await drag(obj,30,-25,true);await expect.poll(async()=>(await page.locator(obj).boundingBox())!.x).toBeCloseTo(original.x,1);expect(Object.keys((await state()).captions[0].overrides)).toHaveLength(0);
 await drag(obj,25,-20);await expect.poll(async()=>(await state()).captions[0].overrides.position?.x).not.toBeUndefined();await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect.poll(async()=>Object.keys((await state()).captions[0].overrides).length).toBe(0);await page.getByRole('button',{name:'다시 실행',exact:true}).click();
 await page.getByRole('button',{name:'자막 아래 중앙',exact:true}).click();await drag(`${obj} .caption-resize`,15,7);await expect.poll(async()=>effectiveStyle(await state(),(await state()).captions[0]).size).toBeGreaterThan(62);
 await page.getByRole('button',{name:'같은 종류 모두 크기·위치 맞추기'}).click();await expect.poll(async()=>{const q=await state();return JSON.stringify(effectiveStyle(q,q.captions[0]))===JSON.stringify(effectiveStyle(q,q.captions[1]));}).toBe(true);
 const canvas=page.getByTestId('preview-canvas'),c=(await canvas.boundingBox())!,b=(await page.locator(obj).boundingBox())!;
 await drag(obj,c.x+c.width/2-(b.x+b.width/2),c.y+c.height/2-(b.y+b.height/2));await expect.poll(async()=>(await state()).captions[0].overrides.position?.v).toBe(.5);expect((await state()).captions[0].overrides.position?.x).toBeNull();
 await drag(obj,3,4,false,true);await expect.poll(async()=>(await state()).captions[0].overrides.position?.x).not.toBeNull();
 await page.getByRole('button',{name:'자막 아래 중앙',exact:true}).click();await page.locator(obj).focus();await page.keyboard.press('ArrowRight');await expect.poll(async()=>(await state()).captions[0].overrides.position?.x).toBeGreaterThan(.5);
 const ratio=page.getByRole('combobox',{name:'프로젝트 화면 비율'}),positions:unknown[]=[];
 for(const preset of CANVAS_PRESETS){await ratio.selectOption(preset.id);await expect.poll(async()=>{const q=await state();return [q.settings.width,q.settings.height];}).toEqual([preset.width,preset.height]);const q=await state(),cap=q.captions[0],style=effectiveStyle(q,cap),bitmap=await page.evaluate(r=>window.editor.captionBitmap(r),{text:cap.text,style,width:preset.width,height:preset.height}),rect=captionRect(bitmap,style,q.settings,q.captionSettings.margins);
  await expect.poll(async()=>{const box=(await page.locator(obj).boundingBox())!,cv=(await canvas.boundingBox())!;return Math.max(Math.abs((box.x-cv.x)/cv.width*preset.width-rect.left),Math.abs((box.y-cv.y)/cv.height*preset.height-rect.top));}).toBeLessThanOrEqual(1);positions.push(preset.id);
 }
 await ratio.selectOption('9:16');await select(first);const block=page.getByTestId('caption-block').filter({hasText:'오늘의 작은 순간'}).first();const blockBox=(await block.boundingBox())!;
 await page.mouse.move(blockBox.x+blockBox.width-3,blockBox.y+12);await page.mouse.down();await page.mouse.move(blockBox.x+blockBox.width-63,blockBox.y+12,{steps:5});await page.mouse.up();await expect.poll(async()=>(await state()).captions[0].outFrame).toBe(90);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect.poll(async()=>(await state()).captions[0].outFrame).toBe(120);
 const ruler=(await page.locator('.ruler').boundingBox())!;await page.mouse.click(ruler.x+60,ruler.y+20);await page.getByRole('button',{name:'분할 S',exact:true}).click();await expect(page.getByTestId('caption-block')).toHaveCount(4);await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect(page.getByTestId('caption-block')).toHaveCount(3);
 const width=(await page.locator('.library').boundingBox())!.width;await drag('[aria-label="미디어 패널 크기"]',36,0);await expect.poll(async()=>(await page.locator('.library').boundingBox())!.width).toBeGreaterThan(width+20);
 const height=(await canvas.boundingBox())!.height;await drag('[aria-label="타임라인 높이"]',0,50);await expect.poll(async()=>(await canvas.boundingBox())!.height).toBeGreaterThan(height+20);
 await select(first);const text=page.locator(`textarea[aria-label="자막 문장 ${first}"]`);await text.fill('한글 입력 테스트 S Delete');await text.press('Space');await text.blur();await expect(page.getByTestId('timeline-clip')).toHaveCount(2);await expect.poll(async()=>(await state()).captions[0].text).toContain('한글');
 await page.screenshot({path:join(out,'gestures.png')});const beforeRestart=await state();await app.close();
 app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env:{...env,VLOGTOOL_TEST_DATA:data}});page=await app.firstWindow();await page.getByRole('button',{name:'작업 복구'}).click();await expect(page.getByTestId('caption-block')).toHaveCount(3,{timeout:60000});await expect(page.locator('.task-overlay')).toHaveCount(0);expect((await state()).captions).toEqual(beforeRestart.captions);expect((await state()).captionSettings).toEqual(beforeRestart.captionSettings);
 expect(errors).toEqual([]);const report={out,errors,positions,checks:['common style inheritance','local override reset','click no-op','drag cancel and undo/redo','corner resize','match all','magnetic snap and Alt bypass','arrow nudge','6 canvas DOM coordinate checks <=1px','caption timeline trim and split','panel resize','typing isolation','restart recovery']};await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await writeFile(join(root,'artifacts/latest-caption-gestures.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await page.screenshot({path:join(out,'failure.png')});console.error(await page.locator('body').innerText());throw e;}finally{await app.close();}
