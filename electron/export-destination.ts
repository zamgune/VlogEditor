import { lstat, link, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { replaceFile } from './storage';
import { CancelledError } from './process';

// Bind approval to the file selected in the save dialog. If another program
// changes it while rendering, ask the user to select/confirm the path again.
export async function destinationStamp(path: string): Promise<string | undefined> {
  try {
    const s = await lstat(path);
    if (!s.isFile()) throw new Error('일반 파일 이름으로 내보내 주세요.');
    return `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function publishExport(temporary: string, destination: string, approved?: string, signal?: AbortSignal) {
  const current = await destinationStamp(destination);
  if (current !== approved) throw new Error('내보내는 동안 같은 이름의 파일이 생기거나 변경되었습니다. 파일 이름을 다시 선택하고 덮어쓰기를 확인해 주세요.');
  if (signal?.aborted) throw new CancelledError();
  if (approved !== undefined) {
    // Same-directory atomic replacement keeps the previous export intact until
    // the new video has finished rendering and validation. Never unlink it first.
    await replaceFile(temporary, destination);
  } else {
    // Publish without copying the whole MP4, and without replacing a file that
    // appeared since the check. FAT/exFAT volumes fall back to exclusive copying.
    try { await link(temporary, destination); }
    catch (error) {
      if (!['ENOTSUP', 'ENOSYS', 'EPERM', 'EOPNOTSUPP', 'EXDEV'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await copyFile(temporary, destination, constants.COPYFILE_EXCL);
    }
  }
  // This is the commit point: a cancellation arriving after publication must
  // not remove the completed output (or pretend it restored the replaced file).
}
