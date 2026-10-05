import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { newProject, addMedia, ProjectSchema } from '../src/shared/project';
import { addCaption, CAPTION_PRESETS } from '../src/shared/captions';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';

const source=resolve(process.argv[2]), root=resolve('.');
const id=`caption-example-${new Date().toISOString().replace(/[:.]/g,'-')}`;
const out=join(root,'artifacts',id), data=join(root,'.vlogtool-test',id);
await mkdir(out,{recursive:true});await mkdir(data,{recursive:true});
const hash=async()=>createHash('sha256').update(await readFile(source)).digest('hex');
const before=await hash();
const env=Object.fromEntries(Object.entries(process.env).filter(([k,v])=>v!==undefined&&k!=='ELECTRON_RUN_AS_NODE'));
const app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env:{...env,VLOGTOOL_TEST_DATA:data}});
const page=await app.firstWindow();
try {
 await expect(page.getByRole('button',{name:'＋ 영상 가져오기'})).toBeEnabled();
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);
 const imported=await page.evaluate(()=>window.editor.importMedia());expect(imported.errors).toEqual([]);
 let p=addMedia(newProject(),imported.media);p.name='산책 브이로그 · 자막 예시';
 p=addCaption(p,p.clips[0].id,'title',0).project;
 p=addCaption(p,p.clips[0].id,'normal',0).project;
 p=addCaption(p,p.clips[0].id,'emphasis',0).project;
 p.captions[0].text='오늘의 산책 기록';p.captionSettings.title.size=82;
 p.captions[1].text='걷다가 만난 초록이 좋아서';
 p.captions[2].text='천천히, 가볍게';p.captions[2].outFrame=90;
 p.captionSettings.emphasis={...structuredClone(CAPTION_PRESETS[7].style),size:72};
 p=ProjectSchema.parse(p);
 const project=join(out,'산책_자막예시.vlog.json'), video=join(out,'산책_자막예시.mp4');await writeFile(project,JSON.stringify(p,null,2));
 await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},video);
 await page.evaluate(p=>window.editor.exportProject(p),p);
 await run(binPath(root,'ffmpeg'),['-v','error','-i',video,'-vf','select=eq(n\\,39)','-frames:v','1',join(out,'자막_예시.png')]);
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},project);
 await page.getByRole('button',{name:'열기',exact:true}).click();await expect(page.getByTestId('caption-object')).toHaveCount(3);
 await page.getByRole('button',{name:'자막 목록 · 3'}).click();await page.locator('.caption-list-item > button').filter({hasText:'일반 자막'}).click();
 await expect(page.locator('.caption-preset img')).toHaveCount(20);await page.screenshot({path:join(out,'편집_화면.png')});
 await page.getByRole('button',{name:'크게 보기',exact:true}).click();await page.screenshot({path:join(out,'큰_미리보기.png')});
 const requests=CAPTION_PRESETS.map(preset=>({text:'오늘의 작은 순간\nHello, vlog!',style:preset.style,width:1080,height:1920}));
 const bitmaps=await page.evaluate(async requests=>Promise.all(requests.map(r=>window.editor.captionBitmap(r))),requests);
 const sheet=await page.evaluate(async ({bitmaps,names})=>{
   await document.fonts.load('600 26px VlogSans');
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.ceil(bitmaps.length/2)*300;const ctx=canvas.getContext('2d')!;
   ctx.fillStyle='#111c18';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='600 26px VlogSans';
   for(let i=0;i<bitmaps.length;i++){
     const x=24+i%2*600,y=24+Math.floor(i/2)*300;ctx.fillStyle='#344b41';ctx.beginPath();ctx.roundRect(x,y,552,260,14);ctx.fill();
     ctx.fillStyle='#cbe3d4';ctx.fillText(names[i],x+22,y+43);
     const img=new Image();img.src=bitmaps[i].url;await img.decode();const scale=Math.min(496/img.width,164/img.height);
     ctx.drawImage(img,x+276-img.width*scale/2,y+160-img.height*scale/2,img.width*scale,img.height*scale);
   }
   return canvas.toDataURL('image/png');
 },{bitmaps,names:CAPTION_PRESETS.map(p=>p.name)});
 await writeFile(join(out,'자막_디자인_20종.png'),Buffer.from(sheet.split(',')[1],'base64'));
 const after=await hash();expect(after).toBe(before);
 const v=(await probe(root,video)).streams.find(s=>s.codec_type==='video')!;expect(Number(v.nb_frames)).toBe(p.clips[0].outFrame);
 const report={out,project,video,sourceUnchanged:before===after,sourceSha256:after,frames:v.nb_frames};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));await writeFile(join(root,'artifacts/latest-caption-example.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await app.close();}
