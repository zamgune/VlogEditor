export type SnapRect = { left: number; top: number; width: number; height: number };
export type CaptionSnapTarget = SnapRect & { id: string };
export type CaptionSnapAnchor = { anchor: 0 | .5 | 1; left: number; top: number };
export type CaptionSnapGuide = { x1: number; y1: number; x2: number; y2: number; gap?: number };
type Axis = 'x' | 'y';
type Candidate = { value: number; anchor?: 0 | .5 | 1; targets: string[]; priority: number;
  guides(rect: SnapRect): CaptionSnapGuide[]; equalGap?: boolean };
export type CaptionSnapResult = { rect: SnapRect; h?: 0 | .5 | 1; v?: 0 | .5 | 1;
  guides: CaptionSnapGuide[]; targetIds: string[]; equalGap: boolean };

const start = (r: SnapRect, axis: Axis) => axis === 'x' ? r.left : r.top;
const size = (r: SnapRect, axis: Axis) => axis === 'x' ? r.width : r.height;
const end = (r: SnapRect, axis: Axis) => start(r, axis) + size(r, axis);
const otherAxis = (axis: Axis): Axis => axis === 'x' ? 'y' : 'x';
const overlaps = (a: SnapRect, b: SnapRect, axis: Axis) => Math.min(end(a, axis), end(b, axis)) > Math.max(start(a, axis), start(b, axis));
const line = (axis: Axis, from: number, to: number, at: number, gap?: number): CaptionSnapGuide =>
  axis === 'x' ? { x1: from, x2: to, y1: at, y2: at, gap } : { x1: at, x2: at, y1: from, y2: to, gap };
function gapGuide(a: SnapRect, b: SnapRect, axis: Axis): CaptionSnapGuide {
  const cross = otherAxis(axis), at = (Math.max(start(a, cross), start(b, cross)) + Math.min(end(a, cross), end(b, cross))) / 2;
  return line(axis, end(a, axis), start(b, axis), at, start(b, axis) - end(a, axis));
}

/** Snap in output pixels; the attraction distance stays constant in screen pixels. */
export function snapCaptionRect(rect: SnapRect, targets: CaptionSnapTarget[], anchors: CaptionSnapAnchor[],
  canvas: { width: number; height: number }, scale: number): CaptionSnapResult {
  const threshold = 10 / Math.max(.001, scale), gap = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / 45));
  const candidates: Record<Axis, Candidate[]> = { x: [], y: [] };
  for (const axis of ['x', 'y'] as const) {
    const cross = otherAxis(axis), extent = axis === 'x' ? canvas.height : canvas.width;
    const offer = (candidate: Candidate) => {
      if (Math.abs(candidate.value - start(rect, axis)) <= threshold) candidates[axis].push(candidate);
    };
    for (const anchor of anchors) {
      const value = axis === 'x' ? anchor.left : anchor.top;
      offer({ value, anchor: anchor.anchor, targets: [], priority: 2,
        guides: () => [line(cross, 0, extent, value + size(rect, axis) * anchor.anchor)] });
    }
    for (const target of targets) {
      for (const fraction of [0, .5, 1]) {
        const at = start(target, axis) + size(target, axis) * fraction;
        offer({ value: at - size(rect, axis) * fraction, targets: [target.id], priority: 1,
          guides: moved => [line(cross, Math.min(start(moved, cross), start(target, cross)), Math.max(end(moved, cross), end(target, cross)), at)] });
      }
      // Side-by-side and stacked captions get a small, resolution-independent gap.
      if (overlaps(rect, target, cross)) {
        offer({ value: end(target, axis) + gap, targets: [target.id], priority: 1,
          guides: moved => [gapGuide(target, moved, axis)] });
        offer({ value: start(target, axis) - gap - size(rect, axis), targets: [target.id], priority: 1,
          guides: moved => [gapGuide(moved, target, axis)] });
      }
    }
    // Nearby rows/columns supply an existing gap to repeat (or split evenly).
    // Sorting avoids comparing every pair when a project has many captions.
    const neighbors = targets.filter(t => overlaps(rect, t, cross)).sort((a, b) => start(a, axis) - start(b, axis));
    for (let i = 1; i < neighbors.length; i++) {
      const a = neighbors[i - 1], b = neighbors[i], space = start(b, axis) - end(a, axis);
      if (space <= 0 || !overlaps(a, b, cross)) continue;
      const base = { targets: [a.id, b.id], priority: 0, equalGap: true };
      offer({ ...base, value: end(b, axis) + space, guides: moved => [gapGuide(a, b, axis), gapGuide(b, moved, axis)] });
      offer({ ...base, value: start(a, axis) - space - size(rect, axis), guides: moved => [gapGuide(moved, a, axis), gapGuide(a, b, axis)] });
      if (space > size(rect, axis)) offer({ ...base, value: end(a, axis) + (space - size(rect, axis)) / 2,
        guides: moved => [gapGuide(a, moved, axis), gapGuide(moved, b, axis)] });
    }
  }
  const closest = (axis: Axis) => candidates[axis].sort((a, b) => {
    const distance = Math.abs(a.value - start(rect, axis)) - Math.abs(b.value - start(rect, axis));
    return Math.abs(distance) < .01 ? a.priority - b.priority : distance;
  })[0];
  const x = closest('x'), y = closest('y');
  const moved = { ...rect, left: x?.value ?? rect.left, top: y?.value ?? rect.top };
  // Preserve responsive canvas anchors when an object guide coincides with one.
  const h = x?.anchor ?? anchors.find(a => x && Math.abs(a.left - x.value) < .5)?.anchor;
  const v = y?.anchor ?? anchors.find(a => y && Math.abs(a.top - y.value) < .5)?.anchor;
  return { rect: moved, h, v, guides: [...(x?.guides(moved) ?? []), ...(y?.guides(moved) ?? [])],
    targetIds: [...new Set([...(x?.targets ?? []), ...(y?.targets ?? [])])], equalGap: !!(x?.equalGap || y?.equalGap) };
}
