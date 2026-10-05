import test from 'node:test';
import assert from 'node:assert/strict';
import { addMedia, newProject, ProjectSchema, split, trim, moveClip, removeClip, duration, type Media } from '../src/shared/project';
import { addCaption, captionRange, captionRect, captionSpans, effectiveStyle, splitCaption, duplicateCaption, reorderCaption, fitNewCaption, captionRows, activeCaptionSpans, CaptionLibrarySchema, presetPatch, noMotion, motionDurations, captionTransform, captionSceneBoundaries, CAPTION_PRESETS } from '../src/shared/captions';
const media: Media = { id: crypto.randomUUID(), path: 'C:/fixture.mp4', name: 'fixture', fingerprint: 'fixture', durationFrames: 300, width: 720, height: 1280, codec: 'h264', sourceFps: 30, timeBase: '1/30', startTime: 0, rotation: 0, hasAudio: false, warnings: [] };
const fixture = () => addMedia(newProject(), [media, { ...media, id: crypto.randomUUID() }]);
test('legacy versions migrate to empty captions with responsive default styles', () => {
  const { captions: _, captionSettings: __, ...old } = fixture();
  for (const version of [1,2,3]) { const p = ProjectSchema.parse({ ...old, version }); assert.equal(p.version, 7); assert.deepEqual(p.captions, []); assert.equal(p.captionSettings.normal.size, 54); }
});
test('new captions start at the playhead; normal ends at clip end and emphasis uses up to 60 frames', () => {
  let p = fixture(); const c = p.clips[0]; const a = addCaption(p, c.id, 'normal', 100); p = a.project;
  assert.deepEqual([p.captions[0].inFrame, p.captions[0].outFrame], [100, 300]); assert.notEqual(addCaption(p,c.id,'normal',200).id,a.id);
  p = addCaption(p,c.id,'emphasis',280).project; assert.deepEqual([p.captions[1].inFrame,p.captions[1].outFrame],[280,300]);
});
test('caption trim, split and drag allow overlapping siblings but respect the clip', () => {
  let p = fixture(); const a = addCaption(p, p.clips[0].id, 'normal', 0); p = splitCaption(a.project, a.id, 100);
  assert.equal(p.captions.length,2); p = captionRange(p,a.id,0,200); assert.equal(p.captions[0].outFrame,200);
  ProjectSchema.parse({ ...p, captions: p.captions.map(c => ({ ...c, inFrame: 0 })) });
  assert.equal(splitCaption(p,a.id,0),p); assert.equal(splitCaption(p,a.id,200),p);
  p = captionRange(p, a.id, -50, 500); assert.deepEqual([p.captions[0].inFrame,p.captions[0].outFrame],[0,300]);
});

