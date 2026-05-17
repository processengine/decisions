import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workdir = mkdtempSync(join(tmpdir(), 'decisions-smoke-'));
const tarball = execFileSync('npm', ['pack'], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop();
writeFileSync(join(workdir, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', join(root, tarball)], { cwd: workdir, stdio: 'inherit' });

const script = `
const { validateDecisions, prepareDecisions, executeDecisions, DecisionsCompileError, DecisionsRuntimeError } = require('@processengine/decisions');

const source = {
  decisionSetId: 'decisions.smoke',
  version: '2.0.0',
  title: 'Smoke test',
  description: 'Smoke test decision set',
  cases: [{ id: 'r1', title: 'T', description: 'D', when: { ok: true }, then: { outcome: 'YES' } }],
  default: { outcome: 'NO' }
};

const v = validateDecisions(source);
if (!v.ok) throw new Error('validate failed');
const a = prepareDecisions(source);
if (a.version !== 'v2') throw new Error('wrong version');
const r = executeDecisions(a, { ok: true });
if (r.output.outcome !== 'YES') throw new Error('wrong outcome');
if (!('output' in r)) throw new Error('missing output');

try { prepareDecisions({ ...source, cases: [] }); throw new Error('should throw'); }
catch (e) { if (!(e instanceof DecisionsCompileError)) throw new Error('wrong compile error'); }

try { executeDecisions({ artifactType: 'decisions', version: 'v1' }, {}); throw new Error('should throw'); }
catch (e) { if (!(e instanceof DecisionsRuntimeError)) throw new Error('wrong runtime error'); }

console.log('decisions smoke ok');
`;
writeFileSync(join(workdir, 'check.js'), script);
execFileSync('node', ['check.js'], { cwd: workdir, stdio: 'inherit' });
rmSync(join(root, tarball), { force: true });
