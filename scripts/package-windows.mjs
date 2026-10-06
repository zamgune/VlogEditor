import { cp, mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Package on Windows x64.');
const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const name = `VlogTool-${pkg.version}-win-x64`;
const output = join(root, 'release'), destination = join(output, name);
// Refuse to overwrite an existing build, so a published archive stays reproducible.
try { await stat(destination); throw new Error(`Build already exists: ${destination}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(destination, { recursive: true });
await cp(join(root, 'node_modules/electron/dist'), destination, {
  recursive: true, filter: path => !path.endsWith('default_app.asar'),
});
await rename(join(destination, 'electron.exe'), join(destination, 'VlogTool.exe'));
const app = join(destination, 'resources/app');
await mkdir(join(app, 'scripts'), { recursive: true });
await cp(join(root, 'dist'), join(app, 'dist'), { recursive: true, filter: path => !path.endsWith('.map') });
await cp(join(root, 'dist-electron'), join(app, 'dist-electron'), { recursive: true, filter: path => !path.endsWith('.map') });
await writeFile(join(app, 'package.json'), JSON.stringify({
  name: pkg.name, productName: 'VlogTool', version: pkg.version, private: true,
  main: pkg.main, type: pkg.type, license: pkg.license,
}, null, 2) + '\n');
// FFmpeg is obtained from its distributor on first launch, with the pinned SHA256.
await cp(join(root, 'scripts/setup-ffmpeg.ps1'), join(app, 'scripts/setup-ffmpeg.ps1'));
await cp(join(root, 'README.md'), join(destination, 'README.md'));
await cp(join(root, 'LICENSE'), join(destination, 'LICENSE'));
await cp(join(root, 'docs'), join(destination, 'docs'), { recursive: true });
await mkdir(join(destination, 'licenses'), { recursive: true });
await cp(join(root, 'docs/THIRD_PARTY.md'), join(destination, 'licenses/THIRD_PARTY.md'));
for (const dependency of ['react', 'react-dom', 'scheduler', 'zod']) {
  await cp(join(root, 'node_modules', dependency, 'LICENSE'), join(destination, 'licenses', `${dependency}.txt`));
}
const launcher = `@echo off
setlocal
cd /d "%~dp0"
if not exist "resources\\app\\vendor\\ffmpeg\\ffmpeg-9.0.2-essentials_build\\bin\\ffmpeg.exe" goto setup
if not exist "resources\\app\\vendor\\ffmpeg\\ffmpeg-9.0.2-essentials_build\\bin\\ffprobe.exe" goto setup
goto launch
:setup
echo First launch: downloading video tools. Please wait...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0resources\\app\\scripts\\setup-ffmpeg.ps1"
if errorlevel 1 (
  echo Setup failed. Check your internet connection and try again.
  pause
  exit /b 1
)
:launch
set ELECTRON_RUN_AS_NODE=
start "" "%~dp0VlogTool.exe"
`;
await writeFile(join(destination, 'Start-VlogTool.cmd'), launcher.replaceAll('\n', '\r\n'));
const archive = join(output, `${name}.zip`);
const command = 'Compress-Archive -LiteralPath $env:VLOG_PACKAGE_DIR -DestinationPath $env:VLOG_PACKAGE_ZIP -CompressionLevel Optimal -ErrorAction Stop';
const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
  stdio: 'inherit', windowsHide: true, env: { ...process.env, VLOG_PACKAGE_DIR: destination, VLOG_PACKAGE_ZIP: archive },
});
if (result.status !== 0) throw new Error(`ZIP creation failed: ${result.error ?? result.status}`);
const hash = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(join(output, 'SHA256SUMS.txt'), `${hash}  ${name}.zip\n`);
console.log(JSON.stringify({ archive, sha256: hash, bytes: (await stat(archive)).size }, null, 2));
