import test from 'node:test';
import assert from 'node:assert/strict';
import { snapCaptionRect, type CaptionSnapTarget, type SnapRect } from '../src/shared/caption-snap';
const canvas = { width: 1920, height: 1080 };
const target = (id: string, left: number, top: number, width = 300, height = 80): CaptionSnapTarget => ({ id, left, top, width, height });
const snap = (rect: SnapRect, targets: CaptionSnapTarget[], scale = .5) => snapCaptionRect(rect, targets, [], canvas, scale);

test('captions align each axis independently, including left/center/right and top/center/bottom', () => {
  const a = target('a', 230, 190);
  for (const fraction of [0, .5, 1]) {
    const left = a.left + (a.width - 200) * fraction;
    const result = snap({ left: left + 6, top: 630, width: 200, height: 40 }, [a]);
    assert.equal(result.rect.left, left); assert.equal(result.rect.top, 630); assert.deepEqual(result.targetIds, ['a']);
    const top = a.top + (a.height - 40) * fraction;
    const horizontal = snap({ left: 860, top: top + 6, width: 200, height: 40 }, [a]);
    assert.equal(horizontal.rect.left, 860); assert.equal(horizontal.rect.top, top);
  }
});
test('captions snap below, above and alongside each other with a consistent gap', () => {
  const a = target('a', 230, 190), gap = 24;
  const below = snap({ left: 236, top: 299, width: 200, height: 40 }, [a]);
  assert.equal(below.rect.left, 230); assert.equal(below.rect.top, a.top + a.height + gap);
  assert.equal(below.guides.find(g => g.gap !== undefined)?.gap, gap);
  const above = snap({ left: 236, top: 130, width: 200, height: 40 }, [a]);
  assert.equal(above.rect.top, a.top - 40 - gap);
  const right = snap({ left: 560, top: 196, width: 200, height: 40 }, [a]);
  assert.equal(right.rect.left, a.left + a.width + gap); assert.equal(right.rect.top, a.top);
});
test('three captions repeat existing vertical/horizontal gaps or fit evenly between two', () => {
  const a = target('a', 230, 100), b = target('b', 230, 230);
  const below = snap({ left: 234, top: 365, width: 300, height: 80 }, [b, a]);
  assert.equal(below.rect.top, 360); assert.equal(below.equalGap, true);
  assert.deepEqual(below.guides.filter(g => g.gap !== undefined).map(g => g.gap), [50, 50]);
  const between = snap({ left: 234, top: 235, width: 300, height: 80 }, [a, target('c', 230, 360)]);
  assert.equal(between.rect.top, 230); assert.equal(between.equalGap, true);
  const columns = snap({ left: 735, top: 102, width: 200, height: 80 }, [target('a', 230, 100, 200), target('b', 480, 100, 200)]);
  assert.equal(columns.rect.left, 730); assert.equal(columns.equalGap, true);
});
test('snap tolerance follows preview scale and distant or non-overlapping rows do not attract gaps', () => {
  const a = target('a', 230, 190);
  for (const scale of [.15, .5, 1, 2]) {
    const near = snap({ left: 230 + 8 / scale, top: 650, width: 300, height: 80 }, [a], scale);
    const far = snap({ left: 230 + 12 / scale, top: 650, width: 300, height: 80 }, [a], scale);
    assert.equal(near.rect.left, 230); assert.equal(far.rect.left, 230 + 12 / scale);
  }
  assert.equal(snap({ left: 1000, top: 299, width: 200, height: 40 }, [a]).rect.top, 299);
});
test('canvas anchors still snap independently and remain responsive when coinciding with another caption', () => {
  const anchors = [{ anchor: .5 as const, left: 860, top: 520 }];
  const center = snapCaptionRect({ left: 865, top: 525, width: 200, height: 40 }, [target('a', 810, 100)], anchors, canvas, .5);
  assert.equal(center.h, .5); assert.equal(center.v, .5); assert.equal(center.rect.left, 860); assert.equal(center.rect.top, 520);
  const one = snapCaptionRect({ left: 865, top: 660, width: 200, height: 40 }, [], anchors, canvas, .5);
  assert.equal(one.h, .5); assert.equal(one.v, undefined); assert.equal(one.rect.top, 660);
});
