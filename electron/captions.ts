import { BrowserWindow } from 'electron';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project } from '../src/shared/project';
import { captionSpans, captionSceneBoundaries, captionTransform, effectiveStyle, type CaptionRenderRequest, type CaptionBitmap } from '../src/shared/captions';
import { CancelledError } from './process';

export class CaptionEngine {
  private window?: BrowserWindow;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private cache: string) {}
  private call<T>(method: 'bitmap' | 'scene', input: unknown): Promise<T> {
    const result = this.queue.catch(() => {}).then(async () => {
      if (!this.window || this.window.isDestroyed()) {
        this.window = new BrowserWindow({ show: false, width: 64, height: 64, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
        this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        this.window.webContents.on('will-navigate', e => e.preventDefault());
        await this.window.loadURL('vlog://editor/index.html#caption-renderer');
      }
      return this.window.webContents.executeJavaScript(`window.captionRenderer.${method}(${JSON.stringify(input)})`) as Promise<T>;
    });
    this.queue = result; return result;
  }
  bitmap(request: CaptionRenderRequest) { return this.call<CaptionBitmap>('bitmap', request); }
  dispose() { this.window?.destroy(); }
  async overlay(project: Project, signal?: AbortSignal, progress: (n: number) => void = () => {}) {
    const spans = captionSpans(project).filter(s => s.caption.text.trim());
    if (!spans.length) return undefined;
    const dir = join(this.cache, randomUUID()); await mkdir(dir, { recursive: true });
    const boundaries = captionSceneBoundaries(project);
    const lines = ['ffconcat version 1.0'];
    const scenes = new Map<string, string>(); let last = '', imageIndex = 0;
    try {
      for (let i = 0; i < boundaries.length - 1; i++) {
        if (signal?.aborted) throw new CancelledError();
        const captions = spans.filter(s => s.start <= boundaries[i] && s.end > boundaries[i]).sort((a, b) => a.caption.zOrder - b.caption.zOrder).map(s => {
          const style = effectiveStyle(project, s.caption);
          return { text: s.caption.text, style, width: project.settings.width, height: project.settings.height, transform: captionTransform(style.motion, s.start, s.end, boundaries[i], Math.min(project.settings.width, project.settings.height)) };
        });
        const key = JSON.stringify(captions); let name = scenes.get(key);
        if (!name) {
          name = `${imageIndex++}.png`;
          const url = await this.call<string>('scene', { ...project.settings, margins: project.captionSettings.margins, captions });
          await writeFile(join(dir, name), Buffer.from(url.split(',')[1], 'base64')); scenes.set(key, name);
          if (scenes.size > 256) scenes.delete(scenes.keys().next().value!);
        }
        lines.push(`file '${name}'`, 'option framerate 30', `duration ${((boundaries[i + 1] - boundaries[i]) / 30).toFixed(9)}`); last = name;
        progress((i + 1) / (boundaries.length - 1) * 100);
      }
      lines.push(`file '${last}'`, 'option framerate 30');
      const path = join(dir, 'captions.ffconcat'); await writeFile(path, lines.join('\n') + '\n');
      return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
    } catch (e) { await rm(dir, { recursive: true, force: true }); throw e; }
  }
}
