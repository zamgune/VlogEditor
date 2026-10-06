import { app, BrowserWindow, dialog, ipcMain, protocol, net, session } from 'electron';
import { access, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { MediaEngine } from './media';
import { binPath } from './process';
import { atomicSave, readProject, replaceFile, withPortableNarrations } from './storage';
import { NarrationStore } from './narration';
import { ProjectSchema, type Project } from '../src/shared/project';
import { ColorSchema, NEUTRAL_COLOR } from '../src/shared/color';
import { CanvasSettingsSchema, FramingSchema, canvasSettings, DEFAULT_FRAMING } from '../src/shared/canvas';
import type { TaskProgress, OpenResult } from '../src/shared/api';
import { CaptionEngine } from './captions';
import { destinationStamp } from './export-destination';
import { CaptionRenderRequestSchema, CaptionLibrarySchema, emptyCaptionLibrary } from '../src/shared/captions';

app.setName('VlogTool');
if (process.env.VLOGTOOL_TEST_DATA) app.setPath('userData', process.env.VLOGTOOL_TEST_DATA);
protocol.registerSchemesAsPrivileged([{ scheme: 'vlog', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let window: BrowserWindow;
let engine: MediaEngine;
let captions: CaptionEngine;
let narrations: NarrationStore;
let microphoneAllowed = false, recordingActive = false;
let task: AbortController | undefined;
let frameTask: AbortController | undefined;
let savePath: string | null = null;
let saves: Promise<unknown> = Promise.resolve();
let quitting = false;
const root = app.getAppPath();
const userData = app.getPath('userData');
const recoveryPath = join(userData, 'work', 'recovery.vlog.json');
let recoverySource = recoveryPath;
function progress(data: TaskProgress) { if (!window.isDestroyed()) window.webContents.send('task:progress', data); }
async function logged<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await mkdir(join(userData, 'logs'), { recursive: true });
    await writeFile(join(userData, 'logs', 'last-error.log'), `${new Date().toISOString()}\n${message}`, 'utf8');
    throw new Error(message);
  }
}
async function withTask<T>(operation: (signal: AbortSignal) => Promise<T>) {
  if (task) throw new Error('진행 중인 작업을 완료하거나 취소해 주세요.');
  task = new AbortController();
  try { return await logged(() => operation(task!.signal)); } finally { task = undefined; }
}
function handle(name: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(name, (event, ...args: unknown[]) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== 'vlog://editor/index.html') throw new Error('허용되지 않은 요청입니다.');
    return fn(...args);
  });
}
async function importing(paths: string[], signal: AbortSignal) {
  const media = []; const errors: string[] = [];
  for (const [index, path] of paths.entries()) {
    if (signal.aborted) break;
    try { media.push(await engine.import(path, signal, p => progress({ kind: 'import', percent: (index + p / 100) / paths.length * 100, message: `편집용 사본 준비 · ${index + 1} / ${paths.length}` }))); }
    catch (e) { errors.push(`${path}\n${e instanceof Error ? e.message : String(e)}`); }
  }
  return { media, errors };
}
async function openPath(path: string, signal: AbortSignal): Promise<OpenResult> {
  const project = await readProject(path);
  const missing: string[] = [];
  for (const [index, media] of project.media.entries()) {
    if (signal.aborted) throw new Error('프로젝트 열기를 취소했습니다.');
    try { project.media[index] = await engine.import(media.path, signal, p => progress({ kind: 'import', percent: (index + p / 100) / project.media.length * 100, message: `프로젝트 미디어 확인 · ${media.name}` }), media); }
    catch (e) { missing.push(`${media.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  for (const n of project.narrations) {
    try { await narrations.register(n); }
    catch (e) { missing.push(`${n.name}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { project, path: path === recoveryPath || path === `${recoveryPath}.bak` ? null : path, missing };
}
function serializedSave(path: string, project: Project, portable = false) {
  const operation = saves.catch(() => {}).then(() => logged(async () => atomicSave(path, portable ? await withPortableNarrations(path, project) : project)));
  saves = operation; return operation;
}

app.whenReady().then(async () => {
  captions = new CaptionEngine(join(userData, 'cache', 'captions'));
  narrations = new NarrationStore(root, join(userData, 'recordings'));
  engine = new MediaEngine(root, join(userData, 'cache', 'normalized'), captions, narrations);
  protocol.handle('vlog', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'editor' || !['GET', 'HEAD'].includes(request.method)) return new Response('Forbidden', { status: 403 });
    let path: string;
    if (url.pathname.startsWith('/narration/')) {
      const asset = narrations.assets.get(url.pathname.slice('/narration/'.length));
      if (!asset) return new Response('Missing recording', { status: 404 });
      path = asset.path;
    } else if (url.pathname.startsWith('/media/')) {
      const asset = engine.assets.get(url.pathname.slice('/media/'.length));
      if (!asset) return new Response('Missing media', { status: 404 });
      path = asset.proxy;
    } else {
      const dist = resolve(root, 'dist');
      path = resolve(dist, '.' + decodeURIComponent(url.pathname));
      if (!path.startsWith(dist + sep) || !['.html', '.js', '.css', '.svg', '.png', '.ttf'].includes(extname(path))) return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(path).href, { headers: request.headers });
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(
    microphoneAllowed && wc === window?.webContents && wc.getURL() === 'vlog://editor/index.html' && permission === 'media'
    && details.isMainFrame && 'mediaTypes' in details && Array.isArray(details.mediaTypes) && details.mediaTypes.length > 0 && details.mediaTypes.every(type => type === 'audio')));
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin, details) =>
    microphoneAllowed && wc === window?.webContents && wc?.getURL() === 'vlog://editor/index.html' && origin === 'vlog://editor'
    && permission === 'media' && details.mediaType === 'audio');
  // This milestone has no network features: permit only the local app protocol.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1100, minHeight: 760, backgroundColor: '#101318',
    title: '장면 · VlogTool', autoHideMenuBar: true, show: false,
    webPreferences: { preload: join(root, 'dist-electron', 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', e => e.preventDefault());
  window.webContents.on('will-attach-webview', e => e.preventDefault());
  window.on('close', event => { if (recordingActive) { event.preventDefault(); window.webContents.send('narration:stop'); } });
  handle('narration:microphone', (value: unknown) => { microphoneAllowed = z.boolean().parse(value); });
  handle('narration:active', (value: unknown) => { recordingActive = z.boolean().parse(value); });
  handle('narration:save', (value: unknown) => { const operation = logged(() => narrations.save(value)); saves = Promise.all([saves.catch(() => {}), operation]); return operation; });
  const presetPath = join(userData, 'caption-presets.json');
  let presetSaves: Promise<unknown> = Promise.resolve();
  handle('caption:bitmap', (request: unknown) => captions.bitmap(CaptionRenderRequestSchema.parse(request)));
  handle('caption:presets', async () => {
    await presetSaves.catch(() => {});
    try { return CaptionLibrarySchema.parse(JSON.parse(await readFile(presetPath, 'utf8'))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyCaptionLibrary(); throw e; }
  });
  handle('caption:save-presets', (input: unknown) => {
    const presets = CaptionLibrarySchema.parse(input);
    presetSaves = presetSaves.catch(() => {}).then(async () => { await mkdir(userData, { recursive: true }); await writeFile(`${presetPath}.tmp`, JSON.stringify(presets)); await replaceFile(`${presetPath}.tmp`, presetPath); });
    saves = Promise.all([saves, presetSaves]); return presetSaves;
  });
  handle('app:status', async () => {
    let ffmpeg = true;
    try { await access(binPath(root, 'ffmpeg')); await access(binPath(root, 'ffprobe')); } catch { ffmpeg = false; }
    return { ffmpeg, platform: `${process.platform} ${process.arch}`, stage: `${app.getVersion()} · 자막 꾸미기 · 빠른 내보내기` };
  });
  handle('media:import', () => withTask(async signal => {
    const result = await dialog.showOpenDialog(window, { title: '영상 가져오기', properties: ['openFile', 'multiSelections'], filters: [{ name: '영상', extensions: ['mp4', 'mov'] }, { name: '모든 파일', extensions: ['*'] }] });
    return result.canceled ? { media: [], errors: [] } : importing(result.filePaths, signal);
  }));
  handle('media:drop', (paths: unknown) => withTask(signal => importing(z.array(z.string().min(1).max(32768)).max(30).parse(paths), signal)));
  handle('project:save', async (input: unknown) => {
    const project = ProjectSchema.parse(input);
    let destination = savePath;
    if (!destination) {
      const result = await dialog.showSaveDialog(window, { title: '프로젝트 저장', defaultPath: `${project.name}.vlog.json`, filters: [{ name: 'VlogTool 프로젝트', extensions: ['vlog.json'] }] });
      if (result.canceled || !result.filePath) return null;
      if (!result.filePath.endsWith('.vlog.json')) throw new Error('.vlog.json 파일 이름으로 저장해 주세요.');
      destination = result.filePath;
    }
    if (project.media.some(m => [destination, `${destination}.bak`].some(p => resolve(p!).toLowerCase() === resolve(m.path).toLowerCase()))) throw new Error('원본 파일을 덮어쓸 수 없습니다.');
    await serializedSave(destination, project, true); savePath = destination; return savePath;
  });
  handle('project:open', () => withTask(async signal => {
    const result = await dialog.showOpenDialog(window, { title: '프로젝트 열기', properties: ['openFile'], filters: [{ name: 'VlogTool 프로젝트', extensions: ['json'] }] });
    if (result.canceled) return null;
    const opened = await openPath(result.filePaths[0], signal); savePath = opened.path; return opened;
  }));
  handle('project:autosave', (input: unknown) => serializedSave(recoveryPath, ProjectSchema.parse(input)));
  handle('project:recovery', async () => {
    try { recoverySource = recoveryPath; return { project: await readProject(recoverySource), path: null, missing: [] }; }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      try { recoverySource = `${recoveryPath}.bak`; return { project: await readProject(recoverySource), path: null, missing: ['직전 복구 사본을 사용합니다.'] }; }
      catch { throw new Error('자동 저장 파일을 읽지 못했습니다. 기존 프로젝트 파일을 열어 주세요.'); }
    }
  });
  handle('project:restore', () => withTask(async signal => { savePath = null; return openPath(recoverySource, signal); }));
  handle('project:export', (input: unknown) => withTask(async signal => {
    const project = ProjectSchema.parse(input); engine.validate(project);
    // Windows' native save dialog already asks to replace an existing file.
    // The explicit property enables the same confirmation on Linux.
    const result = await dialog.showSaveDialog(window, { title: 'MP4 내보내기', buttonLabel: '내보내기', defaultPath: `${project.name}.mp4`, properties: ['showOverwriteConfirmation'], filters: [{ name: 'MP4 영상', extensions: ['mp4'] }] });
    if (result.canceled || !result.filePath) return null;
    const overwrite = await destinationStamp(result.filePath);
    const messages = { prepare: '출력 준비 중', captions: '자막·꾸미기 준비 중', encode: '영상 만드는 중', verify: '완성 영상 확인 중', save: '파일 저장 중', done: '내보내기 완료' };
    return engine.export(project, result.filePath, signal, (p, status) => progress({ kind: 'export', percent: p, message: messages[status?.stage ?? 'prepare'], exportStatus: status }), { overwrite });
  }));
  handle('task:cancel', () => { task?.abort(); });
  handle('media:frame', (id: unknown, frame: unknown, input: unknown, canvas: unknown, clipFraming: unknown) => {
    const mediaId = z.string().uuid().parse(id);
    const sourceFrame = z.number().int().nonnegative().parse(frame);
    const color = ColorSchema.parse(input ?? NEUTRAL_COLOR);
    const settings = CanvasSettingsSchema.parse(canvas ?? canvasSettings('16:9'));
    const framing = FramingSchema.parse(clipFraming ?? DEFAULT_FRAMING);
    frameTask?.abort(); frameTask = new AbortController();
    return engine.still(mediaId, sourceFrame, color, frameTask.signal, settings, framing);
  });
  await window.loadURL('vlog://editor/index.html');
  window.on('closed', () => { task?.abort(); captions.dispose(); app.quit(); });
  window.show();
});
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); task?.abort(); frameTask?.abort();
  void saves.catch(() => {}).finally(() => { quitting = true; app.quit(); });
});
app.on('window-all-closed', () => app.quit());
