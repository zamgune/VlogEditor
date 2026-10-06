import { useEffect, useRef, useState, type RefObject } from 'react';
import type { locate } from './shared/project';
import type { RecordingClock } from './shared/narration';

type Props = { video: RefObject<HTMLVideoElement | null>; current: ReturnType<typeof locate>; mediaUrl: string;
  playing: boolean; total: number; capture: RecordingClock | null;
  onFrame(frame: number): void; onStop(): void; onError(message: string): void };

export function usePreviewPlayback(props: Props) {
  const latest = useRef(props); latest.current = props;
  const prepared = useRef(false);
  const [running, setRunning] = useState(false);
  const { video, current, mediaUrl, playing, total, capture } = props;
  useEffect(() => {
    const el = video.current; if (!el || !current) return;
    let live = true, preparing = true, attempts = 0, firstStart = true;
    const target = current.sourceFrame / 30, tolerance = playing ? 1 / 60 : .001;
    prepared.current = false;
    setRunning(false);
    const waiting = () => setRunning(false);
    function prepare() {
      if (!live || !preparing || el!.currentSrc !== mediaUrl || el!.readyState < 1 || el!.seeking) return;
      if (Math.abs(el!.currentTime - target) > tolerance) {
        if (attempts >= 3) { preparing = false; latest.current.onError('자른 시작 위치를 준비하지 못했습니다. 재생을 다시 눌러 주세요.'); return; }
        attempts++; el!.pause(); el!.currentTime = target;
        return; // A time assignment is not a completed seek. Wait for seeked/loadeddata.
      }
      if (el!.readyState < 2) return;
      preparing = false; prepared.current = true;
      if (playing) void el!.play().then(() => { if (live && prepared.current && !el!.paused && !el!.seeking) { firstStart = false; setRunning(true); } }).catch(e => {
        if (live && e.name !== 'AbortError') latest.current.onError(`미리보기 재생 실패: ${String(e)}`);
      });
    }
    function repairStart() {
      prepared.current = false; preparing = true; firstStart = true; setRunning(false); el!.pause(); prepare();
    }
    function seeked() {
      if (!live) return;
      if (playing && !preparing && el!.currentTime < current!.clip.inFrame / 30 - 1 / 60) repairStart();
      else prepare();
    }
    function started() {
      if (!live) return;
      // Some media loads can reset the position on play. Never play the discarded
      // prelude while clamping the timeline at zero; prepare the start once again.
      if (el!.currentTime < current!.clip.inFrame / 30 - 1 / 60 || (firstStart && Math.abs(el!.currentTime - target) > .1)) { repairStart(); return; }
      firstStart = false; setRunning(prepared.current && !preparing);
    }
    el.volume = current.clip.volume; el.playbackRate = 1;
    if (!playing || el.currentSrc !== mediaUrl || el.readyState < 2 || el.seeking || Math.abs(el.currentTime - target) > tolerance) el.pause();
    el.addEventListener('waiting', waiting); el.addEventListener('seeking', waiting); el.addEventListener('pause', waiting); el.addEventListener('playing', started);
    el.addEventListener('loadedmetadata', prepare); el.addEventListener('loadeddata', prepare); el.addEventListener('canplay', prepare); el.addEventListener('seeked', seeked);
    prepare();
    return () => { live = false;
      prepared.current = false;
      el.removeEventListener('loadedmetadata', prepare); el.removeEventListener('loadeddata', prepare); el.removeEventListener('canplay', prepare); el.removeEventListener('seeked', seeked);
      el.removeEventListener('waiting', waiting); el.removeEventListener('seeking', waiting); el.removeEventListener('pause', waiting); el.removeEventListener('playing', started); };
  }, [video, mediaUrl, playing, current?.clip.id, current?.clip.inFrame, current?.clip.outFrame, current?.start, current?.clip.volume, !playing ? current?.sourceFrame : undefined]);

  useEffect(() => {
    if (!playing || !current) return;
    let request = 0, lastCorrection = performance.now();
    const tick = () => {
      const el = video.current;
      if (!el) return;
      const end = current.start + current.clip.outFrame - current.clip.inFrame;
      if (capture) {
        // Recording must follow the microphone clock, including while a new clip loads.
        const frame = capture.startFrame + Math.floor((performance.now() - capture.startedAt) / 1000 * 30);
        if (frame >= total) { latest.current.onFrame(total - 1); latest.current.onStop(); return; }
        latest.current.onFrame(frame);
        const source = current.clip.inFrame + frame - current.start, now = performance.now();
        if (el.readyState >= 2 && !el.seeking && !el.paused && source >= current.clip.inFrame && source < current.clip.outFrame) {
          const drift = source / 30 - el.currentTime;
          // Small differences are corrected gradually, never by repeatedly cutting audio.
          if (Math.abs(drift) > .5 && now - lastCorrection > 1000) {
            el.currentTime = source / 30; lastCorrection = now; el.playbackRate = 1;
          } else el.playbackRate = Math.abs(drift) < .04 ? 1 : Math.max(.95, Math.min(1.05, 1 + drift * .1));
        }
      } else if (prepared.current && !el.seeking && el.readyState >= 2 && (!el.paused || el.ended)) {
        // The media/audio clock is authoritative during ordinary preview. Waiting for
        // decode must not advance the timeline and trigger another seek into the audio.
        const source = Math.floor(el.currentTime * 30 + .0001);
        const frame = el.ended ? end : current.start + source - current.clip.inFrame;
        if (frame >= end) {
          if (end >= total) { latest.current.onFrame(total - 1); latest.current.onStop(); }
          else latest.current.onFrame(end);
          return;
        }
        latest.current.onFrame(Math.max(current.start, frame));
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(request); if (video.current) video.current.playbackRate = 1; };
  }, [video, playing, current?.clip.id, current?.clip.inFrame, current?.clip.outFrame, current?.start, total, capture]);
  return playing && running;
}
