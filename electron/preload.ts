import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { EditorAPI, TaskProgress } from '../src/shared/api';
const api: EditorAPI = {
  microphoneAccess: enabled => ipcRenderer.invoke('narration:microphone', enabled),
  recordingActive: active => ipcRenderer.invoke('narration:active', active),
  saveNarration: input => ipcRenderer.invoke('narration:save', input),
  onRecordingStop: callback => { const listener = () => callback(); ipcRenderer.on('narration:stop', listener); return () => ipcRenderer.removeListener('narration:stop', listener); },
  captionBitmap: request => ipcRenderer.invoke('caption:bitmap', request),
  captionPresets: () => ipcRenderer.invoke('caption:presets'),
  saveCaptionPresets: presets => ipcRenderer.invoke('caption:save-presets', presets),
  importMedia: () => ipcRenderer.invoke('media:import'),
  importDropped: files => ipcRenderer.invoke('media:drop', files.map(file => webUtils.getPathForFile(file))),
  saveProject: project => ipcRenderer.invoke('project:save', project),
  openProject: () => ipcRenderer.invoke('project:open'),
  autosave: project => ipcRenderer.invoke('project:autosave', project),
  recovery: () => ipcRenderer.invoke('project:recovery'),
  restoreRecovery: () => ipcRenderer.invoke('project:restore'),
  exportProject: project => ipcRenderer.invoke('project:export', project),
  cancelTask: () => ipcRenderer.invoke('task:cancel'),
  frame: (mediaId, sourceFrame, color, settings, framing) => ipcRenderer.invoke('media:frame', mediaId, sourceFrame, color, settings, framing),
  status: () => ipcRenderer.invoke('app:status'),
  onProgress: callback => {
    const listener = (_: unknown, data: TaskProgress) => callback(data);
    ipcRenderer.on('task:progress', listener);
    return () => ipcRenderer.removeListener('task:progress', listener);
  }
};
contextBridge.exposeInMainWorld('editor', api);
