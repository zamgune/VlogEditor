import { open, readFile, rename, copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, basename, join, isAbsolute, resolve } from 'node:path';
import { constants } from 'node:fs';
import { audioHash } from './narration';
import { randomUUID } from 'node:crypto';
import { ProjectSchema, type Project } from '../src/shared/project';
import { setTimeout as delay } from 'node:timers/promises';

export async function replaceFile(temporary: string, destination: string) {
  // Windows indexers/virus scanners can briefly lock an otherwise valid destination.
  // Keep the old file intact and retry the atomic replacement instead of deleting it.
  for (let attempt = 0; ; attempt++) {
    try { await rename(temporary, destination); return; }
    catch (error) {
      if (attempt >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      await delay(20 * 2 ** attempt);
    }
  }
}

export async function readProject(path: string): Promise<Project> {
  const file = await open(path, 'r');
  try {
    if ((await file.stat()).size > 20 * 1024 * 1024) throw new Error('프로젝트 파일이 너무 큽니다.');
    const project = ProjectSchema.parse(JSON.parse(await file.readFile('utf8')));
    return { ...project, narrations: project.narrations.map(n => ({ ...n, path: isAbsolute(n.path) ? n.path : resolve(dirname(path), n.path) })) };
  } finally { await file.close(); }
}
export async function withPortableNarrations(path: string, project: Project): Promise<Project> {
  if (!project.narrations.length) return project;
  const folder = `${basename(path)}.assets`, directory = join(dirname(path), folder);
  await mkdir(directory, { recursive: true });
  const narrations = [];
  for (const n of project.narrations) {
    if (await audioHash(n.path) !== n.fingerprint) throw new Error(`녹음 파일이 변경되었습니다: ${n.name}`);
    const name = `${n.id}-${n.fingerprint.slice(0, 16)}.wav`, destination = join(directory, name);
    try { await copyFile(n.path, destination, constants.COPYFILE_EXCL); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || await audioHash(destination) !== n.fingerprint) throw e; }
    narrations.push({ ...n, path: join(folder, name) });
  }
  return { ...project, narrations };
}
export async function atomicSave(path: string, project: Project) {
  const data = JSON.stringify(ProjectSchema.parse(project), null, 2);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx');
    try { await file.writeFile(data, 'utf8'); await file.sync(); } finally { await file.close(); }
    // The previous successful save stays available even if replacement fails.
    try { await readFile(path); await copyFile(path, `${path}.bak`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await replaceFile(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
