import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, '..');
const desktopDir = path.join(rootDir, 'apps', 'desktop');
const DEV_SERVER = 'http://localhost:5173';

const tscBin = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = require('electron');

function spawnAndWait(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(command)} exited with code ${code}`));
      }
    });
  });
}

async function waitForServer(url, attempts = 150) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

console.log('[dev] building main process + preload (tsc)…');
await spawnAndWait(process.execPath, [tscBin, '-p', path.join(desktopDir, 'tsconfig.electron.json')], {
  cwd: rootDir,
});

console.log(`[dev] starting Vite dev server on ${DEV_SERVER}…`);
const vite = spawn(process.execPath, [viteBin, '--port', '5173', '--strictPort'], {
  stdio: 'inherit',
  cwd: desktopDir,
  env: process.env,
});

const serverUp = await waitForServer(DEV_SERVER);
if (!serverUp) {
  console.error('[dev] Vite dev server did not start');
  vite.kill();
  process.exit(1);
}

console.log('[dev] launching Electron…');
const electron = spawn(electronBin, [desktopDir], {
  stdio: 'inherit',
  cwd: rootDir,
  env: { ...process.env, CONTEXTBRIDGE_DEV_SERVER: DEV_SERVER },
});

function shutdown(code) {
  if (!vite.killed) vite.kill();
  if (!electron.killed) electron.kill();
  process.exit(code);
}

electron.on('exit', (code) => shutdown(code ?? 0));
vite.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[dev] Vite exited with code ${code}`);
    shutdown(code);
  }
});
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
