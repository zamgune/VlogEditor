import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_PRESETS } from '../src/shared/canvas';
import { captionTransform, noMotion } from '../src/shared/captions';
import { animatedRect, defaultViewSettings, DEVICE_PRESETS, parseViewSettings, projectToViewer, safeAreaWarnings, viewerGeometry, viewerToProject } from '../src/shared/viewer';

test('every canvas/device/orientation/fit has invertible coordinates and the correct crop or letterbox', () => {
  for (const canvas of CANVAS_PRESETS) for (const d of DEVICE_PRESETS) for (const orientation of ['portrait', 'landscape'] as const) for (const fit of ['contain', 'cover'] as const) {
    const g = viewerGeometry(canvas, { ...defaultViewSettings(), mode: 'device', deviceId: d.id, orientation, fit });
    assert.equal(g.width, orientation === 'portrait' ? d.width : d.height);
    const rect = { left: canvas.width * .23, top: canvas.height * .67, width: 153, height: 61 };
    const shown = projectToViewer(rect, g), restored = viewerToProject(shown.left, shown.top, g);
    assert.ok(Math.abs(restored.x - rect.left) < 1e-8 && Math.abs(restored.y - rect.top) < 1e-8);
    assert.ok(Math.abs(g.video.width / g.video.height - canvas.width / canvas.height) < 1e-8);
    if (fit === 'contain') assert.ok(g.video.left >= -1e-8 && g.video.top >= -1e-8);
    else assert.ok(g.video.left <= 1e-8 && g.video.top <= 1e-8);
  }
});
test('warnings map source text through letterbox/crop and follow visual animation bounds', () => {
  const view = { ...defaultViewSettings(), mode: 'device' as const, customDevices: [{ id: 'fixture', name: '9:16', width: 1080, height: 1920 }], deviceId: 'fixture' };
  const g = viewerGeometry({ width: 1080, height: 1920 }, view);
  const safe = { left: 200, top: 1100, width: 450, height: 80 };
  assert.deepEqual(safeAreaWarnings(safe, g), []);
  assert.match(safeAreaWarnings(animatedRect(safe, { x: 0, y: 400, scale: 1 }), g).join(), /하단 정보/);
  assert.match(safeAreaWarnings({ ...safe, left: 900 }, g).join(), /좋아요.*잘림/);
  assert.deepEqual(safeAreaWarnings(safe, viewerGeometry({ width: 1080, height: 1920 }, { ...view, guides: false })), []);
  const wide = viewerGeometry({ width: 1920, height: 1080 }, { ...view, platform: 'video', controls: true });
  assert.deepEqual(safeAreaWarnings({ left: 400, top: 1000, width: 600, height: 70 }, wide), []); // Controls occupy the device's black bars.
  const crop = viewerGeometry({ width: 1920, height: 1080 }, { ...view, fit: 'cover' });
  assert.match(safeAreaWarnings({ left: 10, top: 400, width: 80, height: 80 }, crop).join(), /잘림/);
});
test('normal video controls, custom banner and original mode have independent guide behavior', () => {
  const view = { ...defaultViewSettings(), mode: 'device' as const, platform: 'video' as const, controls: false };
  assert.equal(viewerGeometry({ width: 1080, height: 1920 }, view).areas.length, 0);
  assert.deepEqual(viewerGeometry({ width: 1080, height: 1920 }, { ...view, banner: true }).areas.map(a => a.id), ['banner']);
  const g = viewerGeometry({ width: 1080, height: 1920 }, defaultViewSettings());
  assert.equal(g.enabled, false); assert.equal(g.scale, 1); assert.deepEqual(g.video, { left: 0, top: 0, width: 1080, height: 1920 });
});
test('slide and pop warnings use the rendered frame rather than static text anchors', () => {
  const view = { ...defaultViewSettings(), mode: 'device' as const, customDevices: [{ id: 'fixture', name: '9:16', width: 1080, height: 1920 }], deviceId: 'fixture', shorts: { top: .25, bottom: .25, left: 0, right: 0 } };
  const g = viewerGeometry({ width: 1080, height: 1920 }, view), rect = { left: 200, top: 496, width: 300, height: 80 };
  const motion = { ...noMotion(), enter: { type: 'slide' as const, frames: 30, direction: 'down' as const } };
  assert.deepEqual(safeAreaWarnings(rect, g), []);
  const first = captionTransform(motion, 0, 90, 1, 1080), settled = captionTransform(motion, 0, 90, 30, 1080);
  assert.ok(first.alpha > 0); assert.match(safeAreaWarnings(animatedRect(rect, first), g).join(), /상단 버튼/);
  assert.deepEqual(safeAreaWarnings(animatedRect(rect, settled), g), []);
  const pop = captionTransform({ ...motion, enter: { ...motion.enter, type: 'pop' } }, 0, 90, 1, 1080);
  const scaled = animatedRect(rect, pop); assert.ok(scaled.width < rect.width && scaled.left > rect.left);
  assert.equal(captionTransform(motion, 0, 90, 0, 1080).alpha, 0);
});
test('viewer preferences roundtrip separately and corrupt/unknown presets recover safely', () => {
  const valid = { ...defaultViewSettings(), customDevices: [{ id: 'custom-1', name: '내 폰', width: 1220, height: 2712 }], deviceId: 'custom-1' };
  assert.deepEqual(parseViewSettings(JSON.parse(JSON.stringify(valid))), valid);
  assert.equal(parseViewSettings({ ...valid, deviceId: 'deleted' }).deviceId, 'galaxys25');
  for (const invalid of [null, {}, { ...valid, shorts: { ...valid.shorts, top: NaN } }, { ...valid, customDevices: [{ ...valid.customDevices[0], width: 0 }] }]) assert.deepEqual(parseViewSettings(invalid), defaultViewSettings());
  assert.deepEqual(animatedRect({ left: 100, top: 100, width: 200, height: 80 }, { x: 10, y: -5, scale: 1.5 }), { left: 60, top: 75, width: 300, height: 120 });
});
