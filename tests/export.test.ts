import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { destinationStamp, publishExport } from '../electron/export-destination';
import { progressReader } from '../electron/process';

test('progress survives split chunks and rejects invalid or regressing frames', () => {
  const values: number[][] = [], parse = progressReader(120, (p, frame) => values.push([p, frame]));
  parse('fra'); parse('me=30\r\nout_time_us=1000000\nframe=not-a-number\nfra');
  parse('me=60\nframe=20\nframe=120\nprogress=end\n');
  assert.deepEqual(values, [[25, 30], [50, 60], [99, 120]]);
});

test('exports preserve existing files until an approved, successful commit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vlog-export-'));
  const destination = join(dir, 'same name.mp4'), temporary = join(dir, 'new.partial.mp4');
  try {
    await writeFile(destination, 'old export'); await writeFile(temporary, 'new export');
    const approved = await destinationStamp(destination);
    await assert.rejects(publishExport(temporary, destination), /덮어쓰기/);
    assert.equal(await readFile(destination, 'utf8'), 'old export');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(publishExport(temporary, destination, approved, controller.signal), /취소/);
    assert.equal(await readFile(destination, 'utf8'), 'old export');
    await publishExport(temporary, destination, approved);
    assert.equal(await readFile(destination, 'utf8'), 'new export');
    await assert.rejects(readFile(temporary), /ENOENT/);
    await writeFile(temporary, 'next export');
    await assert.rejects(publishExport(temporary, destination, approved), /변경/);
    assert.equal(await readFile(destination, 'utf8'), 'new export');
    const fresh = join(dir, 'fresh.mp4');
    await publishExport(temporary, fresh);
    assert.equal(await readFile(fresh, 'utf8'), 'next export');
  } finally {
    assert.equal(dirname(dir), tmpdir());
    await rm(dir, { recursive: true, force: true });
  }
});
