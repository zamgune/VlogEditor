export type WorkspacePreferences = {
  mode: 'current' | 'split';
  previewSide: 'left' | 'right';
  previewShare: number;
  timeline: number;
};
export const DEFAULT_WORKSPACE: WorkspacePreferences = { mode: 'current', previewSide: 'left', previewShare: .48, timeline: 230 };
export const WORKSPACE_STORAGE_KEY = 'vlog-workspace-v1';
const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function workspacePreferences(value: unknown): WorkspacePreferences {
  const v = value && typeof value === 'object' ? value as Partial<WorkspacePreferences> : {};
  return {
    mode: v.mode === 'split' ? 'split' : 'current',
    previewSide: v.previewSide === 'right' ? 'right' : 'left',
    previewShare: bounded(v.previewShare, .48, .35, .65),
    timeline: bounded(v.timeline, 230, 120, 650),
  };
}
export function splitPreviewWidth(width: number, share: number) {
  return Math.max(260, Math.min(width - 346, width * share));
}
