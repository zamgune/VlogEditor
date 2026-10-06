import { _electron as electron, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { ProjectSchema } from '../src/shared/project';
const root = resolve('.'), out = join(root, 'output/playwright', `trim-start-sync-${Date.now()}`), data = join(out, 'test-profile');
await mkdir(join(data, 'work'), { recursive: true });
const fixture = JSON.parse(await readFile(join(root, 'artifacts/latest-media.json'), 'utf8'));
const p = ProjectSchema.parse(JSON.parse(await readFile(fixture.projectPath, 'utf8')));
p.captions = []; p.decorations = []; p.narrations = [];
p.clips = p.clips.map((c, i) => ({ ...c, inFrame: i === 0 ? 37 : 65, outFrame: 120 }));
p.clips.push({ ...p.clips[1], id: crypto.randomUUID(), inFrame: 23, outFrame: 100 });
await writeFile(join(data, 'work/recovery.vlog.json'), JSON.stringify(p));
const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && k !== 'ELECTRON_RUN_AS_NODE'));
const app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [root], cwd: root, env: { ...env, VLOGTOOL_TEST_DATA: data } });
const page = await app.firstWindow(), errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.evaluate('globalThis.__name = fn => fn');
  await page.evaluate(() => {
    const test = (window as any).syncTest = { samples: [] as any[], events: [] as any[], seeks: [] as any[], origin: performance.now(), resetOnPlay: false };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...descriptor, get() { return descriptor.get!.call(this); }, set(value) {
      if (this.tagName === 'VIDEO') test.seeks.push({ at: performance.now() - test.origin, from: descriptor.get!.call(this), to: value, state: this.readyState });
      descriptor.set!.call(this, value);
    } });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      // Emulate a media decoder resetting its source position when playback starts.
      if (this.tagName === 'VIDEO' && test.resetOnPlay && this.readyState >= 2 && !this.seeking && this.currentTime > .5) {
        test.resetOnPlay = false; descriptor.set!.call(this, 0);
      }
      return play.call(this);
    };
    for (const name of ['loadstart', 'loadedmetadata', 'loadeddata', 'playing', 'waiting', 'seeking', 'seeked', 'ended', 'pause']) document.addEventListener(name, e => {
      if (e.target instanceof HTMLVideoElement) test.events.push({ name, at: performance.now() - test.origin, source: e.target.currentTime, state: e.target.readyState, media: e.target.currentSrc });
    }, true);
    const tick = () => { const v = document.querySelector('video'), slider = document.querySelector('[aria-label="재생 위치"]');
      if (v && slider) test.samples.push({ at: performance.now() - test.origin, source: v.currentTime, frame: Number(slider.getAttribute('aria-valuenow')), playing: !v.paused, seeking: v.seeking, state: v.readyState, media: v.currentSrc });
      requestAnimationFrame(tick);
    }; tick();
  });
  await page.getByRole('button', { name: '작업 복구' }).click(); await expect(page.getByTestId('timeline-clip')).toHaveCount(3, { timeout: 60000 }); await expect(page.locator('.task-overlay')).toHaveCount(0);
  const rounds: any[] = [];
  for (let round = 0; round < 3; round++) {
    const ruler = (await page.locator('.ruler').boundingBox())!; await page.mouse.click(ruler.x, ruler.y + 12);
    await page.evaluate(round => { const t = (window as any).syncTest; t.events = []; t.samples = []; t.seeks = []; t.origin = performance.now(); t.resetOnPlay = round === 1; }, round);
    await page.getByRole('button', { name: '재생', exact: true }).click();
    await expect.poll(async () => Number(await page.getByRole('slider', { name: '재생 위치' }).getAttribute('aria-valuenow')), { timeout: 16000 }).toBe(214);
    await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
    rounds.push(await page.evaluate(() => { const t = (window as any).syncTest; return { events: t.events, samples: t.samples, seeks: t.seeks }; }));
  }
  const report = { out, errors, rounds };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  for (const round of rounds) for (const sample of round.samples) {
    if (!sample.playing || sample.seeking || sample.state < 2) continue;
    const index = sample.frame < 83 ? 0 : sample.frame < 138 ? 1 : 2, clip = p.clips[index], start = [0, 83, 138][index];
    if (sample.media !== `vlog://editor/media/${clip.mediaId}`) continue;
    expect(sample.source * 30, 'must not play discarded frames while the slider stays at the clip start').toBeGreaterThanOrEqual(clip.inFrame - 1);
    expect(Math.abs(sample.frame - (start + Math.floor(sample.source * 30 + .0001) - clip.inFrame)), 'picture and slider stay within three frames').toBeLessThanOrEqual(3);
  }
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ out, errors, rounds: rounds.map(r => ({ sampleCount: r.samples.length, seeks: r.seeks.length, starts: r.events.filter((e: any) => e.name === 'playing') })) }));
} catch (e) { await page.screenshot({ path: join(out, 'failure.png') }); await writeFile(join(out, 'failure-trace.json'), JSON.stringify(await page.evaluate(() => (window as any).syncTest), null, 2)); console.log(JSON.stringify({ out })); throw e; } finally { await app.close(); }
