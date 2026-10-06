import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ProjectSchema } from '../src/shared/project';
import { binPath, run } from '../electron/process';
import { probe } from '../electron/media';
const root = resolve('.'), id = `trim-playback-${Date.now()}`, out = join(root, 'output/playwright', id), data = join(root, '.vlogtool-test', id);
await mkdir(out, { recursive: true }); await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
const project = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
project.captions = []; project.decorations = []; project.narrations = [];
project.clips = project.clips.map(c => ({ ...c, inFrame: 0, outFrame: 120 }));
await writeFile(join(data, 'work/recovery.vlog.json'), JSON.stringify(project));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: data } });
const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(2, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  await page.evaluate('globalThis.__name = fn => fn');
  await page.evaluate(async () => {
    const v = document.querySelector('video')!;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    const test = (window as any).playbackTest = { seeks: [] as any[], events: [] as any[], blocks: [] as any[], delay: 0, origin: 0, stall: false };
    Object.defineProperty(v, 'currentTime', { get() { return descriptor.get!.call(v); }, set(value: number) {
      test.seeks.push({ at: performance.now() - test.origin, before: descriptor.get!.call(v), to: value, paused: v.paused }); descriptor.set!.call(v, value);
    } });
    for (const name of ['playing', 'waiting', 'seeking', 'seeked', 'pause', 'ended']) v.addEventListener(name, () => test.events.push({ name, at: performance.now() - test.origin, time: v.currentTime }));
    const play = v.play.bind(v); v.play = () => {
      if (test.stall) { test.stall = false; setTimeout(() => { v.pause(); setTimeout(() => void play(), 350); }, 650); }
      return test.delay ? new Promise<void>((resolve, reject) => setTimeout(() => void play().then(resolve, reject), test.delay)) : play();
    };
    const context = new AudioContext({ sampleRate: 48000 }), source = context.createMediaElementSource(v), processor = context.createScriptProcessor(2048, 2, 2);
    source.connect(processor); processor.connect(context.destination);
    processor.onaudioprocess = e => {
      const samples = e.inputBuffer.getChannelData(0); let power = 0, zero = 0;
      for (const s of samples) { power += s * s; if (Math.abs(s) < .00001) zero++; }
      test.blocks.push({ at: performance.now() - test.origin, rms: Math.sqrt(power / samples.length), zero: zero / samples.length });
      // Observe the actual decoded stream without playing test tones on the user's speakers.
    };
    await context.resume();
  });
  const trials: any[] = [];
  for (const trial of [{ name: 'untrimmed', start: 0, delay: 0, stall: false }, { name: 'front-trimmed', start: 37, delay: 0, stall: false }, { name: 'front-trimmed-delayed-start', start: 37, delay: 300, stall: false }, { name: 'front-trimmed-interrupted-playback', start: 37, delay: 0, stall: true }]) {
    await page.getByRole('button', { name: '클립 1 시작 길이 조절' }).click();
    const input = page.getByRole('spinbutton', { name: '시작 프레임', exact: true }); await input.fill(String(trial.start)); await input.press('Enter');
    const ruler = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(ruler.x + 1, ruler.y + 12);
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => !v.seeking && v.readyState >= 2)).toBe(true);
    await page.evaluate(({ delay, stall }) => { const t = (window as any).playbackTest; t.seeks = []; t.events = []; t.blocks = []; t.origin = performance.now(); t.delay = delay; t.stall = stall; }, trial);
    await page.getByRole('button', { name: '재생', exact: true }).click();
    await expect.poll(async () => Number(await page.getByRole('slider', { name: '재생 위치' }).getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(50);
    const observed = await page.evaluate(() => { const t = (window as any).playbackTest; return { seeks: t.seeks, events: t.events, blocks: t.blocks }; });
    expect(observed.seeks).toHaveLength(0);
    expect(observed.blocks.filter((b: any) => b.rms > .02).length).toBeGreaterThan(20);
    if (!trial.stall) expect(observed.blocks.filter((b: any) => b.at > 600 && b.zero > .95)).toHaveLength(0);
    await page.getByRole('button', { name: '일시 정지', exact: true }).click();
    trials.push({ ...trial, ...observed });
  }
  const state = async () => ProjectSchema.parse(JSON.parse(await readFile(join(data, 'work/recovery.vlog.json'), 'utf8')));
  const frame = async () => Number(await page.getByRole('slider', { name: '재생 위치' }).getAttribute('aria-valuenow'));
  async function seek(at: number) { const box = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(box.x + at * 2, box.y + 12); await expect.poll(frame).toBe(at); }
  const reset = () => page.getByRole('button', { name: '원본 길이로', exact: true }).click();
  const undo = () => page.getByRole('button', { name: '실행 취소', exact: true }).click();
  const range = async (index: number) => { const c = (await state()).clips[index]; return [c.inFrame, c.outFrame]; };
  await reset(); await seek(50); await page.keyboard.press('q'); await expect.poll(() => range(0)).toEqual([50, 120]); await expect.poll(frame).toBe(0);
  await undo(); await expect.poll(() => range(0)).toEqual([0, 120]); await seek(50); await page.keyboard.press('w'); await expect.poll(() => range(0)).toEqual([0, 51]);
  await undo(); await expect.poll(() => range(0)).toEqual([0, 120]);
  await seek(150); await page.getByRole('button', { name: '앞부분 자르기 Q', exact: true }).click(); await expect.poll(() => range(1)).toEqual([30, 120]);
  expect(await range(0)).toEqual([0, 120]); await expect.poll(frame).toBe(120); await undo(); await expect.poll(() => range(1)).toEqual([0, 120]);
  await page.getByRole('button', { name: '클립 1 시작 길이 조절' }).click();
  const input = page.getByRole('spinbutton', { name: '시작 프레임', exact: true }); await input.focus(); await input.press('q'); expect(await range(0)).toEqual([0, 120]); await input.blur();
  const handle = page.getByRole('button', { name: '클립 1 시작 길이 조절' }), original = (await handle.boundingBox())!, nextClip = (await page.getByTestId('timeline-clip').nth(1).boundingBox())!;
  await page.mouse.move(original.x + original.width / 2, original.y + original.height / 2); await page.mouse.down();
  await page.mouse.move(original.x + original.width / 2 + 60, original.y + original.height / 2, { steps: 10 });
  await expect.poll(async () => (await handle.boundingBox())!.x - original.x).toBeCloseTo(60, 0);
  expect((await page.getByTestId('timeline-clip').nth(1).boundingBox())!.x).toBeCloseTo(nextClip.x, 0);
  await expect(page.getByTestId('trim-removed')).toBeVisible(); await page.screenshot({ path: join(out, 'front-trim-drag.png') });
  await page.mouse.up(); await expect.poll(() => range(0)).toEqual([30, 120]);
  await expect.poll(async () => (await handle.boundingBox())!.x).toBeCloseTo(original.x, 0);
  expect((await page.getByTestId('timeline-clip').nth(1).boundingBox())!.x).toBeCloseTo(nextClip.x - 60, 0);
  await undo(); await expect.poll(() => range(0)).toEqual([0, 120]);

  // Playback crosses a trimmed clip boundary without a stream of corrective seeks.
  await input.fill('37'); await input.press('Enter'); await seek(0);
  await page.evaluate(() => { const t = (window as any).playbackTest; t.delay = 0; t.seeks = []; t.events = []; t.origin = performance.now(); });
  await page.getByRole('button', { name: '재생', exact: true }).click(); await expect.poll(frame, { timeout: 12000 }).toBe(202);
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  const boundary = await page.evaluate(() => { const t = (window as any).playbackTest; return { seeks: t.seeks, events: t.events }; });
  expect(boundary.seeks.length).toBeLessThanOrEqual(3);
  // Check the actual exported samples as well as the preview stream.
  const exported = join(out, '앞부분 자르기 소리.mp4');
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, exported);
  await page.getByRole('button', { name: '내보내기 ↗' }).click(); await expect(page.locator('footer')).toContainText('MP4 내보내기 완료', { timeout: 60000 });
  const info = await probe(root, exported); expect(Number(info.streams.find(s => s.codec_type === 'video')?.nb_frames)).toBe(203);
  const audioChecks = [];
  for (const [at, frequency] of [[.3, 440], [1.3, 440], [3.3, 880], [5.5, 880]]) {
    const bytes = (await run(binPath(root, 'ffmpeg'), ['-v', 'error', '-ss', String(at), '-i', exported, '-t', '0.4', '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])).stdout;
    let power = 0, real = 0, imag = 0; const count = bytes.length / 4;
    for (let i = 0; i < count; i++) { const value = bytes.readFloatLE(i * 4), phase = 2 * Math.PI * frequency * i / 48000; power += value * value; real += value * Math.cos(phase); imag += value * Math.sin(phase); }
    const rms = Math.sqrt(power / count), tone = Math.hypot(real, imag) / count * Math.SQRT2, ratio = tone / rms;
    expect(rms).toBeGreaterThan(.03); expect(ratio).toBeGreaterThan(.98); audioChecks.push({ at, frequency, rms, toneRatio: ratio });
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL() === 'vlog://editor/index.html')!.setSize(1100, 760));
  await expect(page.getByRole('button', { name: '앞부분 자르기 Q', exact: true })).toBeInViewport(); await expect(page.getByRole('button', { name: '뒷부분 자르기 W', exact: true })).toBeInViewport();
  await page.screenshot({ path: join(out, 'quick-trim-small-window.png') });
  expect(errors).toEqual([]);
  const report = { out, errors, trials, boundary, exported, audioChecks, checks: ['zero corrective seeks during normal/trimmed/delayed/interrupted preview', 'decoded audio remains continuous after start', 'Q/W and later-clip toolbar trimming', 'typing isolation', 'front handle follows pointer and shows removed region', 'ripple closes on release and one-step undo', 'trimmed media transition and automatic stop', '203-frame export and 440/880Hz tone purity', 'small-window controls'] }; await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(join(root, 'artifacts/latest-trim-playback.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, errors, trials: trials.map(t => ({ name: t.name, seeks: t.seeks, events: t.events, audioBlocks: t.blocks.length, silentBlocksAfterStart: t.blocks.filter((b: any) => b.at > 600 && b.zero > .95).length })) }));
} catch (e) { await page.screenshot({ path: join(out, 'failure.png') }); throw e; } finally { await app.close(); }