test('sequential and overlapping pairs switch on the exact frame in a trimmed later scene', () => {
  let p = fixture(); p = trim(p, p.clips[0].id, 0, 30); p = trim(p, p.clips[1].id, 30, 120);
  const clip = p.clips[1], ids: string[] = [];
  for (const [start, end] of [[30, 75], [30, 75], [75, 120], [75, 120]]) {
    const added = addCaption(p, clip.id, 'normal', start); ids.push(added.id); p = captionRange(added.project, added.id, start, end);
  }
  const visible = (frame: number) => activeCaptionSpans(p, frame).map(s => s.caption.id);
  assert.deepEqual(visible(29), []);
  assert.deepEqual(visible(30), ids.slice(0, 2)); assert.deepEqual(visible(74), ids.slice(0, 2));
  assert.deepEqual(visible(75), ids.slice(2)); assert.deepEqual(visible(119), ids.slice(2)); assert.deepEqual(visible(120), []);
  assert.deepEqual(captionSceneBoundaries(p), [0, 30, 75, 120]);
  assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(p))).captions, p.captions);
});
test('v4 migration preserves appearance and original normal/title/emphasis order', () => {
  let p=fixture(); for (const kind of ['emphasis','title','normal'] as const) p=addCaption(p,p.clips[0].id,kind,0).project;
  const old=JSON.parse(JSON.stringify({...p,version:4}));
  for(const c of old.captions){delete c.zOrder; c.overrides={};}
  for(const kind of ['normal','emphasis','title']){delete old.captionSettings[kind].motion;delete old.captionSettings[kind].align;delete old.captionSettings[kind].lineHeight;}
  const next=ProjectSchema.parse(old); assert.equal(next.version,7);
  assert.deepEqual(activeCaptionSpans(next,0).map(s=>s.caption.kind),['normal','title','emphasis']);
  assert.deepEqual(next.captions[0].overrides,{});assert.equal(next.captionSettings.normal.lineHeight,1.4);assert.deepEqual(next.captionSettings.normal.motion,noMotion());
  assert.deepEqual(ProjectSchema.parse(next),next);
});
test('overlapping captions offset, duplicate independently, reorder and pack separate rows', () => {
  let p=fixture();for(let i=0;i<3;i++)p=addCaption(p,p.clips[0].id,'normal',0).project;
  assert.equal(captionRows(captionSpans(p)).length,3);assert.equal(new Set(p.captions.map(c=>JSON.stringify(effectiveStyle(p,c).position))).size,3);
  const source=p.captions[0], duplicate=duplicateCaption(p,source.id);p=duplicate.project;
  assert.equal(p.captions.length,4);assert.notEqual(duplicate.id,source.id);
  const oldTop=activeCaptionSpans(p,0).at(-1)!.caption.id;p=reorderCaption(p,oldTop,-1);
  assert.notEqual(activeCaptionSpans(p,0).at(-1)!.caption.id,oldTop);
  p.captions.at(-1)!.overrides.color='#ff0000';assert.notEqual(effectiveStyle(p,source).color,'#ff0000');
  const divided=split(p,p.clips[0].id,100);assert.equal(divided.captions.length,8);ProjectSchema.parse(divided);
  assert.equal(captionRows([{caption:source,start:0,end:10},{caption:{...source,id:crypto.randomUUID()},start:10,end:20}]).length,1);
});
test('library migrates legacy styles, validates favorites and returns detached appearance patches', () => {
  const legacy=[{id:crypto.randomUUID(),name:'이전 스타일',style:structuredClone(CAPTION_PRESETS[0].style)}];
  const library=CaptionLibrarySchema.parse(legacy);assert.equal(library.version,2);assert.deepEqual(library.favorites,[]);
  assert.equal(CAPTION_PRESETS.length,20);assert.equal(new Set(CAPTION_PRESETS.map(p=>p.id)).size,20);
  library.favorites=['builtin:vlog',`user:${legacy[0].id}`];assert.deepEqual(CaptionLibrarySchema.parse(library),library);
  assert.throws(()=>CaptionLibrarySchema.parse({...library,favorites:['user:missing']}));
  assert.throws(()=>CaptionLibrarySchema.parse({...library,styles:[...legacy,...legacy]}));
  const patch=presetPatch(legacy[0].style);assert.equal(patch.size,undefined);assert.equal(patch.position,undefined);assert.equal(patch.maxWidth,undefined);
  patch.motion!.enter.type='pop';assert.equal(legacy[0].style.motion.enter.type,'none');assert.equal(presetPatch(legacy[0].style,true).size,54);
});
test('front/back skips captions belonging to other scenes', () => {
  let p=fixture();const first=addCaption(p,p.clips[0].id,'normal',0);p=first.project;
  p=addCaption(p,p.clips[1].id,'normal',0).project;p=addCaption(p,p.clips[0].id,'normal',0).project;
  p=reorderCaption(p,first.id,1,0);assert.equal(activeCaptionSpans(p,0).at(-1)!.caption.id,first.id);
});
test('new caption placement uses measured bitmap bounds and preserves existing captions', () => {
  let p=fixture();p=addCaption(p,p.clips[0].id,'normal',0).project;const first=p.captions[0];
  p=addCaption(p,p.clips[0].id,'normal',0).project;const id=p.captions[1].id;
  p.captions[1].overrides.position={h:1,v:1,x:.2,y:.1};const bitmap={width:800,height:500};
  p=fitNewCaption(p,id,bitmap);assert.equal(captionRect(bitmap,effectiveStyle(p,p.captions[1]),p.settings,p.captionSettings.margins).overflow,false);
  assert.equal(p.captions[0],first);assert.equal(fitNewCaption(p,id,bitmap),p);
});
test('motion durations keep a full frame and frame-based transforms remain deterministic', () => {
  const motion=noMotion();motion.enter.type='fade';motion.exit.type='slide';
  for(let length=1;length<40;length++){
    const d=motionDurations(motion,length);assert.ok(d.enter+d.exit<=length-1);
    const still=captionTransform(motion,10,10+length,10+d.enter,1080);assert.deepEqual(still,{alpha:1,scale:1,x:0,y:0});
  }
  assert.equal(captionTransform(motion,10,70,10,1080).alpha,0);
  assert.equal(captionTransform(motion,10,70,69,1080).alpha,0);
  assert.equal(captionTransform(motion,10,70,14,1080).alpha,4/9);
  motion.enter.type='pop';assert.equal(captionTransform(motion,0,60,0,1080).scale,.72);
  motion.enter.type='slide';motion.enter.direction='left';
  assert.equal(captionTransform(motion,0,60,0,1080).x,48);assert.equal(captionTransform(motion,0,60,0,540).x,24);
});
test('scene boundaries rasterize only moving windows and honor trimmed spans', () => {
  let p=fixture();p=addCaption(p,p.clips[0].id,'normal',0).project;
  assert.deepEqual(captionSceneBoundaries(p),[0,300,600]);
  const motion=noMotion();motion.enter.type='fade';motion.exit.type='pop';p.captions[0].overrides.motion=motion;
  const boundaries=captionSceneBoundaries(p);assert.ok(boundaries.includes(9));assert.ok(boundaries.includes(291));assert.ok(!boundaries.includes(150));
  p=trim(p,p.clips[0].id,100,200);const span=captionSpans(p)[0];assert.deepEqual([span.start,span.end],[0,100]);
  assert.equal(captionTransform(motion,span.start,span.end,0,1080).alpha,0);
});
test('video split assigns intersecting source intervals to new clips', () => {
  let p = fixture(); p = addCaption(p,p.clips[0].id,'normal',0).project; p = split(p,p.clips[0].id,120);
  assert.deepEqual(p.captions.map(c=>[c.inFrame,c.outFrame]),[[0,120],[120,300]]); assert.equal(p.captions[1].clipId,p.clips[1].id); ProjectSchema.parse(p);
});
test('video trims hide captions without deleting timing; reorder and removal follow clip', () => {
  let p = fixture(); const id=p.clips[0].id; p=addCaption(p,id,'normal',0).project;
  p=trim(p,id,80,200); assert.deepEqual(captionSpans(p).map(s=>[s.start,s.end]),[[0,120]]); assert.equal(p.captions[0].outFrame,300);
  p=trim(p,id,0,300); p=moveClip(p,0,1); assert.equal(captionSpans(p)[0].start,300);
  p=removeClip(p,id); assert.equal(p.captions.length,0);
});
test('multiple titles follow the whole timeline, survive clip edits and cannot split', () => {
  let p=fixture(); const title=addCaption(p,p.clips[0].id,'title',0); p=title.project;
  const second=addCaption(p,p.clips[1].id,'title',200); assert.notEqual(second.id,title.id); p=second.project; assert.equal(p.captions.length,2); assert.equal(splitCaption(p,title.id,100),p);
  p=removeClip(p,p.clips[0].id); assert.equal(captionSpans(p)[0].end,duration(p)); ProjectSchema.parse(p);
});
test('common edits preserve local position and inherit other fields', () => {
  let p=fixture(); p=addCaption(p,p.clips[0].id,'normal',0).project;
  p.captions[0].overrides.position={h:0,v:0,x:null,y:null}; p.captionSettings.normal.size=70;
  assert.equal(effectiveStyle(p,p.captions[0]).size,70); assert.equal(effectiveStyle(p,p.captions[0]).position.h,0);
});
test('nine-way anchors preserve bottom line across wrapping and ratio changes', () => {
  const p=fixture(), s=p.captionSettings.normal, m=p.captionSettings.margins;
  const a=captionRect({width:400,height:100},s,p.settings,m), b=captionRect({width:700,height:200},s,p.settings,m);
  assert.equal(a.top+a.height,b.top+b.height); assert.equal(a.left+a.width/2,540); assert.equal(a.top+a.height,Math.round(1920*.82));
  const wide=captionRect({width:400,height:100},s,{width:1920,height:1080},m); assert.equal(wide.top+wide.height,972);
  assert.equal(captionRect({width:3000,height:100},s,p.settings,m).overflow,true);
});
