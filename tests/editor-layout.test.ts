import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WORKSPACE, splitPreviewWidth, workspacePreferences } from '../src/shared/editor-layout';

test('missing or incompatible preferences retain the current layout', () => {
  for (const value of [null, [], 'split', 8, { mode: 'unknown', previewShare: '55', timeline: NaN, previewSide: 'top' }]) assert.deepEqual(workspacePreferences(value), DEFAULT_WORKSPACE);
});
test('saved split preferences restore with bounded dimensions and no foreign fields', () => {
  assert.deepEqual(workspacePreferences({ mode: 'split', previewSide: 'right', previewShare: 99, timeline: -10, project: 'unused' }), { mode: 'split', previewSide: 'right', previewShare: .65, timeline: 120 });
  assert.deepEqual(workspacePreferences({ previewShare: Infinity, timeline: Infinity }), DEFAULT_WORKSPACE);
});
test('split width preserves usable tools when a saved large display layout opens at high DPI', () => {
  for (const width of [740, 900, 1092, 1366, 1920, 2560]) for (const share of [.35, .48, .65]) {
    const preview = splitPreviewWidth(width, share);
    assert.ok(preview >= 260);
    assert.ok(width - preview - 6 >= 340);
  }
});
