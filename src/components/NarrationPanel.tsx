import { useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_FRAMES, NarrationSchema, type Narration, type RecordingClock, type RecordingInput } from '../shared/narration';
import { timecode } from '../shared/project';

type Props = { takes: Narration[]; frame: number; total: number; disabled: boolean; stopRequest: number;
  onPrepare(): Promise<void>; onCapture(clock: RecordingClock | null): void; onBusy(value: boolean): void;
  onSaved(take: Narration): Promise<void>; onChange(take: Narration): void; onDelete(id: string): void; onSeek(frame: number): void };
export function NarrationPanel(props: Props) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]), [device, setDevice] = useState('default');
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'recording' | 'saving' | 'failed'>('idle');
  const [connected, setConnected] = useState(false), [connecting, setConnecting] = useState(false);
  const [level, setLevel] = useState(0), [elapsed, setElapsed] = useState(0), [error, setError] = useState('');
  const latest = useRef(props); latest.current = props;
  const stream = useRef<MediaStream | null>(null), context = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null), clock = useRef<RecordingClock | null>(null);
  const pending = useRef<RecordingInput | null>(null), meter = useRef(0), timer = useRef(0), generation = useRef(0);
  const savedTake = useRef<Narration | null>(null);
  const busy = useRef(false), saving = useRef(false), cancelled = useRef(false), limit = useRef(0), connectingRef = useRef(false);
  const locked = phase !== 'idle';
  function release() {
    cancelAnimationFrame(meter.current); clearInterval(timer.current);
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    void context.current?.close(); context.current = null;
    setConnected(false); setLevel(0); void window.editor.microphoneAccess(false);
  }
  function unlock() { busy.current = false; latest.current.onBusy(false); void window.editor.recordingActive(false); }
  async function refreshDevices() {
    try { setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput')); }
    catch { setError('마이크 목록을 읽을 수 없습니다. Windows 소리 설정을 확인해 주세요.'); }
  }
  function microphoneError(e: unknown) {
    const name = (e as DOMException)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return '마이크 접근이 차단되었습니다. Windows 설정 → 개인정보 및 보안 → 마이크에서 마이크 및 데스크톱 앱 접근을 허용해 주세요.';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return '선택한 마이크를 찾을 수 없습니다. 연결 상태를 확인하고 마이크를 다시 선택해 주세요.';
    return `마이크를 사용할 수 없습니다. 다른 앱에서 사용 중인지 확인해 주세요.\n${String(e)}`;
  }
  async function connect(token: number) {
    if (token !== generation.current) throw new Error('마이크 연결을 취소했습니다.');
    if (stream.current?.active) return stream.current;
    await window.editor.microphoneAccess(true);
    if (token !== generation.current) { if (!busy.current && !connectingRef.current) void window.editor.microphoneAccess(false); throw new Error('마이크 연결을 취소했습니다.'); }
    const input = await navigator.mediaDevices.getUserMedia({ audio: { ...(device !== 'default' ? { deviceId: { exact: device } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false });
    if (token !== generation.current) { input.getTracks().forEach(t => t.stop()); if (!busy.current && !connectingRef.current) void window.editor.microphoneAccess(false); throw new Error('마이크 연결을 취소했습니다.'); }
    stream.current = input; setConnected(true); await refreshDevices();
    const audio = new AudioContext(); context.current = audio; await audio.resume();
    if (token !== generation.current || !input.active) throw new Error('마이크 연결을 취소했습니다.');
    const analyser = audio.createAnalyser(); analyser.fftSize = 1024; audio.createMediaStreamSource(input).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const tick = () => { analyser.getFloatTimeDomainData(samples); let peak = 0; for (const v of samples) peak = Math.max(peak, Math.abs(v)); setLevel(Math.min(100, Math.round(peak * 100))); meter.current = requestAnimationFrame(tick); };
    meter.current = requestAnimationFrame(tick);
    input.getAudioTracks()[0].onended = () => { setError('마이크 연결이 끊겼습니다. 그때까지 녹음한 음성을 저장합니다.'); if (recorder.current) stop(false); else release(); };
    return input;
  }
  async function checkMicrophone() {
    if (connectingRef.current || busy.current) return;
    connectingRef.current = true; setConnecting(true); setError(''); const token = ++generation.current;
    try { await connect(token); } catch (e) { if (token === generation.current) { release(); setError(microphoneError(e)); } }
    finally { connectingRef.current = false; setConnecting(false); }
  }
  async function persist() {
    if (!pending.current || saving.current) return;
    saving.current = true; setPhase('saving');
    try {
      const take = savedTake.current ?? await window.editor.saveNarration(pending.current); savedTake.current = take;
      // Autosave the take before releasing the recording/close guard.
      await latest.current.onSaved(take);
      pending.current = null; savedTake.current = null; setPhase('idle'); unlock();
    } catch (e) { setError(`녹음 저장에 실패했습니다. 녹음은 아직 보관 중입니다. 저장을 다시 시도해 주세요.\n${String(e)}`); setPhase('failed'); }
    finally { saving.current = false; }
  }
  function stop(discard = false) {
    if (saving.current) return;
    if (phase === 'failed') { if (discard) { pending.current = null; savedTake.current = null; setPhase('idle'); unlock(); } return; }
    cancelled.current = discard;
    if (!recorder.current) {
      ++generation.current; release(); latest.current.onCapture(null); setPhase('idle'); unlock(); return;
    }
    const rec = recorder.current;
    if (rec.state === 'inactive') return;
    limit.current = Math.max(1, Math.min(limit.current, Math.round((performance.now() - clock.current!.startedAt) / 1000 * 30)));
    latest.current.onCapture(null); clearInterval(timer.current); setPhase('saving'); rec.stop();
  }
  async function start() {
    if (busy.current || connectingRef.current || props.disabled || !props.total || props.takes.length >= 100) return;
    busy.current = true; props.onBusy(true); setPhase('preparing'); setError(''); setElapsed(0); cancelled.current = false;
    const token = ++generation.current, startFrame = props.frame;
    try {
      await window.editor.recordingActive(true);
      const input = await connect(token);
      await latest.current.onPrepare();
      if (token !== generation.current) return;
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(input, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 }); recorder.current = rec;
      const recordingClock = { startFrame, startedAt: performance.now() }; clock.current = recordingClock;
      limit.current = Math.min(MAX_RECORDING_FRAMES, props.total - startFrame);
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onerror = () => { setError('녹음이 중단되었습니다. 수집된 음성을 저장합니다.'); stop(false); };
      rec.onstop = () => {
        limit.current = Math.max(1, Math.min(limit.current, Math.round((performance.now() - recordingClock.startedAt) / 1000 * 30)));
        recorder.current = null; latest.current.onCapture(null); release();
        if (cancelled.current) { setPhase('idle'); unlock(); return; }
        void (async () => {
          try {
            const blob = new Blob(chunks, { type: rec.mimeType });
            if (!blob.size) throw new Error('녹음된 소리가 없습니다.');
            const names = new Set(latest.current.takes.map(n => n.name)); let number = 1;
            while (names.has(`음성 ${number}`)) number++;
            pending.current = { data: new Uint8Array(await blob.arrayBuffer()), frames: limit.current, startFrame, name: `음성 ${number}` };
            await persist();
          } catch (e) { setError(String(e)); setPhase('idle'); unlock(); }
        })();
      };
      rec.start(1000); setPhase('recording'); latest.current.onCapture(recordingClock);
      timer.current = window.setInterval(() => {
        const frames = Math.floor((performance.now() - recordingClock.startedAt) / 1000 * 30);
        setElapsed(Math.min(frames, limit.current)); if (frames >= limit.current) stop(false);
      }, 30);
    } catch (e) {
      if (token === generation.current) { recorder.current = null; release(); setError(microphoneError(e)); setPhase('idle'); unlock(); }
    }
  }
  const stopRef = useRef(stop); stopRef.current = stop;
  useEffect(() => { if (props.stopRequest && busy.current) { setError('영상 재생이 중단되어 녹음을 정지합니다.'); stopRef.current(false); } }, [props.stopRequest]);
  useEffect(() => {
    void refreshDevices(); navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    const off = window.editor.onRecordingStop(() => { setError('녹음을 저장한 뒤 창을 다시 닫아 주세요.'); stopRef.current(false); });
    const key = (e: KeyboardEvent) => { if (!busy.current || saving.current) return; if (e.code === 'Space' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopRef.current(e.key === 'Escape'); } };
    window.addEventListener('keydown', key);
    return () => { ++generation.current; cancelled.current = true; if (recorder.current?.state === 'recording') recorder.current.stop(); release(); off(); navigator.mediaDevices.removeEventListener('devicechange', refreshDevices); window.removeEventListener('keydown', key); };
  }, []);
  return <section className="narration-panel" aria-label="음성 녹음">
    <h3>영상을 보며 내 목소리 녹음</h3>
    <label>마이크<select aria-label="녹음 마이크" value={device} disabled={locked || connecting || props.disabled} onChange={e => { release(); setDevice(e.target.value); }}><option value="default">Windows 기본 마이크</option>{devices.filter(d => d.deviceId !== 'default').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `마이크 ${i + 1}`}</option>)}</select></label>
    <button disabled={locked || connecting || props.disabled} onClick={() => connected ? release() : void checkMicrophone()}>{connecting ? '마이크 연결 중…' : connected ? '마이크 끄기' : '마이크 확인'}</button>
    <div className="mic-meter"><meter aria-label="마이크 입력 크기" min={0} max={100} value={level} /><span>{connected ? level > 90 ? '소리가 너무 큽니다' : '마이크 켜짐' : '마이크 꺼짐'}</span></div>
    <p className="recording-position">{phase === 'recording' ? `● 녹음 중 ${timecode(elapsed)}` : phase === 'saving' ? '녹음 저장 중…' : phase === 'preparing' ? '마이크와 영상 준비 중…' : `시작 위치 ${timecode(props.frame)}`}</p>
    {phase === 'idle' ? <button className="record-button" disabled={props.disabled || connecting || !props.total || props.takes.length >= 100} onClick={() => void start()}>● 녹음 시작</button>
      : phase === 'failed' ? <div className="record-actions"><button onClick={() => void persist()}>저장 다시 시도</button><button onClick={() => stop(true)}>녹음 버리기</button></div>
        : <div className="record-actions"><button disabled={phase !== 'recording'} onClick={() => stop(false)}>■ 녹음 정지</button><button disabled={phase === 'saving'} onClick={() => stop(true)}>녹음 취소</button></div>}
    <p className="hint">이어폰을 쓰면 영상 소리가 마이크에 다시 들어가지 않습니다. Space 정지 · Esc 취소. 영상 끝에서 자동으로 정지합니다. 한 번에 최대 30분.</p>
    {error && <p className="narration-error" role="alert">{error}</p>}
    <h3>녹음한 음성 · {props.takes.length}</h3>
    <p className="hint">음성은 타임라인 위치에 고정됩니다. 영상 순서·길이를 바꾸면 음성 위치도 확인하세요.</p>
    {props.takes.map(n => <NarrationItem key={n.id} take={n} total={props.total} disabled={props.disabled || locked} onChange={props.onChange} onDelete={props.onDelete} onSeek={props.onSeek} />)}
  </section>;
}
function NarrationItem({ take: n, total, disabled, onChange, onDelete, onSeek }: { take: Narration; total: number; disabled: boolean; onChange(n: Narration): void; onDelete(id: string): void; onSeek(frame: number): void }) {
  const update = (patch: Partial<Narration>) => onChange(NarrationSchema.parse({ ...n, ...patch }));
  const number = (label: string, key: 'startFrame' | 'inFrame' | 'outFrame', min: number, max: number) => <label>{label}<input aria-label={`${n.name} ${label}`} key={`${key}-${n[key]}`} type="number" min={min / 30} max={max / 30} step="any" disabled={disabled} defaultValue={(n[key] / 30).toFixed(3)} onBlur={e => { const v = e.currentTarget.valueAsNumber; const value = Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v * 30))) : n[key]; e.currentTarget.value = (value / 30).toFixed(3); if (value !== n[key]) update({ [key]: value }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>;
  return <article className="narration-item" data-testid="narration-item">
    <div><strong>{n.name}</strong><button disabled={disabled || n.startFrame >= total} onClick={() => onSeek(n.startFrame)}>위치로 이동</button></div>
    <small>{timecode(n.startFrame)} → {timecode(n.startFrame + n.outFrame - n.inFrame)} · {((n.outFrame - n.inFrame) / 30).toFixed(2)}초</small>
    {n.startFrame + n.outFrame - n.inFrame > total && <p className="narration-error">영상 밖 음성은 출력되지 않습니다.</p>}
    {number('위치 (초)', 'startFrame', 0, Math.max(n.startFrame, total - 1))}
    <details><summary>음성 앞뒤 자르기</summary>{number('음성 시작 (초)', 'inFrame', 0, n.outFrame - 1)}{number('음성 종료 (초)', 'outFrame', n.inFrame + 1, n.durationFrames)}</details>
    <label>음량 <input aria-label={`${n.name} 음량`} key={`volume-${n.volume}`} type="number" min={0} max={100} disabled={disabled} defaultValue={Math.round(n.volume * 100)} onBlur={e => { const v = e.currentTarget.valueAsNumber; const value = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : Math.round(n.volume * 100); e.currentTarget.value = String(value); if (value !== n.volume * 100) update({ volume: value / 100 }); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />%</label>
    <div className="record-actions"><button aria-pressed={n.muted} disabled={disabled} onClick={() => update({ muted: !n.muted })}>{n.muted ? '음소거 해제' : '음소거'}</button><button disabled={disabled} onClick={() => onDelete(n.id)}>녹음 삭제</button></div>
  </article>;
}
