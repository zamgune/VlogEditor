import { useEffect, useRef } from 'react';
import { narrationEnd, type Narration } from '../shared/narration';

export function NarrationPlayback({ takes, frame, total, playing, muted, onError }: { takes: Narration[]; frame: number; total: number; playing: boolean; muted: boolean; onError(message: string): void }) {
  return <>{takes.map(n => <TakeAudio key={n.id} take={n} frame={frame} total={total} playing={playing && !muted} onError={onError} />)}</>;
}
function TakeAudio({ take, frame, total, playing, onError }: { take: Narration; frame: number; total: number; playing: boolean; onError(message: string): void }) {
  const audio = useRef<HTMLAudioElement>(null), starting = useRef(false), failed = useRef(false);
  const active = playing && !take.muted && take.volume > 0 && frame >= take.startFrame && frame < narrationEnd(take, total);
  useEffect(() => {
    const el = audio.current; if (!el) return;
    el.volume = take.volume;
    if (!active) { el.pause(); return; }
    const seconds = (take.inFrame + frame - take.startFrame) / 30;
    if (el.readyState >= 1 && Math.abs(el.currentTime - seconds) > .1) el.currentTime = seconds;
    if (el.paused && !starting.current && !failed.current) {
      starting.current = true; void el.play().catch(e => { if (e.name !== 'AbortError') { failed.current = true; onError(`녹음 재생 실패: ${take.name}`); } }).finally(() => { starting.current = false; });
    }
  }, [active, frame, take, onError]);
  return <audio ref={audio} data-testid="narration-audio" src={`vlog://editor/narration/${take.id}`} preload="metadata" onError={() => { if (!failed.current) { failed.current = true; onError(`녹음 파일을 찾을 수 없습니다: ${take.name}`); } }} />;
}
