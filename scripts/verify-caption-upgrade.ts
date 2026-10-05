import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ProjectSchema, type Project } from '../src/shared/project';
import { CAPTION_PRESETS, effectiveStyle, activeCaptionSpans, captionTransform, captionRect, addCaption, noMotion, type CaptionLibrary } from '../src/shared/captions';
import { CANVAS_PRESETS, canvasSettings } from '../src/shared/canvas';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';

const root=resolve('.'), id=`caption-upgrade-${new Date().toISOString().replace(/[:.]/g,'-')}`, out=join(root,'output/playwright',id), data=join(root,'.vlogtool-test',id), recovery=join(data,'work/recovery.vlog.json');
await mkdir(out,{recursive:true}); await mkdir(join(data,'work'),{recursive:true});
const fixture=JSON.parse(await readFile(join(root,'artifacts/latest-media.json'),'utf8'));
let base=ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath,'utf8')));
base.captions=[];base.clips=base.clips.slice(0,1).map(c=>({...c,inFrame:0,outFrame:120}));base.settings=canvasSettings('9:16');
await writeFile(recovery,JSON.stringify(base));
const legacyId=crypto.randomUUID(),legacyStyle:any=structuredClone(CAPTION_PRESETS[0].style);delete legacyStyle.align;delete legacyStyle.lineHeight;delete legacyStyle.motion;
await writeFile(join(data,'caption-presets.json'),JSON.stringify([{id:legacyId,name:'이전 버전 스타일',style:legacyStyle}]));
const env=Object.fromEntries(Object.entries(process.env).filter(([k,v])=>v!==undefined&&k!=='ELECTRON_RUN_AS_NODE'));
const launch=()=>electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env:{...env,VLOGTOOL_TEST_DATA:data}});
let app=await launch(),page=await app.firstWindow();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
const state=async():Promise<Project>=>ProjectSchema.parse(JSON.parse(await readFile(recovery,'utf8')));
const library=():Promise<CaptionLibrary>=>page.evaluate(()=>window.editor.captionPresets());
const select=async(id:string)=>{await page.getByRole('button',{name:/자막 목록/}).click();await page.locator(`.caption-list-item:has(textarea[aria-label="자막 문장 ${id}"]) > button`).click();};
const tab=async(name:string)=>{const button=page.getByRole('tab',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-selected','true');};
const report:{checks:string[];render:unknown[];performance?:unknown}={checks:[],render:[]};
async function open(p:Project,name:string){const path=join(out,`${name}.vlog.json`);await writeFile(path,JSON.stringify(p));await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},path);await page.getByRole('button',{name:'열기',exact:true}).click();await expect(page.locator('footer')).toContainText('프로젝트 열기 완료',{timeout:60000});await expect(page.locator('.task-overlay')).toHaveCount(0);}
async function exportProject(p:Project,name:string){const path=join(out,`${name}.mp4`);await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},path);await page.evaluate(p=>window.editor.exportProject(p),p);return path;}
const ffmpeg=binPath(root,'ffmpeg');
async function frame(path:string,n:number,format:'rgb24'|'png'='rgb24'){
 const args=['-v','error','-i',path,'-vf',`select=eq(n\\,${n})`,'-frames:v','1'];
 args.push(...(format==='png'?['-f','image2pipe','-c:v','png','pipe:1']:['-pix_fmt','rgb24','-f','rawvideo','pipe:1']));
 return (await run(ffmpeg,args,{maxOutput:40*1024*1024})).stdout;
}
try {
 await page.getByRole('button',{name:'작업 복구'}).click();await expect(page.getByTestId('timeline-clip')).toHaveCount(1,{timeout:60000});await expect(page.locator('.task-overlay')).toHaveCount(0);
 await page.getByTestId('timeline-clip').first().click({position:{x:24,y:22}});
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'＋ 자막',exact:true}).click();
 await expect(page.getByTestId('caption-object')).toHaveCount(3);
 await expect.poll(async()=>(await state()).captions.length).toBe(3);
 const initial=await state(), ids=initial.captions.map(c=>c.id);
 const rowTops=await page.getByTestId('caption-block').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().top));expect(new Set(rowTops).size).toBe(3);
 await select(ids[0]);await page.locator(`textarea[aria-label="자막 문장 ${ids[0]}"]`).fill('오늘의 카페\n천천히 쉬어가기');await page.getByRole('heading',{name:'자막 속성'}).click();
 await page.getByRole('button',{name:'자막 복제',exact:true}).click();await expect(page.getByTestId('caption-block')).toHaveCount(4);await expect(page.getByTestId('caption-object')).toHaveCount(4);
 await page.getByRole('button',{name:'자막 삭제',exact:true}).click();await expect(page.getByTestId('caption-block')).toHaveCount(3);await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect(page.getByTestId('caption-block')).toHaveCount(4);await page.getByRole('button',{name:'다시 실행',exact:true}).click();await expect(page.getByTestId('caption-block')).toHaveCount(3);
 await select(ids[0]);const orderBefore=(await state()).captions.map(c=>c.zOrder);await page.getByRole('button',{name:'앞으로 가져오기'}).click();await expect.poll(async()=>(await state()).captions.map(c=>c.zOrder)).not.toEqual(orderBefore);await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect.poll(async()=>(await state()).captions.map(c=>c.zOrder)).toEqual(orderBefore);
 const block=page.locator(`[data-testid="caption-block"][data-caption-id="${ids[1]}"]`);await block.scrollIntoViewIfNeeded();const b=(await block.boundingBox())!;await page.mouse.move(b.x+b.width-3,b.y+12);await page.mouse.down();await page.mouse.move(b.x+b.width-33,b.y+12,{steps:6});await page.mouse.up();await expect.poll(async()=>(await state()).captions.find(c=>c.id===ids[1])!.outFrame).toBe(105);await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect.poll(async()=>(await state()).captions.find(c=>c.id===ids[1])!.outFrame).toBe(120);
 report.checks.push('three simultaneous normal captions; separate timeline rows; duplicate/delete and undo; front/back order; overlapping timeline trim');
 await select(ids[0]);await tab('꾸미기');await page.getByRole('spinbutton',{name:'자막 글자 크기',exact:true}).fill('66');await page.getByRole('spinbutton',{name:'자막 글자 크기',exact:true}).blur();await page.getByRole('button',{name:'자막 위 중앙',exact:true}).click();
 await tab('움직임');await page.getByRole('combobox',{name:'자막 등장 효과'}).selectOption('fade');await page.getByRole('combobox',{name:'자막 퇴장 효과'}).selectOption('slide');
 await tab('스타일');await expect(page.getByRole('button',{name:'디자인 이전 버전 스타일'})).toBeVisible();await page.getByRole('textbox',{name:'내 자막 설정 이름'}).fill('카페 메모');await page.getByRole('button',{name:'현재 스타일 저장',exact:true}).click();await expect.poll(async()=>(await library()).styles.length).toBe(2);
 let lib=await library();const saved=lib.styles.find(s=>s.name==='카페 메모')!;expect(saved.style.motion.enter.type).toBe('fade');expect(saved.style.size).toBe(66);
 await page.getByRole('button',{name:'카페 메모 즐겨찾기',exact:true}).click();await expect.poll(async()=>(await library()).favorites).toContain(`user:${saved.id}`);
 await page.getByRole('button',{name:'담백한 자막 즐겨찾기',exact:true}).click();await expect.poll(async()=>(await library()).favorites).toContain('builtin:minimal');
 await page.getByRole('button',{name:'★ 즐겨찾기',exact:true}).click();await expect(page.locator('.caption-preset')).toHaveCount(2);
 await select(ids[1]);const beforeApply=effectiveStyle(await state(),(await state()).captions.find(c=>c.id===ids[1])!);await page.getByRole('button',{name:'디자인 카페 메모',exact:true}).click();
 await expect.poll(async()=>effectiveStyle(await state(),(await state()).captions.find(c=>c.id===ids[1])!).motion.enter.type).toBe('fade');
 const afterApply=effectiveStyle(await state(),(await state()).captions.find(c=>c.id===ids[1])!);expect(afterApply.size).toBe(beforeApply.size);expect(afterApply.position).toEqual(beforeApply.position);expect(afterApply.maxWidth).toBe(beforeApply.maxWidth);
 await page.getByRole('checkbox',{name:'크기·위치도 적용'}).check();await page.getByRole('button',{name:'디자인 카페 메모',exact:true}).click();await expect.poll(async()=>effectiveStyle(await state(),(await state()).captions.find(c=>c.id===ids[1])!).size).toBe(66);await page.getByRole('checkbox',{name:'크기·위치도 적용'}).uncheck();
 await page.getByRole('textbox',{name:'저장 스타일 새 이름'}).fill('카페 기본');await page.getByRole('button',{name:'이름 변경',exact:true}).click();await expect.poll(async()=>(await library()).styles.find(s=>s.id===saved.id)!.name).toBe('카페 기본');
 await tab('꾸미기');await page.getByRole('spinbutton',{name:'배경 불투명도 (%)',exact:true}).fill('35');await page.getByRole('spinbutton',{name:'배경 불투명도 (%)',exact:true}).blur();await page.getByRole('combobox',{name:'자막 문단 정렬'}).selectOption('left');await page.getByRole('spinbutton',{name:'자막 줄 간격',exact:true}).fill('1.8');await page.getByRole('spinbutton',{name:'자막 줄 간격',exact:true}).blur();
 await page.screenshot({path:join(out,'02-decorate.png')});await tab('스타일');await page.getByRole('button',{name:'현재 설정으로 덮어쓰기',exact:true}).click();await expect.poll(async()=>(await library()).styles.find(s=>s.id===saved.id)!.style.opacity).toBe(.35);
 expect(effectiveStyle(await state(),(await state()).captions.find(c=>c.id===ids[0])!).opacity).toBe(.96);
 await page.getByRole('button',{name:'스타일 복제',exact:true}).click();await expect.poll(async()=>(await library()).styles.length).toBe(3);
 await page.getByRole('button',{name:'스타일 삭제',exact:true}).click();await expect.poll(async()=>(await library()).styles.length).toBe(2);expect((await library()).favorites).not.toContain(`user:${saved.id}`);expect(effectiveStyle(await state(),(await state()).captions.find(c=>c.id===ids[1])!).opacity).toBe(.35);
 await page.getByRole('button',{name:'전체',exact:true}).click();await page.getByRole('textbox',{name:'자막 스타일 검색'}).fill('노랑');await expect(page.locator('.caption-preset')).toHaveCount(1);await page.getByRole('textbox',{name:'자막 스타일 검색'}).fill('');await page.getByRole('combobox',{name:'자막 스타일 분류'}).selectOption('감성·메모');await expect(page.locator('.caption-preset')).toHaveCount(4);await page.getByRole('combobox',{name:'자막 스타일 분류'}).selectOption('all');
 await page.screenshot({path:join(out,'01-style-library.png')});await tab('움직임');await page.screenshot({path:join(out,'03-motion.png')});await page.getByRole('button',{name:'▶ 움직임 미리보기'}).click();await expect(page.getByRole('button',{name:'일시 정지',exact:true})).toBeVisible();await page.getByRole('button',{name:'일시 정지',exact:true}).click();
 report.checks.push('legacy library migration; favorites; search/categories; saved motion; appearance-only and layout opt-in; rename/overwrite/copy/delete; applied captions detached; percentage opacity/alignment/line spacing; preview playback');
 const stableLibrary=await library();await open(base,'another-project');await page.getByRole('button',{name:'＋ 자막',exact:true}).click();expect(await library()).toEqual(stableLibrary);
 await app.close();app=await launch();page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.getByRole('button',{name:'작업 복구'}).click();await expect(page.getByTestId('caption-block')).toHaveCount(1,{timeout:60000});await expect(page.locator('.task-overlay')).toHaveCount(0);await select((await state()).captions[0].id);expect(await library()).toEqual(stableLibrary);
 await page.getByRole('button',{name:'★ 즐겨찾기',exact:true}).click();await expect(page.locator('.caption-preset')).toHaveCount(1);expect(JSON.parse(await readFile(join(data,'caption-presets.json'),'utf8')).version).toBe(1);
 report.checks.push('library survives project switch and application restart');
 const normalized=await state();
 for(const preset of CANVAS_PRESETS){
  let p=structuredClone(normalized);p.settings=canvasSettings(preset.id);p.captions=[];p.clips=p.clips.slice(0,1).map(c=>({...c,inFrame:0,outFrame:45}));
  for(let i=0;i<4;i++){
   p=addCaption(p,p.clips[0].id,'normal',0).project;const c=p.captions[i],motion=noMotion();motion.enter.type=(['fade','pop','slide','fade'] as const)[i];motion.exit.type=(['slide','fade','pop','pop'] as const)[i];motion.exit.direction='right';
   c.text=['성수동 작은 카페','오늘은 천천히\n잠깐 쉬어가기','정말 맛있다!','한 프레임'][i];c.inFrame=[3,0,9,22][i];c.outFrame=[39,45,30,23][i];
   c.overrides={...structuredClone(CAPTION_PRESETS[[1,2,5,3][i]].style),size:38,position:{h:.5,v:.5,x:.5,y:[.2,.75,.48,.36][i]},align:(['left','center','right','center'] as const)[i],lineHeight:1.8,motion};
  }
  const ratio=preset.id.replace(':','x');await open(p,`animation-${ratio}`);
  const video=await exportProject(p,`animation-${ratio}`),naked=await exportProject({...p,captions:[]},`background-${ratio}`);
  expect(Number((await probe(root,video)).streams.find(s=>s.codec_type==='video')!.nb_frames)).toBe(45);
  const samples=[];
  for(const n of [0,3,7,12,21,22,29,38,44]){
   const spans=activeCaptionSpans(p,n), requests=spans.map(s=>({text:s.caption.text,style:effectiveStyle(p,s.caption),width:preset.width,height:preset.height}));
   const bitmaps=await page.evaluate(async rs=>Promise.all(rs.map(r=>window.editor.captionBitmap(r))),requests);
   const items=spans.map((s,i)=>({bitmap:bitmaps[i],rect:captionRect(bitmaps[i],requests[i].style,p.settings,p.captionSettings.margins),transform:captionTransform(requests[i].style.motion,s.start,s.end,n,Math.min(preset.width,preset.height))}));
   const background=await frame(naked,n,'png');
   const expectedUrl=await page.evaluate(async ({w,h,base,items})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d')!;const bg=new Image();bg.src=base;await bg.decode();ctx.drawImage(bg,0,0);for(const item of items){const img=new Image();img.src=item.bitmap.url;await img.decode();const r=item.rect,t=item.transform;ctx.save();ctx.globalAlpha=t.alpha;ctx.translate(r.left+r.width/2+t.x,r.top+r.height/2+t.y);ctx.scale(t.scale,t.scale);ctx.drawImage(img,-r.width/2,-r.height/2);ctx.restore();}return c.toDataURL('image/png');},{w:preset.width,h:preset.height,base:`data:image/png;base64,${background.toString('base64')}`,items});
   const reference=join(out,`${ratio}-frame-${n}.png`);await writeFile(reference,Buffer.from(expectedUrl.split(',')[1],'base64'));
   const [expected,actual,bare]=await Promise.all([frame(reference,0),frame(video,n),frame(naked,n)]);let sum=0,inkError=0,inkCount=0;
   for(let k=0;k<expected.length;k++){const error=Math.abs(expected[k]-actual[k]);sum+=error;if(Math.abs(expected[k]-bare[k])>20){inkError+=error;inkCount++;}}
   const mean=sum/expected.length,inkMean=inkCount?inkError/inkCount:0;expect(mean).toBeLessThan(3);expect(inkMean).toBeLessThan(12);samples.push({frame:n,mean,inkMean});
  }
  if(preset.id==='9:16'){
   await page.getByRole('button',{name:'자막 목록 · 4'}).click();await select(p.captions[1].id);await page.getByRole('button',{name:'다음 프레임',exact:true}).click();
   const img=page.locator(`[data-testid="caption-object"][data-caption-id="${p.captions[1].id}"] > img`);await expect(img).toBeVisible();const expected=captionTransform(effectiveStyle(p,p.captions[1]).motion,0,45,1,1080);await expect.poll(async()=>Number(await img.evaluate(e=>getComputedStyle(e).opacity))).toBeCloseTo(expected.alpha,4);
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible())!.setSize(1100,760));await tab('움직임');await page.screenshot({path:join(out,'04-small-window.png')});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible())!.setSize(1440,960));
  }
  report.render.push({ratio:preset.id,samples,video});console.log(JSON.stringify({ratio:preset.id,samples}));
 }
 // 200 independently animated captions, with 10 overlapping at any moment.
 let many=structuredClone(normalized);many.captions=[];many.clips=many.clips.slice(0,1).map(c=>({...c,inFrame:0,outFrame:120}));many.settings=canvasSettings('9:16');
 for(let i=0;i<200;i++){many=addCaption(many,many.clips[0].id,'normal',0).project;const c=many.captions[i],m=noMotion();m.enter.type='pop';m.exit.type='fade';m.enter.frames=3;m.exit.frames=3;c.inFrame=Math.floor(i/10)*6;c.outFrame=c.inFrame+6;c.text=`메모 ${i+1}`;c.overrides={size:22,padding:5,position:{h:.5,v:.5,x:i%2===0?.28:.72,y:.15+Math.floor(i%10/2)*.16},motion:m};}
 const openStart=Date.now();await open(many,'200-moving-captions');await expect(page.getByTestId('caption-block')).toHaveCount(200);const openMs=Date.now()-openStart;await page.getByRole('button',{name:'자막 목록 · 200'}).click();const selectStart=Date.now();await select(many.captions[5].id);await expect(page.getByRole('heading',{name:'일반 자막',exact:true})).toBeVisible();const selectMs=Date.now()-selectStart;
 const started=Date.now(),output=await exportProject(many,'200-moving-captions');const exportMs=Date.now()-started;
 const memory=await app.evaluate(({app})=>app.getAppMetrics().map(m=>({type:m.type,workingSetSize:m.memory.workingSetSize,peakWorkingSetSize:m.memory.peakWorkingSetSize})));
 report.performance={captions:200,simultaneous:10,openMs,selectMs,exportMs,memory,output};expect(openMs).toBeLessThan(15000);expect(selectMs).toBeLessThan(2000);expect(exportMs).toBeLessThan(120000);
 const cancelledPath=join(out,'cancel-moving.mp4');await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},cancelledPath);
 const cancelled=await page.evaluate(async p=>{let cancelled=false;const off=window.editor.onProgress(progress=>{if(!cancelled&&progress.percent>0&&progress.percent<20){cancelled=true;void window.editor.cancelTask();}});try{await window.editor.exportProject(p);return false;}catch(e){return cancelled&&String(e).includes('취소');}finally{off();}},many);expect(cancelled).toBe(true);await expect(stat(cancelledPath)).rejects.toMatchObject({code:'ENOENT'});
 expect(await readdir(join(data,'cache/captions'))).toEqual([]);expect(errors).toEqual([]);report.checks.push('6 aspect ratios x 9 output frame comparisons, including text-only error; one-frame animation; 200 moving captions; animated export cancellation and cleanup');
 const styles=await page.evaluate(async presets=>Promise.all(presets.map(async p=>({name:p.name,category:p.category,bitmap:await window.editor.captionBitmap({text:'오늘의 작은 순간',style:{...p.style,size:54},width:1080,height:1080})}))),CAPTION_PRESETS);
 const sheet=await page.evaluate(async styles=>{const categories=[...new Set(styles.map(s=>s.category))];const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=categories.length*250+100;const ctx=canvas.getContext('2d')!;await document.fonts.load('600 26px VlogSans');ctx.fillStyle='#111b18';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#e6f4eb';ctx.font='600 32px VlogSans';ctx.fillText('장면 · 20가지 자막 스타일',36,58);for(const [row,category]of categories.entries()){ctx.fillStyle='#9cc9ae';ctx.font='600 22px VlogSans';ctx.fillText(category,36,116+row*250);for(const [col,item]of styles.filter(s=>s.category===category).entries()){const x=36+col*350,y=135+row*250;ctx.fillStyle='#314139';ctx.beginPath();ctx.roundRect(x,y,328,176,12);ctx.fill();const img=new Image();img.src=item.bitmap.url;await img.decode();const scale=Math.min(292/img.width,94/img.height);ctx.drawImage(img,x+164-img.width*scale/2,y+76-img.height*scale/2,img.width*scale,img.height*scale);ctx.fillStyle='#d9e9de';ctx.font='500 18px VlogSans';ctx.fillText(item.name,x+16,y+152);}}return canvas.toDataURL('image/png');},styles);
 await writeFile(join(out,'20-caption-styles.png'),Buffer.from(sheet.split(',')[1],'base64'));
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await writeFile(join(root,'artifacts/latest-caption-upgrade.json'),JSON.stringify({out,...report},null,2));console.log(JSON.stringify({out,...report}));
}catch(e){await page.screenshot({path:join(out,'failure.png')});console.error(await page.locator('body').innerText());throw e;}finally{await app.close();}
