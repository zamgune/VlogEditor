import { _electron as electron, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, readdir, stat, cp, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';
import { readProject } from '../electron/storage';

const root = resolve('.'), id = `narration-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(data, { recursive: true });
const ffmpeg = binPath(root, 'ffmpeg'), fakeMic = join(out, 'test-microphone.wav');
await run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=997:sample_rate=48000:duration=12', '-ac', '1', '-c:a', 'pcm_s16le', fakeMic]);
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const launch = () => electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root, '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeMic}`], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: data } });
let app = await launch(), page = await app.firstWindow(); const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
async function seek(frame: number) { const b = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(b.x + frame * 2, b.y + 12); await expect(page.getByRole('slider', { name: '재생 위치' })).toHaveAttribute('aria-valuenow', String(frame)); }
async function setNumber(name: string, value: string) { const input = page.getByRole('spinbutton', { name, exact: true }); await input.fill(value); await input.press('Enter'); }
async function save(path: string) {
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
  await page.getByRole('button', { name: '저장 Ctrl S' }).click();
  await expect.poll(async () => { try { return (await stat(path)).size; } catch { return 0; } }).toBeGreaterThan(100);
  return readProject(path);
}
async function exported(name: string) {
  const path = join(out, `${name}.mp4`);
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path);
  await page.getByRole('button', { name: '내보내기 ↗' }).click(); await expect(page.locator('footer')).toContainText(`MP4 내보내기 완료 · ${path}`, { timeout: 90000 }); return path;
}
async function amplitude(path: string, at: number, frequency: number) {
  const bytes = (await run(ffmpeg, ['-v', 'error', '-ss', String(at), '-i', path, '-t', '0.4', '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])).stdout;
  let real = 0, imaginary = 0; const count = bytes.length / 4;
  for (let i = 0; i < count; i++) { const v = bytes.readFloatLE(i * 4), angle = 2 * Math.PI * frequency * i / 48000; real += v * Math.cos(angle); imaginary += v * Math.sin(angle); }
  return 2 * Math.hypot(real, imaginary) / count;
}
try {
  await expect(page.getByRole('button', { name: '＋ 영상 가져오기' })).toBeEnabled();
  const blocked = await page.evaluate(async () => { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); return false; } catch { return true; } }); expect(blocked).toBe(true);
  await page.getByRole('combobox', { name: '프로젝트 화면 비율' }).selectOption('16:9');
  await app.evaluate(({ dialog }, filePaths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths }); }, fixture.sourceFiles.slice(0, 2));
  await page.getByRole('button', { name: '＋ 영상 가져오기' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(2, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: '음성 녹음', exact: true }).click();
  // Observe fake tracks only; no hardware microphone is accessed by this verification.
  await page.evaluate(() => { const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); (window as any).originalGUM = original; navigator.mediaDevices.getUserMedia = async c => { const s = await original(c?.audio ? { ...c, audio: { ...(typeof c.audio === 'object' ? c.audio : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false } } : c); (window as any).testMic = s; return s; }; });
  await page.getByRole('button', { name: '마이크 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: '마이크 끄기', exact: true })).toBeVisible({ timeout: 15000 });
  await expect.poll(() => page.getByRole('meter', { name: '마이크 입력 크기' }).getAttribute('value')).not.toBe('0');
  const cameraBlocked = await page.evaluate(async () => { try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); return false; } catch { return true; } }); expect(cameraBlocked).toBe(true);
  await seek(90); await page.getByRole('button', { name: '● 녹음 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '■ 녹음 정지', exact: true })).toBeEnabled({ timeout: 15000 });
  await expect(page.getByRole('button', { name: '내보내기 ↗' })).toBeDisabled();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: '재생 위치' }).getAttribute('aria-valuenow'))).toBeGreaterThan(125);
  await page.screenshot({ path: join(out, '01-recording-over-cut.png') });
  await expect(page.getByTestId('narration-item')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByRole('button', { name: '● 녹음 시작', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).testMic.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  await expect(page.getByTestId('narration-block')).toHaveCount(1);
  const saved = join(out, '목소리 프로젝트.vlog.json'), project = await save(saved);
  expect(project.version).toBe(7); expect(project.narrations).toHaveLength(1); expect(project.narrations[0].startFrame).toBe(90); expect(project.narrations[0].durationFrames).toBe(150);
  expect(project.narrations[0].path).toContain('.vlog.json.assets');
  const originalExport = await exported('녹음 포함');
  const levels = { before: await amplitude(originalExport, 2, 997), during: await amplitude(originalExport, 3.5, 997), afterCut: await amplitude(originalExport, 5, 997), original: await amplitude(originalExport, 1, 440) };
  expect(levels.before).toBeLessThan(.002); expect(levels.during).toBeGreaterThan(.02); expect(levels.afterCut).toBeGreaterThan(.02); expect(levels.original).toBeGreaterThan(.02);
  const info = await probe(root, originalExport); expect(Number(info.streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(240); expect(Number(info.streams.find(s => s.codec_type === 'audio')?.duration)).toBeCloseTo(8, 1);
  await page.getByRole('button', { name: '음소거', exact: true }).click();
  const muteExport = await exported('녹음 음소거'); expect(await amplitude(muteExport, 5, 997)).toBeLessThan(.002);
  await page.getByRole('button', { name: '음소거 해제', exact: true }).click();
  await setNumber('음성 1 위치 (초)', '1.5'); await setNumber('음성 1 음량', '50');
  await page.getByText('음성 앞뒤 자르기', { exact: true }).click();
  await setNumber('음성 1 음성 시작 (초)', '0.1'); await setNumber('음성 1 음성 종료 (초)', '1.1');
  const trimmedExport = await exported('녹음 위치 길이 음량');
  const trimmedLevels = { before: await amplitude(trimmedExport, .8, 997), during: await amplitude(trimmedExport, 1.7, 997), after: await amplitude(trimmedExport, 3, 997) };
  expect(trimmedLevels.before).toBeLessThan(.002); expect(trimmedLevels.during).toBeGreaterThan(.01); expect(trimmedLevels.during).toBeLessThan(levels.during * .7); expect(trimmedLevels.after).toBeLessThan(.002);
  await seek(45); await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect.poll(() => page.getByTestId('narration-audio').evaluate((el: HTMLAudioElement) => !el.paused && el.volume === .5)).toBe(true);
  await page.getByRole('button', { name: '일시 정지', exact: true }).click(); await expect.poll(() => page.getByTestId('narration-audio').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await page.getByRole('button', { name: '녹음 삭제', exact: true }).click(); await expect(page.getByTestId('narration-item')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click(); await expect(page.getByTestId('narration-item')).toHaveCount(1);
  const countBefore = (await readdir(join(data, 'recordings'))).length;
  await seek(0); await page.getByRole('button', { name: '● 녹음 시작', exact: true }).click(); await expect(page.getByRole('button', { name: '■ 녹음 정지', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '● 녹음 시작', exact: true })).toBeEnabled();
  await expect(page.getByTestId('narration-item')).toHaveCount(1); expect((await readdir(join(data, 'recordings'))).length).toBe(countBefore);
  // Denied and disconnected devices return to usable controls without adding a take.
  for (const name of ['NotAllowedError', 'NotFoundError']) {
    await page.evaluate(name => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('test', name); }; }, name);
    await page.getByRole('button', { name: '● 녹음 시작', exact: true }).click();
    await expect(page.locator('.narration-error[role=alert]')).toContainText(name === 'NotAllowedError' ? '접근이 차단' : '찾을 수 없습니다');
    await expect(page.getByRole('button', { name: '● 녹음 시작', exact: true })).toBeEnabled();
  }
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = (window as any).originalGUM; });
  await save(saved); await app.close();
  const moved = join(out, '이동한 프로젝트'); await mkdir(moved); await cp(saved, join(moved, '목소리 프로젝트.vlog.json')); await cp(`${saved}.assets`, join(moved, '목소리 프로젝트.vlog.json.assets'), { recursive: true });
  app = await launch(); page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('button', { name: '새 작업 시작', exact: true })).toBeVisible(); await page.getByRole('button', { name: '새 작업 시작', exact: true }).click();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, join(moved, '목소리 프로젝트.vlog.json'));
  await page.getByRole('button', { name: '열기', exact: true }).click(); await expect(page.locator('footer')).toContainText('프로젝트 열기 완료', { timeout: 60000 });
  await page.getByRole('button', { name: '음성 녹음', exact: true }).click(); await expect(page.getByTestId('narration-item')).toHaveCount(1);
  await expect(page.getByRole('spinbutton', { name: '음성 1 위치 (초)', exact: true })).toHaveValue('1.500');
  await expect(page.getByRole('spinbutton', { name: '음성 1 음량', exact: true })).toHaveValue('50');
  // A real storage error must retain the captured bytes for retry. All moved paths
  // are inside this verification's isolated user-data directory.
  const recordingsDir = join(data, 'recordings'), backupDir = join(data, 'recordings-test-backup');
  expect(recordingsDir.startsWith(data + '\\')).toBe(true); expect(backupDir.startsWith(data + '\\')).toBe(true);
  await rename(recordingsDir, backupDir); await writeFile(recordingsDir, 'temporary storage failure');
  try {
    await seek(0); await page.getByRole('button', { name: '● 녹음 시작', exact: true }).click();
    await expect(page.getByRole('button', { name: '■ 녹음 정지', exact: true })).toBeEnabled();
    await expect.poll(async () => Number(await page.getByRole('slider', { name: '재생 위치' }).getAttribute('aria-valuenow'))).toBeGreaterThan(18);
    await page.getByRole('button', { name: '■ 녹음 정지', exact: true }).click();
    await expect(page.getByRole('button', { name: '저장 다시 시도', exact: true })).toBeEnabled();
    await expect(page.getByTestId('narration-item')).toHaveCount(1);
  } finally { await rm(recordingsDir); await rename(backupDir, recordingsDir); }
  await page.getByRole('button', { name: '저장 다시 시도', exact: true }).click();
  await expect(page.getByTestId('narration-item')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '● 녹음 시작', exact: true })).toBeEnabled();
  // Simulate the track-ended notification delivered by unplugging a device.
  await page.evaluate(() => { const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async c => { const s = await original(c); (window as any).testMic = s; return s; }; });
  await seek(0); await page.getByRole('button', { name: '● 녹음 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '■ 녹음 정지', exact: true })).toBeEnabled();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: '재생 위치' }).getAttribute('aria-valuenow'))).toBeGreaterThan(12);
  await page.evaluate(() => { const track = (window as any).testMic.getAudioTracks()[0] as MediaStreamTrack; track.stop(); track.dispatchEvent(new Event('ended')); });
  await expect(page.getByTestId('narration-item')).toHaveCount(3); await expect(page.locator('.narration-error[role=alert]')).toContainText('연결이 끊겼습니다');
  await seek(0); await page.getByRole('button', { name: '● 녹음 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '■ 녹음 정지', exact: true })).toBeEnabled();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: '재생 위치' }).getAttribute('aria-valuenow'))).toBeGreaterThan(12);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.isVisible())!.close());
  await expect(page.getByTestId('narration-item')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '● 녹음 시작', exact: true })).toBeEnabled();
  await expect(page.locator('.narration-error[role=alert]')).toContainText('창을 다시 닫아');
  await seek(0); await page.getByRole('button', { name: '● 녹음 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '■ 녹음 정지', exact: true })).toBeEnabled();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: '재생 위치' }).getAttribute('aria-valuenow'))).toBeGreaterThan(12);
  await page.locator('video').evaluate(video => video.dispatchEvent(new Event('error')));
  await expect(page.getByTestId('narration-item')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '● 녹음 시작', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '안내 닫기', exact: true }).click();
  await page.screenshot({ path: join(out, '02-saved-recording.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.isVisible())!.setSize(1100, 760));
  await page.getByRole('button', { name: '● 녹음 시작', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: join(out, '03-small-window.png') });
  expect(errors).toEqual([]);
  const report = { out, saved, originalExport, muteExport, trimmedExport, levels, trimmedLevels, errors,
    checks: ['audio permission gated by user action, camera denied', 'fake microphone and level meter', 'record from selected position across video cut', 'automatic stop at video end', 'microphone released', 'WAV and portable assets', 'original + recorded audio in MP4', 'mute, volume, position and audio trim', 'preview playback and pause', 'delete/undo and recording cancel', 'permission denial and missing device', 'restart and relocated project', 'real disk failure and retry without losing capture', 'track disconnect saves partial recording', 'window close saves recording and keeps editor open', 'video error stops and saves partial recording', 'small window'], limitations: ['synthetic microphone; physical Windows microphone and hardware latency require device check'] };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(join(root, 'artifacts/latest-narration.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (e) { await page.screenshot({ path: join(out, 'failure.png') }); console.error(await page.locator('body').innerText()); throw e; } finally { await app.close(); }
