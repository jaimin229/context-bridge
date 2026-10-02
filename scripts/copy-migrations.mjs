import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, '..');
const source = path.join(rootDir, 'packages', 'core', 'migrations');
const target = path.join(rootDir, 'apps', 'desktop', 'dist-electron', 'migrations');

if (!existsSync(source)) {
  console.error(`[copy-migrations] source missing: ${source}`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log(`[copy-migrations] copied ${source} -> ${target}`);
