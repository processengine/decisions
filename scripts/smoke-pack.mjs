import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), 'decisions-pack-'));
try {
  const packOutput = execFileSync('npm', ['pack'], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();
  const tarball = path.join(root, packOutput);
  execFileSync('npm', ['init', '-y'], { cwd: tempDir, stdio: 'ignore' });
  execFileSync('npm', ['install', tarball], { cwd: tempDir, stdio: 'ignore' });
  const installedPkg = path.join(tempDir, 'node_modules', '@processengine', 'decisions');
  execFileSync(process.execPath, [path.join(root, 'scripts', 'smoke-consumer.cjs'), installedPkg], { stdio: 'inherit' });
  const schemaPkg = JSON.parse(readFileSync(path.join(installedPkg, 'src', 'schema', 'decision.schema.json'), 'utf8'));
  if (schemaPkg.type !== 'object') throw new Error('schema check failed');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
