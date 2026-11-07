#!/usr/bin/env node
// Regression runner for scan.mjs. Node only, no dependencies.
//   node .agents/skills/anti-slop-writing/test/run.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases } from './cases.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCAN = path.resolve(HERE, '../scan.mjs');
const SKILL = path.resolve(HERE, '..');
let failed = 0;

function scan(args, input) {
  return spawnSync(process.execPath, [SCAN, ...args], {
    input,
    encoding: 'utf8',
  });
}

function problemsFor(c, result) {
  const problems = [];
  if (c.exit !== undefined && result.status !== c.exit)
    problems.push(`exit ${result.status} != ${c.exit}`);
  if (c.stderrHas && !result.stderr.includes(c.stderrHas))
    problems.push(`stderr missing ${JSON.stringify(c.stderrHas)}`);
  if (c.noJson) return problems;
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    problems.push('stdout is not JSON: ' + result.stdout.slice(0, 200));
    return problems;
  }
  const findings = parsed.findings || [];
  const rules = findings.map(f => f.rule);
  for (const id of c.hits || [])
    if (!rules.includes(id)) problems.push('missing hit ' + id);
  for (const id of c.misses || [])
    if (rules.includes(id))
      problems.push(
        'unexpected ' +
          id +
          ' ' +
          JSON.stringify(findings.filter(f => f.rule === id).map(f => f.match))
      );
  if (c.rules) {
    const got = rules.slice().sort();
    const want = c.rules.slice().sort();
    if (JSON.stringify(got) !== JSON.stringify(want))
      problems.push(
        'rules ' + JSON.stringify(got) + ' != ' + JSON.stringify(want)
      );
  }
  if (c.lines) {
    const byLine = new Map();
    for (const f of findings) {
      const list = byLine.get(f.line) || [];
      list.push(f.rule);
      byLine.set(f.line, list);
    }
    for (const [line, want] of Object.entries(c.lines)) {
      const got = (byLine.get(Number(line)) || []).slice().sort();
      const exp = want.slice().sort();
      if (JSON.stringify(got) !== JSON.stringify(exp))
        problems.push(
          `line ${line} ${JSON.stringify(got)} != ${JSON.stringify(exp)}`
        );
    }
    for (const f of findings)
      if (!(String(f.line) in c.lines))
        problems.push(`unexpected line ${f.line} ${f.rule} "${f.match}"`);
  }
  if (c.severity)
    for (const [id, sev] of Object.entries(c.severity))
      for (const f of findings.filter(x => x.rule === id))
        if (f.severity !== sev)
          problems.push(`${id} severity ${f.severity} != ${sev}`);
  if (c.messageHas)
    for (const [id, fragment] of Object.entries(c.messageHas)) {
      const f = findings.find(x => x.rule === id);
      if (!f || !f.message.includes(fragment))
        problems.push(`${id} message missing ${JSON.stringify(fragment)}`);
    }
  return problems;
}

for (const c of cases) {
  const args = [];
  if (!c.noStdin) args.push('-');
  if (c.mode) args.push('--mode', c.mode);
  if (c.maxDashes !== undefined) args.push('--max-dashes', String(c.maxDashes));
  if (c.strict) args.push('--strict');
  if (!c.noJson) args.push('--json');
  if (c.args) args.push(...c.args);
  const result = scan(args, c.text ?? '');
  const problems = problemsFor(c, result);
  if (problems.length) {
    failed++;
    console.error('FAIL ' + c.name);
    for (const p of problems) console.error('  ' + p);
    if (result.stderr) console.error('  stderr ' + result.stderr.trim());
  } else console.log('ok ' + c.name);
}

function scanFiles(mode, files) {
  const result = scan(['--mode', mode, '--json', ...files]);
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    failed++;
    console.error('FAIL self-scan ' + mode + ' (not JSON)');
    console.error(result.stderr);
    return;
  }
  return parsed.findings;
}

const docs = [
  path.join(SKILL, 'SKILL.md'),
  path.join(SKILL, 'references/rules.md'),
  path.join(SKILL, 'references/voice.md'),
];
for (const mode of ['marketing', 'social', 'creative']) {
  const findings = scanFiles(mode, docs);
  if (!findings) continue;
  if (findings.length) {
    failed++;
    console.error('FAIL self-scan ' + mode);
    for (const f of findings)
      console.error(
        `  ${f.severity} ${f.file}:${f.line} ${f.rule} "${f.match}"`
      );
  } else console.log('ok self-scan ' + mode);
}
const docFindings = scanFiles('docs', docs);
if (docFindings) {
  const other = docFindings.filter(f => f.rule !== 'the-user');
  if (other.length) {
    failed++;
    console.error('FAIL self-scan docs');
    for (const f of other)
      console.error(
        `  ${f.severity} ${f.file}:${f.line} ${f.rule} "${f.match}"`
      );
  } else console.log(`ok self-scan docs (${docFindings.length} the-user warn)`);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
