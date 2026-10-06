import { DecorationList, DecorationControls } from './components/DecorationControls';
import { DecorationOverlay } from './components/DecorationOverlay';
import { addDecoration, decorationSpans, reorderDecoration, type Decoration } from './shared/decoration';
import { remapTextRuns } from './shared/rich-text';
import { useEffect, useRef, useState } from 'react';
import { NarrationPanel } from './components/NarrationPanel';
import { NarrationPlayback } from './components/NarrationPlayback';
import type { Narration, RecordingClock } from './shared/narration';
import { addMedia, commit, duration, finishPreview, locate, moveClip, newProject, redo, removeClip, split, timecode, trim, undo, type History, type Project } from './shared/project';
import type { OpenResult, TaskProgress } from './shared/api';
import { colorMatrix, NEUTRAL_COLOR, type Color } from './shared/color';
import { Timeline } from './components/Timeline';
import { ColorControls } from './components/ColorControls';
import { TrimControls } from './components/TrimControls';
import type { TrimEdge } from './shared/timeline';
import { CanvasControls, FramingControls } from './components/CanvasControls';
import { PreviewCanvas } from './components/PreviewCanvas';
import { canvasPreset, framingStyle, type CanvasSettings, type Framing } from './shared/canvas';
import { addCaption, captionRange, captionSpans, effectiveStyle, splitCaption, duplicateCaption, reorderCaption, fitNewCaption, type CaptionKind, type CaptionStyle } from './shared/captions';
import { CaptionControls, CaptionList } from './components/CaptionControls';
import { CaptionGroups } from './components/CaptionGroups';
import { CaptionCopyControls } from './components/CaptionCopyControls';
import { useCaptionCopyOptions } from './useCaptionCopyOptions';
import { useCaptionLibrary } from './useCaptionLibrary';
import { applyCaptionGroup, copyCaption, pasteCaption, type CaptionClipboard, type SavedCaptionGroup } from './shared/captions';
import { CaptionOverlay } from './components/CaptionOverlay';
import { PanelDivider, useEditorLayout } from './components/EditorLayout';
import { usePreviewPlayback } from './usePreviewPlayback';
import { QuickTrim } from './components/QuickTrim';
import { TaskProgressDialog } from './components/TaskProgressDialog';
import { version as appVersion } from '../package.json';
import { useViewerSettings } from './useViewerSettings';
import { ViewerControls } from './components/ViewerControls';
import { QuickEditor } from './components/QuickEditor';

