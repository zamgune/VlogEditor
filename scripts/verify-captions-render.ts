import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CANVAS_PRESETS, canvasSettings, framingFilter } from '../src/shared/canvas';
import { ProjectSchema, type Project } from '../src/shared/project';
import { addCaption, captionRect, captionSpans, effectiveStyle, CAPTION_PRESETS } from '../src/shared/captions';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';
const root=resolve('.'), id=`caption-render-${new Date().toISOString().replace(/[:.]/g,'-')}`, out=join(root,'output/playwright',id), data=join(root,'.vlogtool-test',id);
await mkdir(out,{recursive:true}); await mkdir(data,{recursive:true});
const fixture=JSON.parse(await readFile(join(root,'artifacts/latest-media.json'),'utf8'));
const env=Object.fromEntries(Object.entries(process.env).filter(([k,v])=>v!==undefined&&k!=='ELECTRON_RUN_AS_NODE'));
const app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[root],cwd:root,env:{...env,VLOGTOOL_TEST_DATA:data}});
const page=await app.firstWindow(), ffmpeg=binPath(root,'ffmpeg'), results:unknown[]=[];
async function exportProject(p:Project,name:string) { const path=join(out,`${name}.mp4`); await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},path); await page.evaluate(p=>window.editor.exportProject(p),p); return path; }
async function frame(path:string,n:number) { return (await run(ffmpeg,['-v','error','-i',path,'-vf',`select=eq(n\\,${n})`,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxOutput:40*1024*1024})).stdout; }
try {
 await expect(page.getByRole('button',{name:'＋ 영상 가져오기'})).toBeEnabled();
 await app.evaluate(({dialog},filePaths)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths});},fixture.sourceFiles.slice(0,2));
 await page.getByRole('button',{name:'＋ 영상 가져오기'}).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(2,{timeout:60000}); await expect(page.locator('.task-overlay')).toHaveCount(0);
 const saved=join(out,'base.vlog.json'); await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},saved); await page.getByRole('button',{name:'저장 Ctrl S'}).click(); await expect.poll(async()=>{try{return(await stat(saved)).size;}catch{return 0;}}).toBeGreaterThan(100);
 const base=ProjectSchema.parse(JSON.parse(await readFile(saved,'utf8')));
 for (const preset of CANVAS_PRESETS) {
  let p=structuredClone(base); p.clips=p.clips.slice(0,1).map(c=>({...c,outFrame:60})); p.settings=canvasSettings(preset.id);
  p=addCaption(p,p.clips[0].id,'normal',0).project; p.captions[0]={...p.captions[0],inFrame:10,outFrame:30,text:'오늘의 하루 · Hello!\n두 줄도 같은 크기로'};
  p.captions.push({...structuredClone(p.captions[0]),id:crypto.randomUUID(),inFrame:30,outFrame:50,text:'다음 문장입니다',overrides:{...CAPTION_PRESETS[1].style,size:54}});
  p=addCaption(p,p.clips[0].id,'emphasis',20).project; const emphasis=p.captions.find(c=>c.kind==='emphasis')!; emphasis.outFrame=40; emphasis.text='정말 맛있다!'; emphasis.overrides={...CAPTION_PRESETS[5].style};
  p=addCaption(p,p.clips[0].id,'title',0).project;
  const name=preset.id.replace(':','x'), path=await exportProject(p,name);
  const vs=(await probe(root,path)).streams.find(s=>s.codec_type==='video')!; expect([vs.width,vs.height,Number(vs.nb_frames)]).toEqual([preset.width,preset.height,60]);
  const media=p.media[0], proxy=join(data,'cache/normalized',`${media.fingerprint}-native1920-30-bt709-v3.mp4`);
  const basePng=(await run(ffmpeg,['-v','error','-i',proxy,'-vf',`select=eq(n\\,25),${framingFilter(media.displayWidth!,media.displayHeight!,p.settings,p.clips[0].framing)},format=rgb24`,'-frames:v','1','-f','image2pipe','-c:v','png','pipe:1'])).stdout;
  const requests=captionSpans(p).filter(s=>s.start<=25&&s.end>25).sort((a,b)=>(a.caption.kind==='emphasis'?1:0)-(b.caption.kind==='emphasis'?1:0)).map(s=>({text:s.caption.text,style:effectiveStyle(p,s.caption),width:preset.width,height:preset.height}));
  const bitmaps=await page.evaluate(async requests=>Promise.all(requests.map(r=>window.editor.captionBitmap(r))),requests);
  const items=bitmaps.map((bitmap,i)=>({bitmap,rect:captionRect(bitmap,requests[i].style,p.settings,p.captionSettings.margins)}));
  const reference=await page.evaluate(async ({w,h,base,items})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d')!; const image=new Image();image.src=base;await image.decode();ctx.drawImage(image,0,0);for(const {bitmap,rect} of items){const img=new Image();img.src=bitmap.url;await img.decode();ctx.drawImage(img,rect.left,rect.top);}return c.toDataURL('image/png');},{w:preset.width,h:preset.height,base:`data:image/png;base64,${basePng.toString('base64')}`,items});
  const refPath=join(out,`${name}-expected.png`); await writeFile(refPath,Buffer.from(reference.split(',')[1],'base64'));
  const expected=await frame(refPath,0), actual=await frame(path,25);
  const mean=expected.reduce((s,v,i)=>s+Math.abs(v-actual[i]),0)/expected.length; expect(mean).toBeLessThan(3);
  const placement=items.map(({rect})=>{
    let best={dx:0,dy:0,error:Infinity};
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++) {let sum=0,n=0;for(let y=rect.top+3;y<rect.top+rect.height-3;y+=2)for(let x=rect.left+3;x<rect.left+rect.width-3;x+=2){const a=(y*preset.width+x)*3,b=((y+dy)*preset.width+x+dx)*3;sum+=Math.abs(expected[a]-actual[b])+Math.abs(expected[a+1]-actual[b+1])+Math.abs(expected[a+2]-actual[b+2]);n+=3;}if(sum/n<best.error)best={dx,dy,error:sum/n};} expect(Math.abs(best.dx)).toBeLessThanOrEqual(1);expect(Math.abs(best.dy)).toBeLessThanOrEqual(1);return best;
  });
  if(preset.id==='9:16') {
    const naked=await exportProject({...p,captions:[]},'no-captions');
    for(const n of [0,9,10,19,20,29,30,39,40,49,50,59]) {
      const [a,b]=await Promise.all([frame(path,n),frame(naked,n)]);
      for (const kind of ['normal','emphasis','title'] as const) {
        const active=captionSpans(p).find(s=>s.caption.kind===kind&&s.start<=n&&s.end>n);
        const request=kind==='normal'&&n>=30?{text:p.captions[1].text,style:effectiveStyle(p,p.captions[1]),width:preset.width,height:preset.height}:requests.find(r=>r.text===(kind==='normal'?p.captions[0].text:kind==='emphasis'?emphasis.text:'나의 하루 기록'))!;
        const bitmap=await page.evaluate(r=>window.editor.captionBitmap(r),request), r=captionRect(bitmap,request.style,p.settings,p.captionSettings.margins);
        let sum=0,count=0;for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++){const k=(y*preset.width+x)*3;sum+=Math.abs(a[k]-b[k])+Math.abs(a[k+1]-b[k+1])+Math.abs(a[k+2]-b[k+2]);count+=3;}
        if(active)expect(sum/count).toBeGreaterThan(4);else expect(sum/count).toBeLessThan(2);
      }
    }
  }
  results.push({ratio:preset.id,mean,placement,path}); console.log(JSON.stringify(results.at(-1)));
 }
 let many=structuredClone(base); many.captions=[];
 for(const clip of many.clips) for(let n=0;n<99;n++) many.captions.push({id:crypto.randomUUID(),clipId:clip.id,kind:'normal',zOrder:n,text:`메모 ${n+1}`,inFrame:n,outFrame:n+1,overrides:{}});
 many=addCaption(many,many.clips[0].id,'title',0).project; many=addCaption(many,many.clips[0].id,'emphasis',0).project; expect(many.captions.length).toBe(200);
 const manyPath=join(out,'200-captions.vlog.json');await writeFile(manyPath,JSON.stringify(many)); await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},manyPath);await page.getByRole('button',{name:'열기',exact:true}).click();await expect(page.getByTestId('caption-block')).toHaveCount(200,{timeout:60000});
 await page.getByRole('button',{name:'자막 목록 · 200'}).click();await expect(page.locator('.caption-list textarea')).toHaveCount(200);const started=Date.now();const manyVideo=await exportProject(many,'200-captions');results.push({captions:200,exportMs:Date.now()-started,path:manyVideo});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible())!.setSize(1100,760));await page.screenshot({path:join(out,'200-captions-small.png')});
 // A failed caption must prevent an apparently successful MP4 and clean its temporary images.
 const failed=structuredClone(many); failed.captions=failed.captions.filter(c=>c.kind==='title'); failed.captions[0].text='화면 밖 테스트'; failed.captions[0].overrides.position={h:.5,v:.5,x:2,y:.5};
 await expect(exportProject(failed,'overflow-rejected')).rejects.toThrow(/화면을 벗어난 자막.*화면 밖 테스트/);
 failed.captions[0].text='긴 문장 테스트\n'.repeat(200); failed.captions[0].overrides={size:200};
 await expect(exportProject(failed,'render-failure-rejected')).rejects.toThrow(/자막 렌더링 실패.*긴 문장 테스트/);
 // Cancel while constructing the overlay, then during FFmpeg encoding.
 for(const phase of ['overlay','encoding'] as const) {
   const target=join(out,`cancel-${phase}.mp4`); await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},target);
   const result=await page.evaluate(async ({project,phase})=>{
     let cancelled=false; const off=window.editor.onProgress(p=>{if(!cancelled&&p.kind==='export'&&p.percent>0&&(phase==='overlay'?p.percent<20:p.percent>20&&p.percent<100)){cancelled=true;void window.editor.cancelTask();}});
     try {await window.editor.exportProject(project);return {cancelled,error:''};}catch(e){return {cancelled,error:String(e)};}finally{off();}
   },{project:many,phase});
   expect(result.cancelled).toBe(true);expect(result.error).toContain('취소');
 }
 for(const name of ['overflow-rejected','render-failure-rejected','cancel-overlay','cancel-encoding']) await expect(stat(join(out,`${name}.mp4`))).rejects.toMatchObject({code:'ENOENT'});
 expect(await readdir(join(data,'cache/captions'))).toEqual([]);expect((await readdir(out)).filter(n=>n.endsWith('.partial.mp4'))).toEqual([]);
 results.push({failureChecks:['overflow blocks export','render failure identifies caption','overlay cancellation','encoding cancellation','no incomplete MP4 or temporary images']});
 await writeFile(join(out,'report.json'),JSON.stringify(results,null,2));await writeFile(join(root,'artifacts/latest-caption-render.json'),JSON.stringify({out,results},null,2));
}catch(e){await page.screenshot({path:join(out,'failure.png')});throw e;}finally{await app.close();}
