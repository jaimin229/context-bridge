import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, '..');
const unpackedDir = path.join(rootDir, 'apps', 'desktop', 'release', 'win-unpacked');
const evidenceDir = path.join(rootDir, 'evidence', 'S0');
const outPath = path.join(evidenceDir, 'packaged-smoke.json');

function findExecutable() {
  const preferred = path.join(unpackedDir, 'ContextBridge.exe');
  if (existsSync(preferred)) return preferred;
  if (!existsSync(unpackedDir)) return null;
  const exe = readdirSync(unpackedDir).find((f) => f.toLowerCase().endsWith('.exe'));
  return exe ? path.join(unpackedDir, exe) : null;
}

const exePath = findExecutable();
if (!exePath) {
  console.error(`[smoke] packaged executable not found in ${unpackedDir}`);
  console.error('[smoke] run "npm run package:dir" first.');
  process.exit(1);
}

mkdirSync(evidenceDir, { recursive: true });
rmSync(outPath, { force: true });

console.log(`[smoke] launching packaged app: ${exePath}`);
const child = spawn(exePath, ['--smoke-test', `--smoke-out=${outPath}`], {
  stdio: 'inherit',
  cwd: rootDir,
});

child.on('error', (err) => {
  console.error(`[smoke] failed to launch: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  if (!existsSync(outPath)) {
    console.error('[smoke] packaged app produced no smoke output file');
    process.exit(1);
  }
  const result = JSON.parse(readFileSync(outPath, 'utf8'));
  console.log('[smoke] result:');
  console.log(JSON.stringify(result, null, 2));
  if (
    code === 0 &&
    result.ok === true &&
    result.probe?.fts5Available === true &&
    result.probe?.fts5QueryWorked === true
  ) {
    console.log('[smoke] PASS: SQLite + FTS5 work inside the packaged app.');
    process.exit(0);
  }
  console.error(`[smoke] FAIL: exit code ${code}`);
  process.exit(1);
});
