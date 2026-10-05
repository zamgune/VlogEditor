import type { Media, Project } from './project';
import type { Color } from './color';
import type { CanvasSettings, Framing } from './canvas';
import type { CaptionRenderRequest, CaptionBitmap, CaptionLibrary } from './captions';
import type { Narration, RecordingInput } from './narration';
export type TaskProgress = { kind: 'import' | 'export'; percent: number; message: string };
export type OpenResult = { project: Project; path: string | null; missing: string[] };
export interface EditorAPI {
  microphoneAccess(enabled: boolean): Promise<void>;
  recordingActive(active: boolean): Promise<void>;
  saveNarration(input: RecordingInput): Promise<Narration>;
  onRecordingStop(callback: () => void): () => void;
  captionBitmap(request: CaptionRenderRequest): Promise<CaptionBitmap>;
  captionPresets(): Promise<CaptionLibrary>;
  saveCaptionPresets(presets: CaptionLibrary): Promise<void>;
  importMedia(): Promise<{ media: Media[]; errors: string[] }>;
  importDropped(files: File[]): Promise<{ media: Media[]; errors: string[] }>;
  saveProject(project: Project): Promise<string | null>;
  openProject(): Promise<OpenResult | null>;
  autosave(project: Project): Promise<void>;
  recovery(): Promise<OpenResult | null>;
  restoreRecovery(): Promise<OpenResult | null>;
  exportProject(project: Project): Promise<string | null>;
  cancelTask(): Promise<void>;
  frame(mediaId: string, sourceFrame: number, color?: Color, settings?: CanvasSettings, framing?: Framing): Promise<string>;
  status(): Promise<{ ffmpeg: boolean; platform: string; stage: string }>;
  onProgress(callback: (progress: TaskProgress) => void): () => void;
}
declare global { interface Window { editor: EditorAPI } }
