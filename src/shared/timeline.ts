import type { Clip } from './project';

export type TrimEdge = 'start' | 'end';
// Choose an insertion boundary on the unchanged track, then account for removing the source clip.
export function reorderTarget(clips: Pick<Clip, 'inFrame' | 'outFrame'>[], from: number, frame: number) {
  let boundary = 0, slot = 0;
  for (; slot < clips.length; slot++) {
    const length = clips[slot].outFrame - clips[slot].inFrame;
    if (frame < boundary + length / 2) break;
    boundary += length;
  }
  return { to: slot > from ? slot - 1 : slot, boundary };
}
// Always measure against the pointer-down snapshot, not the already trimmed clip.
export function trimFromDrag(clip: Pick<Clip, 'inFrame' | 'outFrame'>, edge: TrimEdge, deltaFrames: number, sourceFrames: number) {
  const delta = Math.round(deltaFrames);
  if (!Number.isFinite(delta) || !Number.isInteger(sourceFrames) || sourceFrames < clip.outFrame) throw new Error('잘못된 트리밍 범위입니다.');
  return edge === 'start'
    ? { inFrame: Math.max(0, Math.min(clip.inFrame + delta, clip.outFrame - 1)), outFrame: clip.outFrame }
    : { inFrame: clip.inFrame, outFrame: Math.max(clip.inFrame + 1, Math.min(clip.outFrame + delta, sourceFrames)) };
}

export function pointerFrame(clientX: number, viewportLeft: number, scrollLeft: number, pixelsPerSecond: number, totalFrames: number) {
  return Math.max(0, Math.min(Math.round((clientX - viewportLeft + scrollLeft) / pixelsPerSecond * 30), Math.max(0, totalFrames - 1)));
}
export function edgeScrollSpeed(clientX: number, left: number, right: number) {
  const edge = 36;
  if (clientX < left + edge) return -Math.min(900, (left + edge - clientX) * 20);
  if (clientX > right - edge) return Math.min(900, (clientX - right + edge) * 20);
  return 0;
}