export function App() {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: newProject(), future: [] }));
  const project = history.present;
  const [selected, setSelected] = useState<string>();
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(60);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TaskProgress>();
  const [message, setMessage] = useState('영상을 가져와 첫 장면을 놓아 보세요.');
  const [error, setError] = useState('');
  const [saveLabel, setSaveLabel] = useState('저장 전');
  const [recovery, setRecovery] = useState<OpenResult | null>(null);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [scrubbing, setScrubbing] = useState(false);
  const [colorAdjusting, setColorAdjusting] = useState(false);
  const [trimming, setTrimming] = useState<{ clipId: string; edge: TrimEdge } | null>(null);
  const [moving, setMoving] = useState(false);
  const [selectedCaption, setSelectedCaption] = useState<string>();
  const [selectedShape, setSelectedShape] = useState<string>();
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [captionClipboard, setCaptionClipboard] = useState<CaptionClipboard | null>(null);
  const copyOptions = useCaptionCopyOptions();
  const [groupFocusRequest, setGroupFocusRequest] = useState(0);
  const libraryState = useCaptionLibrary(setError);
  const [libraryTab, setLibraryTab] = useState<'media' | 'captions' | 'voice' | 'decorations'>('media');
  useEffect(() => { if (libraryTab !== 'captions') setGroupFocusRequest(0); }, [libraryTab]);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingStopRequest, setRecordingStopRequest] = useState(0);
  const [capture, setCapture] = useState<RecordingClock | null>(null);
  const [captionEditing, setCaptionEditing] = useState(false);
  const [placingCaption, setPlacingCaption] = useState(false);
  const placing = useRef(false);
  const [snap, setSnap] = useState(true);
  const captionGesture = useRef<History | null>(null);
  const layout = useEditorLayout();
  const viewer = useViewerSettings();
  const [textRequest, setTextRequest] = useState(0);
  const [styleRequest, setStyleRequest] = useState(0);
  const [inspectorPage, setInspectorPage] = useState<'selection' | 'canvas'>('selection');
  const openDetails = (text = false) => { setInspectorPage('selection'); layout.openInspector(); if (text) setTextRequest(n => n + 1); };
  const activeShape = project.decorations.find(s => s.id === selectedShape);
  const activeCaption = project.captions.find(c => c.id === selectedCaption);
  const video = useRef<HTMLVideoElement>(null);
  const colorGesture = useRef<Project | null>(null);
  const trimGesture = useRef<{ history: History; playhead: number; selected?: string; selectedCaption?: string; selectedShape?: string; start: number } | null>(null);
  const total = duration(project);
  const currentFrame = Math.max(0, Math.min(playhead, Math.max(0, total - 1)));
  const current = locate(project, currentFrame);
  const activeClip = project.clips.find(c => c.id === selected);
  const activeMedia = project.media.find(m => m.id === activeClip?.mediaId);
  const mediaUrl = current ? `vlog://editor/media/${current.clip.mediaId}` : '';
  const previewColor = current?.clip.color ?? NEUTRAL_COLOR;
  const previewMatrix = colorMatrix(previewColor).join(' ');
  const currentMedia = project.media.find(m => m.id === current?.clip.mediaId);
  const canvasKey = JSON.stringify(project.settings);
  const framingKey = JSON.stringify(current?.clip.framing);
  const previewStyle = current && currentMedia ? framingStyle(currentMedia.displayWidth ?? currentMedia.width, currentMedia.displayHeight ?? currentMedia.height, project.settings, current.clip.framing) : {};

  useEffect(() => {
    let live = true;
    void Promise.all([window.editor.status(), window.editor.recovery()]).then(([status, recovered]) => {
      if (!live) return;
      if (!status.ffmpeg) setError('처리 도구가 없습니다. 터미널에서 npm run setup:ffmpeg를 실행해 주세요.');
      setRecovery(recovered); setReady(!recovered);
    }).catch(e => { if (live) { setError(String(e)); setReady(true); } });
    const unsubscribe = window.editor.onProgress(setProgress);
    return () => { live = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!ready || colorAdjusting || trimming) return;
    setSaveLabel('자동 저장 중…');
    let live = true;
    void window.editor.autosave(project).then(() => { if (live) setSaveLabel('자동 저장됨'); }).catch(e => { if (live) setError(`자동 저장 실패: ${String(e)}`); });
    return () => { live = false; };
  }, [project, ready, colorAdjusting, trimming]);
  useEffect(() => { setPlaying(false); setStill(''); setPlayhead(p => Math.min(p, Math.max(0, duration(project) - 1))); }, [project]);
  useEffect(() => {
    if (playing || scrubbing || colorAdjusting || !current) { setStill(''); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.editor.frame(current.clip.mediaId, current.sourceFrame, current.clip.color, project.settings, current.clip.framing).then(src => { if (!cancelled) setStill(src); }).catch(() => { if (!cancelled) setStill(''); });
    }, 110);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [playing, scrubbing, colorAdjusting, current?.clip.mediaId, current?.sourceFrame, current?.start, previewMatrix, canvasKey, framingKey]);
  const previewRunning = usePreviewPlayback({ video, current, mediaUrl, playing, total, capture, onFrame: setPlayhead, onStop: () => setPlaying(false), onError: previewFailed });

  function edit(fn: (p: Project) => Project) {
    try { setHistory(h => commit(h, fn(h.present))); setMessage('편집을 반영했습니다. Ctrl+Z로 되돌릴 수 있습니다.'); }
    catch (e) { setError(String(e)); }
  }
  async function task<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setPlaying(false); setError(''); setProgress(undefined);
    try { return await fn(); } catch (e) { setError(String(e)); return undefined; }
    finally { setBusy(false); setProgress(undefined); }
  }
  async function importMedia(files?: File[]) {
    const result = await task(() => files ? window.editor.importDropped(files) : window.editor.importMedia());
    if (!result) return;
    if (result.media.length) { edit(p => addMedia(p, result.media)); setMessage(`${result.media.length}개 영상을 가져왔습니다. 원본은 그대로 보존됩니다.`); }
    if (result.errors.length) setError(result.errors.join('\n\n'));
  }
  function loaded(result: OpenResult) {
    setSelectedCaption(undefined); setSelectedShape(undefined); setGroupSelection([]); setLibraryTab('media');
    setHistory({ past: [], present: result.project, future: [] }); setSelected(undefined); setPlayhead(0); setMissing(result.missing);
    setRecovery(null); setReady(true); setMessage(result.path ? `프로젝트 열기 완료 · ${result.path}` : '자동 저장한 작업을 복구했습니다.');
    if (result.missing.length) setError(`원본을 확인하지 못한 항목:\n${result.missing.join('\n')}\n원래 위치로 파일을 돌려놓은 뒤 프로젝트를 다시 열어 주세요. 재연결 화면은 다음 단계에서 제공합니다.`);
  }
  async function save() { try { const path = await window.editor.saveProject(project); if (path) { setSaveLabel('프로젝트 저장됨'); setMessage(`저장 완료 · ${path}`); } } catch (e) { setError(String(e)); } }
  function splitSelected() {
    if (activeShape) return;
    if (activeCaption) {
      const span = captionSpans(project).find(s => s.caption.id === activeCaption.id);
      if (span && current && activeCaption.clipId === current.clip.id) edit(p => splitCaption(p, activeCaption.id, current.sourceFrame));
    } else if (selected) edit(p => split(p, selected, currentFrame));
  }
  function deleteSelected() {
    if (activeShape) { edit(p => ({ ...p, decorations: p.decorations.filter(s => s.id !== activeShape.id) })); setSelectedShape(undefined); }
    else if (activeCaption) { edit(p => ({ ...p, captions: p.captions.filter(c => c.id !== activeCaption.id) })); setSelectedCaption(undefined); }
    else if (selected) { edit(p => removeClip(p, selected)); setSelected(undefined); }
  }
  function selectCaption(id: string) {
    const span = captionSpans(project).find(s => s.caption.id === id); if (!span) return;
    setSelectedShape(undefined); setSelectedCaption(id); setLibraryTab('captions'); setPlaying(false);
    if (span.caption.clipId) setSelected(span.caption.clipId);
    if (currentFrame < span.start || currentFrame >= span.end) seek(span.start);
  }
  function captionText(id: string, text: string) {
    changeCaptions(p => ({ ...p, captions: p.captions.map(c => c.id === id ? { ...c, text, runs: remapTextRuns(c.text, text, c.runs) } : c) }));
  }
  function selectShape(id: string) {
    const span = decorationSpans(project).find(s => s.shape.id === id); if (!span) return;
    setSelectedCaption(undefined); setSelectedShape(id); setLibraryTab('decorations'); setPlaying(false);
    if (span.shape.clipId) setSelected(span.shape.clipId);
    if (currentFrame < span.start || currentFrame >= span.end) seek(span.start);
  }
  function createShape(kind: Decoration['kind']) {
    const clip = activeClip ?? current?.clip; if (!clip || project.decorations.length >= 500) return;
    const result = addDecoration(project, clip.id, kind, current?.clip.id === clip.id ? current.sourceFrame : clip.inFrame);
    edit(() => result.project); setSelectedShape(result.id); setSelectedCaption(undefined); setLibraryTab('decorations');
  }
  function changeShape(id: string, patch: Partial<Decoration>) {
    changeCaptions(p => ({ ...p, decorations: p.decorations.map(s => s.id === id ? { ...s, ...patch } : s) }));
    if (patch.inFrame !== undefined || patch.outFrame !== undefined) {
      const next = { ...project, decorations: project.decorations.map(s => s.id === id ? { ...s, ...patch } : s) };
      const span = decorationSpans(next).find(s => s.shape.id === id);
      if (span) setPlayhead(f => Math.max(span.start, Math.min(span.end - 1, f)));
    }
  }
  function duplicateShape() {
    if (!activeShape || project.decorations.length >= 500) return;
    const shape = { ...structuredClone(activeShape), id: crypto.randomUUID(), name: (activeShape.name + ' 복사본').slice(0, 80), x: Math.min(1, activeShape.x + .03), y: Math.min(1, activeShape.y + .03), zOrder: Math.min(1000000, Math.max(0, ...project.decorations.map(s => s.zOrder)) + 1) };
    edit(p => ({ ...p, decorations: [...p.decorations, shape] })); setSelectedShape(shape.id);
  }
  function createCaption(kind: CaptionKind) {
    const clip = activeClip ?? current?.clip; if (!clip || project.captions.length >= 2000) return;
    if (kind === 'normal') {
      if (!libraryState.loaded || libraryState.saving) return;
      const group = libraryState.library.groups.find(g => g.id === libraryState.library.defaultGroupId);
      if (group) { insertGroup(group, true); return; }
    }
    const result = addCaption(project, clip.id, kind, current?.clip.id === clip.id ? current.sourceFrame : clip.inFrame);
    void insertCaption(result);
  }
  function copySelectedCaption() {
    if (!activeCaption || activeShape) return;
    try { setCaptionClipboard(copyCaption(project, activeCaption.id)); setMessage('자막을 복사했습니다. Ctrl+V로 문구와 서식을 함께 붙여넣습니다.'); }
    catch (error) { setError(String(error)); }
  }
  function pasteCopiedCaption() {
    if (!captionClipboard) { setMessage('먼저 자막을 선택하고 Ctrl+C로 복사하세요.'); return; }
    try {
      const clip = activeClip ?? current?.clip;
      const result = pasteCaption(project, captionClipboard, { autoAfter: copyOptions.autoAfter, clipId: clip?.id, sourceFrame: current?.clip.id === clip?.id ? current?.sourceFrame : clip?.inFrame });
      void insertCaption(result).then(inserted => { if (inserted) setMessage(result.movedAfter ? '자막을 뒤쪽 빈 시간에 붙여넣었습니다.' : '자막을 붙여넣었습니다. Ctrl+Z로 되돌릴 수 있습니다.'); });
    } catch (error) { setError(String(error)); }
  }
  function duplicateSelectedCaption() {
    if (!activeCaption) return;
    try {
      const result = duplicateCaption(project, activeCaption.id, copyOptions.autoAfter);
      void insertCaption(result).then(inserted => { if (inserted) setMessage(result.movedAfter ? '자막을 뒤쪽 빈 시간에 복제했습니다.' : '자막을 기존 시간에 복제했습니다.'); });
    } catch (error) { setError(String(error)); }
  }
  function prepareGroup() {
    setPlaying(false); setLibraryTab('captions'); layout.openLibrary();
    setGroupFocusRequest(n => n + 1);
    setGroupSelection([...captionSpans(project).filter(s => s.start <= currentFrame && currentFrame < s.end).map(s => s.caption.id), ...decorationSpans(project).filter(s => s.start <= currentFrame && currentFrame < s.end).map(s => s.shape.id)]);
    setMessage('제목·꾸미기 묶음에서 이름을 입력하고 기본 자막 스타일로 저장하세요.');
  }
  function insertGroup(group: SavedCaptionGroup, asSubtitle = false) {
    try {
      const clip = activeClip ?? current?.clip;
      const result = applyCaptionGroup(project, group, clip?.id, asSubtitle && clip ? current?.clip.id === clip.id ? current.sourceFrame : clip.inFrame : undefined);
      edit(() => result.project); setSelectedShape(undefined); setGroupSelection([...result.ids, ...result.shapeIds]); setSelectedCaption(result.ids[0]); setPlaying(false); setLibraryTab('captions');
      const span = captionSpans(result.project).find(s => s.caption.id === result.ids[0]);
      if (span && (currentFrame < span.start || currentFrame >= span.end)) seek(span.start);
      setMessage(group.name + (asSubtitle ? ' 기본 자막을 추가했습니다.' : ' 묶음을 추가했습니다.') + ' 글과 꾸미기를 각각 편집할 수 있습니다.');
      return true;
    } catch (error) { setError(String(error)); return false; }
  }
  async function prepareNarration() {
    setPlaying(false); setStill('');
    const el = video.current; if (!el || !current || missing.length) throw new Error('재생할 영상을 먼저 준비해 주세요.');
    el.pause(); el.currentTime = current.sourceFrame / 30;
    const started = performance.now();
    while (el.readyState < 2 || el.seeking) {
      if (el.error || performance.now() - started > 10000) throw new Error('영상 준비가 지연되고 있습니다. 영상을 다시 열어 주세요.');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  function previewFailed(message: string) {
    setPlaying(false); setError(message);
    if (recordingBusy) setRecordingStopRequest(n => n + 1);
  }
  function captureNarration(clock: RecordingClock | null) {
    setCapture(clock); setPlaying(!!clock); setStill('');
  }
  async function savedNarration(take: Narration) {
    const next = { ...project, narrations: [...project.narrations, take] };
    await window.editor.autosave(next);
    edit(() => next); setPlayhead(take.startFrame); setMessage('음성을 녹음했습니다. 재생해서 확인하세요. Ctrl+Z로 되돌릴 수 있습니다.');
  }
  async function insertCaption(result: ReturnType<typeof addCaption>) {
    if (placing.current) return false;
    if (result.project === project) { selectCaption(result.id); return true; }
    placing.current = true; setPlacingCaption(true); setPlaying(false);
    try {
      const caption = result.project.captions.find(c => c.id === result.id)!;
      const bitmap = await window.editor.captionBitmap({ text: caption.text, runs: caption.runs, style: effectiveStyle(result.project, caption), width: project.settings.width, height: project.settings.height });
      const next = fitNewCaption(result.project, result.id, bitmap);
      edit(() => next); setSelectedShape(undefined); setSelectedCaption(result.id); setLibraryTab('captions'); if (caption.clipId) setSelected(caption.clipId);
      const span = captionSpans(next).find(s => s.caption.id === result.id)!;
      if (currentFrame < span.start || currentFrame >= span.end) seek(span.start);
      return true;
    } catch (e) { setError(`자막 추가 실패: ${String(e)}`); return false; }
    finally { placing.current = false; setPlacingCaption(false); }
  }
  function beginCaption() { if (!captionGesture.current) { captionGesture.current = history; setCaptionEditing(true); setPlaying(false); } }
  function endCaption(cancelled = false) { const before = captionGesture.current; captionGesture.current = null; setCaptionEditing(false); if (before) setHistory(h => finishPreview(before, h.present, cancelled)); }
  function changeCaptions(fn: (p: Project) => Project) { if (captionGesture.current) setHistory(h => ({ ...h, present: fn(h.present) })); else edit(fn); }
  function captionStyle(id: string, patch: Partial<CaptionStyle>, common = false) {
    changeCaptions(p => { const caption = p.captions.find(c => c.id === id); if (!caption) return p;
      return common ? { ...p, captionSettings: { ...p.captionSettings, [caption.kind]: { ...p.captionSettings[caption.kind], ...patch } } }
        : { ...p, captions: p.captions.map(c => c.id === id ? { ...c, overrides: { ...c.overrides, ...patch } } : c) };
    });
  }
  function alignCaptions() {
    if (!activeCaption) return;
    const { size, position } = effectiveStyle(project, activeCaption);
    edit(p => ({ ...p, captionSettings: { ...p.captionSettings, [activeCaption.kind]: { ...p.captionSettings[activeCaption.kind], size, position } }, captions: p.captions.map(c => { if (c.kind !== activeCaption.kind) return c; const { size: _, position: __, ...overrides } = c.overrides; return { ...c, overrides }; }) }));
  }
  function setCaptionRange(id: string, a: number, b: number) {
    const next = captionRange(project, id, a, b); changeCaptions(p => captionRange(p, id, a, b));
    const span = captionSpans(next).find(s => s.caption.id === id);
    if (span) setPlayhead(f => Math.max(span.start, Math.min(span.end - 1, f)));
  }
  function seek(frame: number) { const next = Math.max(0, Math.min(frame, Math.max(0, total - 1))); setPlaying(false); setStill(''); setPlayhead(next); }
  function seekTimeline(frame: number) {
    seek(frame); const at = locate(project, frame); if (at) setSelected(at.clip.id);
  }
  function clipStart(p: Project, id: string) {
    let start = 0; for (const clip of p.clips) { if (clip.id === id) break; start += clip.outFrame - clip.inFrame; } return start;
  }
  function reorderClips(from: number, to: number) {
    const next = moveClip(project, from, to); if (next === project) return;
    edit(() => next); setPlaying(false);
    if (current) setPlayhead(clipStart(next, current.clip.id) + current.sourceFrame - current.clip.inFrame);
    setMessage('영상 위치를 옮겼습니다. Ctrl+Z로 되돌릴 수 있습니다.');
  }
  function beginTrim(clipId: string, edge: TrimEdge) {
    const clip = project.clips.find(c => c.id === clipId); if (!clip) return;
    const start = clipStart(project, clipId);
    trimGesture.current = { history, playhead: currentFrame, selected, selectedCaption, selectedShape, start };
    setTrimming({ clipId, edge }); setSelected(clipId); setSelectedCaption(undefined); setSelectedShape(undefined); setPlaying(false); setStill('');
    setPlayhead(edge === 'start' ? start : start + clip.outFrame - clip.inFrame - 1);
  }
  function previewTrim(clipId: string, inFrame: number, outFrame: number, edge: TrimEdge) {
    const before = trimGesture.current; if (!before) return;
    setHistory(h => { const present = trim(h.present, clipId, inFrame, outFrame); return present === h.present ? h : { ...h, present }; });
    setPlayhead(edge === 'start' ? before.start : before.start + outFrame - inFrame - 1);
  }
  function endTrim(cancelled: boolean) {
    const before = trimGesture.current; trimGesture.current = null; setTrimming(null);
    if (!before) return;
    setHistory(h => finishPreview(before.history, h.present, cancelled));
    if (cancelled) { setPlayhead(before.playhead); setSelected(before.selected); setSelectedCaption(before.selectedCaption); setSelectedShape(before.selectedShape); }
    setMessage(cancelled ? '길이 조절을 취소했습니다.' : '길이를 조절했습니다. Ctrl+Z로 한 번에 되돌릴 수 있습니다.');
  }
  function setClipRange(inFrame: number, outFrame: number, edge: TrimEdge) {
    if (!activeClip) return;
    const next = trim(project, activeClip.id, inFrame, outFrame); edit(() => next);
    setPlaying(false); setStill('');
    setPlayhead(clipStart(next, activeClip.id) + (edge === 'end' ? outFrame - inFrame - 1 : 0));
  }
  function trimAtPlayhead(edge: TrimEdge) {
    if (!current) return;
    const { clip, sourceFrame } = current;
    const next = trim(project, clip.id, edge === 'start' ? sourceFrame : clip.inFrame, edge === 'end' ? sourceFrame + 1 : clip.outFrame);
    if (next === project) return;
    edit(() => next); setSelected(clip.id); setSelectedCaption(undefined); setSelectedShape(undefined); setPlaying(false); setStill('');
    setPlayhead(clipStart(next, clip.id) + (edge === 'end' ? sourceFrame - clip.inFrame : 0));
  }
  function beginColor() { colorGesture.current ??= project; setColorAdjusting(true); }
  function changeCanvas(settings: CanvasSettings) {
    if (JSON.stringify(settings) === canvasKey) return;
    edit(p => ({ ...p, settings }));
  }
  function changeFraming(framing: Framing) {
    if (!activeClip || JSON.stringify(activeClip.framing) === JSON.stringify(framing)) return;
    if (current?.clip.id !== activeClip.id) seek(clipStart(project, activeClip.id));
    const change = (p: Project): Project => ({ ...p, clips: p.clips.map(c => c.id === activeClip.id ? { ...c, framing } : c) });
    if (colorGesture.current) setHistory(h => ({ ...h, present: change(h.present) })); else edit(change);
  }
  function endColor() {
    const before = colorGesture.current; colorGesture.current = null; setColorAdjusting(false);
    if (before) setHistory(h => JSON.stringify(h.present) === JSON.stringify(before) ? h : { past: [...h.past.slice(-99), before], present: h.present, future: [] });
  }
  function changeColor(color: Color) {
    if (!activeClip || JSON.stringify(activeClip.color) === JSON.stringify(color)) return;
    if (current?.clip.id !== activeClip.id) {
      const index = project.clips.findIndex(c => c.id === activeClip.id);
      seek(project.clips.slice(0, index).reduce((sum, c) => sum + c.outFrame - c.inFrame, 0));
    }
    const change = (p: Project): Project => ({ ...p, clips: p.clips.map(c => c.id === activeClip.id ? { ...c, color } : c) });
    if (colorGesture.current) setHistory(h => ({ ...h, present: change(h.present), future: [] })); else edit(change);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const clipboardKey = e.ctrlKey && !e.altKey && !e.shiftKey && (e.code === 'KeyC' || e.code === 'KeyV');
      const field = el.closest('input, textarea, select');
      const checkboxShortcut = clipboardKey && field instanceof HTMLInputElement && ['checkbox', 'radio'].includes(field.type);
      if (e.defaultPrevented || (field && !checkboxShortcut) || el.isContentEditable || e.isComposing || busy || recordingBusy || !ready || trimming || moving || captionEditing || placing.current) return;
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyC' && activeCaption && !activeShape) { e.preventDefault(); if (!e.repeat) copySelectedCaption(); }
      else if (e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyV') { e.preventDefault(); if (!e.repeat) pasteCopiedCaption(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); setHistory(undo); }
      else if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); setHistory(redo); }
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.code === 'KeyQ' || e.code === 'KeyW')) { e.preventDefault(); if (!e.repeat) trimAtPlayhead(e.code === 'KeyQ' ? 'start' : 'end'); }
      else if (e.code === 'Space') { e.preventDefault(); if (total) setPlaying(p => !p); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); splitSelected(); }
      else if (e.key === 'Delete') { e.preventDefault(); deleteSelected(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seek(currentFrame + (e.key === 'ArrowRight' ? 1 : -1)); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  const disabled = busy || recordingBusy || !ready || !!trimming || moving || placingCaption;

  return <div className={`app focus-editor layout-${layout.mode} preview-${layout.previewSide} ${layout.large ? 'large-preview' : ''} ${layout.libraryOpen ? 'library-open' : ''} ${layout.inspectorOpen ? 'inspector-open' : ''}`} style={layout.style} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!disabled && e.dataTransfer.files.length) void importMedia(Array.from(e.dataTransfer.files)); }}>
    <svg width="0" height="0" className="color-filter-defs" aria-hidden="true"><defs><filter id="clip-color" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={previewMatrix} /></filter></defs></svg>
    <header className="topbar">
      <div className="brand"><span className="brand-icon">▰</span><strong>장면</strong><span>VLOGTOOL</span></div>
      <div className="project-heading"><input aria-label="프로젝트 이름" value={project.name} disabled={disabled} onChange={e => { const name = e.target.value; if (name.length && name.length <= 200) edit(p => ({ ...p, name })); }} /><small>{project.settings.width} × {project.settings.height} <b>·</b> 30 fps <b>·</b> SDR</small></div>
      <label className="workspace-picker">레이아웃<select aria-label="편집 레이아웃" value={layout.mode} disabled={busy || recordingBusy || !!trimming || moving || captionEditing} onChange={e => layout.setMode(e.target.value as 'current' | 'split')}><option value="current">상하분할형</option><option value="split">좌우 분할형</option></select></label>
      <div className="header-actions"><span className="save-state">● {saveLabel}</span><button disabled={disabled} onClick={() => void task(() => window.editor.openProject()).then(r => r && loaded(r))}>열기</button><button disabled={disabled} onClick={() => void save()}>저장 <kbd>Ctrl S</kbd></button><button className="primary" disabled={disabled || !total || missing.length > 0} onClick={() => void task(() => window.editor.exportProject(project)).then(path => { if (path) setMessage(`MP4 내보내기 완료 · ${path}`); })}>내보내기 ↗</button></div>
    </header>
    <nav className="creation-bar" aria-label="편집 도구">
      <button disabled={disabled} onClick={() => void importMedia()}>＋ 영상</button>
      <button disabled={disabled || !total || !libraryState.loaded || libraryState.saving || project.captions.length >= 2000} onClick={() => createCaption('normal')}>＋ 자막</button>
      <button disabled={disabled || !total || project.captions.length >= 2000} onClick={() => createCaption('title')}>＋ 제목</button>
      <button disabled={disabled || !total || project.captions.length >= 2000} onClick={() => createCaption('emphasis')}>＋ 강조</button>
      <button disabled={disabled} onClick={() => { setLibraryTab('decorations'); layout.openLibrary(); }}>꾸미기</button>
      <button disabled={disabled} onClick={() => { setLibraryTab('voice'); setPlaying(false); layout.openLibrary(); }}>음성 녹음</button>
      <span className="creation-divider" />
      <button disabled={recordingBusy} onClick={() => { setLibraryTab('media'); layout.openLibrary(); }}>미디어</button>
      <button disabled={recordingBusy} onClick={() => { setLibraryTab('captions'); layout.openLibrary(); }}>자막 목록</button>
      <button disabled={disabled} onClick={() => { setLibraryTab('captions'); layout.openLibrary(); if (activeCaption) { openDetails(); setStyleRequest(n => n + 1); } }}>내 스타일</button>
      <button className="output-settings-button" disabled={disabled} onClick={() => { setInspectorPage('canvas'); layout.openInspector(); }}>출력 설정 · {canvasPreset(project.settings).id}</button>
    </nav>
    {recovery && <div className="recovery"><span>이전 자동 저장 작업이 있습니다. <strong>{recovery.project.name}</strong></span><button onClick={() => void task(() => window.editor.restoreRecovery()).then(r => r && loaded(r))}>작업 복구</button><button onClick={() => { setRecovery(null); setReady(true); }}>새 작업 시작</button></div>}
    <div className="editor-content">
    <main className="workspace">
      <aside className="library panel" aria-label="작업 보관함" aria-hidden={!layout.libraryOpen} inert={!layout.libraryOpen}><div className="drawer-heading"><h2>{libraryTab === 'voice' ? '음성 녹음' : libraryTab === 'decorations' ? '꾸미기' : libraryTab === 'captions' ? '글 목록 · 내 스타일' : '미디어'}</h2><button disabled={recordingBusy} aria-label="보관함 닫기" onClick={layout.closeLibrary}>닫기</button></div><div className="library-tabs"><button disabled={recordingBusy} aria-pressed={libraryTab === 'media'} onClick={() => setLibraryTab('media')}>영상</button><button disabled={recordingBusy} aria-pressed={libraryTab === 'captions'} onClick={() => setLibraryTab('captions')}>글 · {project.captions.length}</button><button disabled={recordingBusy} aria-pressed={libraryTab === 'decorations'} onClick={() => setLibraryTab('decorations')}>도형</button><button disabled={recordingBusy} aria-pressed={libraryTab === 'voice'} onClick={() => { setPlaying(false); setLibraryTab('voice'); }}>녹음</button></div>

        {libraryTab === 'decorations' ? <DecorationList project={project} selected={selectedShape} disabled={disabled} onAdd={createShape} onSelect={selectShape} /> : libraryTab === 'voice' ? <NarrationPanel stopRequest={recordingStopRequest} takes={project.narrations} frame={currentFrame} total={total} disabled={busy || !ready || !!trimming || moving || placingCaption || missing.length > 0} onPrepare={prepareNarration} onCapture={captureNarration} onBusy={value => { setRecordingBusy(value); if (value) setPlaying(false); }} onSaved={savedNarration} onChange={take => edit(p => ({ ...p, narrations: p.narrations.map(n => n.id === take.id ? take : n) }))} onDelete={id => edit(p => ({ ...p, narrations: p.narrations.filter(n => n.id !== id) }))} onSeek={seek} /> : libraryTab === 'captions' ? <div className="caption-workspace"><CaptionCopyControls disabled={disabled} canCopy={!!activeCaption && !activeShape} canPaste={!!captionClipboard && !!total} autoAfter={copyOptions.autoAfter} onAutoAfter={copyOptions.setAutoAfter} onCopy={copySelectedCaption} onPaste={pasteCopiedCaption} /><CaptionGroups project={project} frame={currentFrame} focusRequest={groupFocusRequest} checked={groupSelection} onChecked={setGroupSelection} disabled={disabled} libraryState={libraryState} onApply={insertGroup} onError={setError} /><CaptionList checked={groupSelection} onCheck={id => setGroupSelection(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id])} project={project} selected={selectedCaption} disabled={disabled} onSelect={selectCaption} onText={captionText} onBegin={beginCaption} onEnd={() => endCaption()} /></div> : <><button className="import-button" disabled={disabled} onClick={() => void importMedia()}>＋ 영상 가져오기</button>
        <p className="hint">MP4 · MOV 파일을 이곳에 놓으세요</p>
        <div className="asset-list">{project.media.length ? project.media.map((m, i) => <button className={`asset ${activeMedia?.id === m.id ? 'active' : ''}`} key={m.id} disabled={disabled} onClick={() => { const c = project.clips.find(c => c.mediaId === m.id); if (c) setSelected(c.id); }} onDoubleClick={() => edit(p => addMedia(p, [m]))}>
          <div className={`asset-cover cover-${i % 3}`}><span>▶</span><small>{timecode(m.durationFrames)}</small></div><strong title={m.path}>{m.name}</strong><span>{m.width} × {m.height} · {m.codec.toUpperCase()}</span><small>두 번 클릭해 타임라인에 추가</small></button>) : <div className="library-empty"><span>▱</span><p>오늘의 장면을<br />모아 보세요.</p></div>}</div>
        <div className="library-foot">원본 보존 <span>편집용 사본을 따로 만듭니다</span></div></>}
      </aside><PanelDivider axis="x" label="미디어 패널 크기" disabled={disabled} onDelta={n => layout.resize('left', n)} />
      <section className="preview-panel"><div className="preview-surface"><div className="preview-heading"><h2>미리보기</h2>{layout.mode === 'split' ? <button className="preview-side-toggle" disabled={recordingBusy || !!trimming || moving || captionEditing} onClick={layout.swapPreview}>좌우 바꾸기 ⇄</button> : <button disabled={recordingBusy} className="preview-size-toggle" aria-pressed={layout.large} onClick={layout.toggle}>{layout.large ? '편집 화면으로' : '크게 보기'}</button>}<button disabled={recordingBusy} className="layout-reset" aria-label="화면 배치 초기화" onClick={layout.reset}>↺</button><button className="snap-toggle" aria-pressed={snap} onClick={() => setSnap(v => !v)}>자석 {snap ? '켜짐' : '꺼짐'}</button><span>{playing ? '재생 중' : '화면에서 글·도형을 직접 편집하세요'}</span><span className="pill">{canvasPreset(project.settings).id}</span></div><ViewerControls view={viewer.view} onChange={viewer.update} disabled={recordingBusy || !!trimming || moving || captionEditing} />
        <PreviewCanvas settings={project.settings} disabled={disabled} view={viewer.view} onSelect={selectCaption}>{current ? <><video ref={video} src={mediaUrl} style={{ ...previewStyle, filter: 'url(#clip-color)' }} playsInline preload="auto" onError={() => previewFailed('미디어를 재생할 수 없습니다. 원본 경로를 확인하고 프로젝트를 다시 열어 주세요.')} />{!playing && still && <img className="exact-frame" src={still} alt="현재 타임라인의 정지 프레임" />}</> : <div className="preview-empty"><div className="frame-mark">▰</div><h1>평범한 하루, 하나의 이야기.</h1><p>영상 두 개를 가져와 필요한 구간을 연결해 보세요.</p><button disabled={disabled} onClick={() => void importMedia()}>첫 영상 가져오기</button></div>}{current && <DecorationOverlay project={project} frame={currentFrame} selected={selectedShape} disabled={disabled} onSelect={selectShape} onChange={changeShape} onBegin={beginCaption} onEnd={endCaption} />}{current && <CaptionOverlay project={project} frame={currentFrame} selected={selectedCaption} disabled={disabled} snap={snap} onSelect={selectCaption} onStyle={captionStyle} onResize={(id, size, runs) => changeCaptions(p => ({ ...p, captions: p.captions.map(c => c.id === id ? { ...c, runs, overrides: { ...c.overrides, size } } : c) }))} onBegin={beginCaption} onEnd={endCaption} onError={setError} />}</PreviewCanvas>
        <NarrationPlayback takes={project.narrations} frame={currentFrame} total={total} playing={previewRunning} muted={!!capture} onError={setError} />
        <div className="transport"><span className="timecode">{timecode(currentFrame)} <em>/ {timecode(total)}</em></span><div><button aria-label="이전 프레임" disabled={!total || disabled} onClick={() => seek(currentFrame - 1)}>│◀</button><button className="play" aria-label={playing ? '일시 정지' : '재생'} disabled={!total || disabled} onClick={() => setPlaying(p => !p)}>{playing ? 'Ⅱ' : '▶'}</button><button aria-label="다음 프레임" disabled={!total || disabled} onClick={() => seek(currentFrame + 1)}>▶│</button></div><span className="transport-hint">Space 재생 · ← → 한 프레임</span></div>
        </div>
        <QuickEditor key={activeCaption?.id ?? activeShape?.id ?? 'empty'} project={project} caption={activeCaption} shape={activeShape} disabled={disabled} onText={text => activeCaption && captionText(activeCaption.id, text)} onStyle={patch => activeCaption && captionStyle(activeCaption.id, patch)} onShape={patch => activeShape && changeShape(activeShape.id, patch)} onBegin={beginCaption} onEnd={endCaption} onDetails={openDetails} onGroup={prepareGroup} onDuplicate={duplicateSelectedCaption} />
      </section>
      <PanelDivider axis="x" label="속성 패널 크기" disabled={disabled} onDelta={n => layout.resize('right', -n)} /><aside className="inspector panel" aria-label="상세 편집 패널" aria-hidden={!layout.inspectorOpen} inert={!layout.inspectorOpen}><div className="panel-heading"><h2>{inspectorPage === 'canvas' ? '출력 설정' : activeShape ? '도형 속성' : activeCaption ? '자막 속성' : '클립 속성'}</h2><button aria-label="상세 편집 닫기" onClick={layout.closeInspector}>닫기</button></div>{inspectorPage === 'canvas' ? <CanvasControls settings={project.settings} disabled={disabled} onChange={changeCanvas} /> : activeShape ? <DecorationControls key={activeShape.id} project={project} shape={activeShape} disabled={disabled} onChange={patch => changeShape(activeShape.id, patch)} onDelete={deleteSelected} onDuplicate={duplicateShape} onOrder={direction => edit(p => reorderDecoration(p, activeShape.id, direction))} /> : activeCaption ? <CaptionControls textRequest={textRequest} styleRequest={styleRequest} onPrepareGroup={prepareGroup} onText={text => captionText(activeCaption.id, text)} onRuns={runs => changeCaptions(p => ({ ...p, captions: p.captions.map(c => c.id === activeCaption.id ? { ...c, runs } : c) }))} libraryState={libraryState} project={project} caption={activeCaption} frame={currentFrame} disabled={disabled} onDuplicate={duplicateSelectedCaption} onDelete={deleteSelected} onOrder={direction => edit(p => reorderCaption(p, activeCaption.id, direction, currentFrame))} onPreview={() => { const span = captionSpans(project).find(s => s.caption.id === activeCaption.id); if (span) { seek(span.start); setPlaying(true); } }} onStyle={(patch, common) => captionStyle(activeCaption.id, patch, common)} onRange={(a, b) => setCaptionRange(activeCaption.id, a, b)} onReset={() => edit(p => ({ ...p, captions: p.captions.map(c => c.id === activeCaption.id ? { ...c, overrides: {} } : c) }))} onAlignAll={alignCaptions} onBegin={beginCaption} onEnd={endCaption} onMargins={margins => changeCaptions(p => ({ ...p, captionSettings: { ...p.captionSettings, margins } }))} onError={setError} /> : activeClip && activeMedia ? <><div className="selection-title"><span>선택한 영상</span><h3>{activeMedia.name}</h3></div>
        <TrimControls clip={activeClip} media={activeMedia} sourceFrame={current?.clip.id === activeClip.id ? current.sourceFrame : undefined} disabled={disabled} onChange={setClipRange} />
        <FramingControls framing={activeClip.framing} settings={project.settings} disabled={disabled} onChange={changeFraming} onBegin={beginColor} onEnd={endColor} /><ColorControls value={activeClip.color} disabled={disabled} onChange={changeColor} onBegin={beginColor} onEnd={endColor} />
        <div className="property-group"><h3>원본 소리 <small>{Math.round(activeClip.volume * 100)}%</small></h3><input aria-label="원본 소리 볼륨" type="range" min="0" max="1" step="0.05" value={activeClip.volume} disabled={disabled} onChange={e => { const volume = Number(e.target.value); edit(p => ({ ...p, clips: p.clips.map(c => c.id === activeClip.id ? { ...c, volume } : c) })); }} /></div><div className="property-group"><h3>장면 순서</h3><div className="two-buttons"><button disabled={disabled || project.clips[0].id === selected} onClick={() => edit(p => { const i = p.clips.findIndex(c => c.id === selected); return moveClip(p, i, i - 1); })}>← 앞으로</button><button disabled={disabled || project.clips.at(-1)?.id === selected} onClick={() => edit(p => { const i = p.clips.findIndex(c => c.id === selected); return moveClip(p, i, i + 1); })}>뒤로 →</button></div></div><div className="source-info"><strong>원본 정보</strong><p>{activeMedia.sourceFps.toFixed(3)} fps · 회전 {activeMedia.rotation}°</p><p>원본 {activeMedia.hasAudio ? '오디오 포함' : '무음 영상'}</p>{activeMedia.warnings.map(w => <p key={w}>{w}</p>)}</div></> : <div className="inspector-empty"><span>↙</span><p>타임라인에서 장면을 선택하면<br />구간과 소리를 조절할 수 있습니다.</p></div>}</aside>
    </main>
    <PanelDivider className="split-divider" axis="x" label="미리보기와 편집 도구 너비" disabled={disabled || captionEditing} onDelta={layout.resizePreview} />
    <PanelDivider axis="y" label="타임라인 높이" disabled={disabled} onDelta={n => layout.resize('timeline', -n)} /><section className="timeline"><div className="timeline-toolbar"><h2>타임라인</h2><button disabled={disabled || !history.past.length} aria-label="실행 취소" onClick={() => setHistory(undo)}>↶</button><button disabled={disabled || !history.future.length} aria-label="다시 실행" onClick={() => setHistory(redo)}>↷</button><span className="divider" /><button disabled={disabled || (!selected && !activeCaption) || activeCaption?.kind === 'title' || !!activeShape} onClick={splitSelected}>분할 <kbd>S</kbd></button><button disabled={disabled || (!selected && !activeCaption)} onClick={deleteSelected}>{activeShape ? '도형 삭제' : activeCaption ? '자막 삭제' : '리플 삭제'} <kbd>Del</kbd></button><QuickTrim disabled={disabled} canStart={!!current && current.sourceFrame > current.clip.inFrame} canEnd={!!current && current.sourceFrame < current.clip.outFrame - 1} onTrim={trimAtPlayhead} /><div className="zoom"><span>−</span><input aria-label="타임라인 확대" disabled={disabled} type="range" min="20" max="160" value={zoom} onChange={e => setZoom(Number(e.target.value))} /><span>＋</span></div></div>
      <div className={`timeline-help ${trimming ? 'trim-readout' : ''}`} role="status">{trimming && activeClip ? `${trimming.edge === 'start' ? '시작' : '끝'} 조절 · ${timecode(activeClip.inFrame)} → ${timecode(activeClip.outFrame)} · 길이 ${((activeClip.outFrame - activeClip.inFrame) / 30).toFixed(2)}초 · Esc 취소` : moving ? '원하는 위치의 표시선에 놓으세요 · 뒤 영상은 빈틈없이 이어집니다 · Esc 취소' : '영상 클립을 끌어서 위치 이동 · 양끝 │ 길이 조절 · 위쪽 눈금 / 재생선으로 탐색 · 휠 좌우 이동 · Shift+휠 자막 줄 이동'}</div>
      <Timeline selectedShape={selectedShape} onShapeSelect={selectShape} project={project} selected={selected} frame={currentFrame} zoom={zoom} disabled={busy || recordingBusy || !ready || placingCaption} onNarrationSelect={n => { setSelectedShape(undefined); setSelected(undefined); setSelectedCaption(undefined); setLibraryTab('voice'); layout.openLibrary(); seek(n.startFrame); }} onSeek={seekTimeline} onZoom={setZoom} onSelect={id => { setSelected(id); setSelectedCaption(undefined); setSelectedShape(undefined); }} onScrubChange={setScrubbing} onReorder={reorderClips} onMoveChange={setMoving}
        selectedCaption={selectedCaption} onCaptionSelect={selectCaption} onCaptionRange={setCaptionRange} onCaptionBegin={beginCaption} onCaptionEnd={endCaption}
        trimming={trimming} onTrimBegin={beginTrim} onTrimPreview={previewTrim} onTrimEnd={endTrim} />
    </section>
    </div>
    <footer><span className={error ? 'error-status' : ''}>{error ? '작업을 확인해 주세요' : message}</span><span>장면 {appVersion} · 로컬 편집</span></footer>
    {busy && <TaskProgressDialog progress={progress} />}
    {error && !busy && <div className="error-panel" role="alert"><div><strong>작업 안내</strong><button aria-label="안내 닫기" onClick={() => setError('')}>×</button></div><pre>{error}</pre></div>}
  </div>;
}
