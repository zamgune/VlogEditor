import { spawn } from 'node:child_process';
import { join } from 'node:path';

export const binPath = (root: string, name: 'ffmpeg' | 'ffprobe') => join(root, 'vendor', 'ffmpeg', 'ffmpeg-9.0.2-essentials_build', 'bin', `${name}.exe`);
export class CancelledError extends Error { constructor() { super('작업을 취소했습니다.'); } }
export async function run(executable: string, args: string[], options: { signal?: AbortSignal; onOutput?: (text: string) => void; maxOutput?: number } = {}) {
  if (options.signal?.aborted) throw new CancelledError();
  return await new Promise<{ stdout: Buffer; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = Buffer.alloc(0), stderr = '', overflow = false;
    const abort = () => child.kill();
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (buffer: Buffer) => {
      options.onOutput?.(buffer.toString());
      if (stdout.length + buffer.length > (options.maxOutput ?? 16 * 1024 * 1024)) { overflow = true; child.kill(); }
      else stdout = Buffer.concat([stdout, buffer]);
    });
    child.stderr.on('data', (b: Buffer) => { stderr = (stderr + b.toString()).slice(-24000); });
    child.once('error', reject);
    child.once('close', code => {
      options.signal?.removeEventListener('abort', abort);
      if (options.signal?.aborted) reject(new CancelledError());
      else if (overflow) reject(new Error('처리 결과가 허용 크기를 초과했습니다.'));
      else if (code !== 0) reject(new Error(`미디어 처리 실패 (${code})\n${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}
export function progressReader(totalFrames: number, callback: (percent: number) => void) {
  let pending = '';
  return (chunk: string) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/); pending = lines.pop() ?? '';
    for (const line of lines) if (line.startsWith('frame=')) callback(Math.min(99, Math.max(0, Number(line.slice(6)) / totalFrames * 100)));
  };
}
