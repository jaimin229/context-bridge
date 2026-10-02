import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = path.join(ROOT, 'tests', 'repo-scan.test.ts');

const SCAN_DIRS = [
  path.join(ROOT, 'apps', 'desktop', 'src'),
  path.join(ROOT, 'apps', 'desktop', 'electron'),
  path.join(ROOT, 'packages', 'core', 'src'),
  path.join(ROOT, 'packages', 'core', 'tests'),
  path.join(ROOT, 'scripts'),
  path.join(ROOT, 'tests'),
];

const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: 'eval call', pattern: /(^|[^.\w])eval\s*\(/ },
  { label: 'new Function', pattern: /new\s+Function\s*\(/ },
  { label: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ },
  { label: 'shell exec', pattern: /(^|[^.\w])(exec|execSync)\s*\(/ },
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'release', 'coverage']);

function collectSourceFiles(dir: string, out: string[]): void {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    return;
  }
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) {
        collectSourceFiles(full, out);
      }
    } else if (/\.(ts|tsx|mjs|cjs|js)$/.test(entry) && full !== SELF) {
      out.push(full);
    }
  }
}

describe('repository security scan', () => {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    collectSourceFiles(dir, files);
  }

  it('scans application sources (not this test file)', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files).not.toContain(SELF);
  });

  it('contains no eval, new Function, dangerouslySetInnerHTML, or shell exec in app code', () => {
    const findings: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      for (const forbidden of FORBIDDEN) {
        for (const line of lines) {
          if (forbidden.pattern.test(line)) {
            findings.push(`${path.relative(ROOT, file)}: ${forbidden.label}`);
          }
        }
      }
    }
    expect(findings).toEqual([]);
  });

  it('keeps Electron security flags strict in main.ts', () => {
    const mainSource = readFileSync(
      path.join(ROOT, 'apps', 'desktop', 'electron', 'main.ts'),
      'utf8',
    );
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');
    expect(mainSource).toContain('sandbox: true');
    expect(mainSource).not.toMatch(/nodeIntegration:\s*true/);
    expect(mainSource).not.toMatch(/contextIsolation:\s*false/);
    expect(mainSource).not.toMatch(/sandbox:\s*false/);
    expect(mainSource).not.toMatch(/webSecurity:\s*false/);
  });
});
