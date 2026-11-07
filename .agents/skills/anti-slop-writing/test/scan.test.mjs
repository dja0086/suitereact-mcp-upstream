// Run with: npm test   (or: node --test "test/*.test.mjs")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scan = fileURLToPath(new URL('../scan.mjs', import.meta.url));
const run = (text, mode = 'marketing', ...extra) => {
  const r = spawnSync(
    process.execPath,
    [scan, '-', '--mode', mode, '--json', ...extra],
    { input: text, encoding: 'utf8' }
  );
  return {
    code: r.status,
    rules: JSON.parse(r.stdout).findings.map(f => `${f.severity}:${f.rule}`),
  };
};

test('marketing slop is banned', () => {
  const r = run(
    'Unlock seamless growth with our all-in-one platform — get started →'
  );
  assert.equal(r.code, 1);
  for (const id of ['BAN:hype-phrase', 'BAN:em-dash', 'BAN:arrow-glyph'])
    assert.ok(r.rules.includes(id), id);
  assert.ok(r.rules.includes('WARN:weak-cta'));
});

test('plain, specific copy passes', () => {
  const r = run(
    'Query customers, transactions and employees in one grid, then export the rows on screen.'
  );
  assert.equal(r.code, 0);
  assert.deepEqual(r.rules, []);
});

test('fiction cliches are banned in creative mode only', () => {
  const text =
    'She let out a breath. The air was thick with smoke, a tapestry of noise.';
  assert.ok(run(text, 'creative').rules.includes('BAN:fiction-cliche'));
  assert.ok(!run(text, 'marketing').rules.includes('BAN:fiction-cliche'));
});

test('hedges are banned in every mode; assistant openers in marketing and docs', () => {
  for (const mode of ['marketing', 'creative', 'docs'])
    assert.ok(
      run('It is worth noting that this works.', mode).rules.includes(
        'BAN:hedge-stack'
      ),
      mode
    );
  for (const mode of ['marketing', 'docs'])
    assert.ok(
      run('Certainly! This works.', mode).rules.includes(
        'BAN:sycophant-opener'
      ),
      mode
    );
  // in fiction, "Of course," and "Absolutely" are ordinary narration
  assert.ok(
    !run('Certainly! This works.', 'creative').rules.includes(
      'BAN:sycophant-opener'
    )
  );
});

test('table placeholders and factual "the only" are not flagged', () => {
  const r = run(
    '| 7 | Rename | — | — |\nThe vault holds the only copy.',
    'marketing'
  );
  assert.deepEqual(r.rules, []);
});

test('emoji are a WARN in docs and a BAN in marketing', () => {
  assert.ok(run('Status: ✅ done', 'docs').rules.includes('WARN:emoji-docs'));
  assert.ok(
    run('Ship faster \u{1F680}', 'marketing').rules.includes('BAN:emoji')
  );
});

test('code spans and fences are skipped', () => {
  const r = run(
    'Run `unlock --seamless` now.\n```\nleverage robust synergy\n```\n',
    'marketing'
  );
  assert.deepEqual(r.rules, []);
});

test('--strict fails on WARN', () => {
  assert.equal(run('Learn more about the grid.', 'marketing').code, 0);
  assert.equal(
    run('Learn more about the grid.', 'marketing', '--strict').code,
    1
  );
});

// ---- regressions from the first blind test of the skill ----
const has = (text, mode, id) => run(text, mode).rules.includes(id);
const clean = (text, mode) => run(text, mode).rules.length === 0;

test('shell commands are skipped, so a CLI flag is not a dash', () => {
  assert.ok(
    clean('Deploy Data Viewer: npm run deploy:app -- data-viewer', 'marketing')
  );
  assert.ok(has('Fast -- really fast.', 'marketing', 'BAN:em-dash'));
});

test('curly quotes and apostrophes do not hide patterns', () => {
  assert.ok(has('Wait—“stop.”', 'creative', 'BAN:em-dash'));
  assert.ok(has('She said “stop”—and he stopped.', 'creative', 'BAN:em-dash'));
  assert.ok(has('“Wait—” she said.', 'creative', 'BAN:em-dash'));
  assert.ok(has('—Who is there?', 'creative', 'BAN:em-dash'));
  assert.ok(
    has('It’s not the cold. It’s the quiet.', 'creative', 'WARN:not-just-x')
  );
  assert.ok(
    has(
      'She released a breath she hadn’t realized she was holding.',
      'creative',
      'BAN:fiction-cliche'
    )
  );
});

test('"It\'s not just a viewer, it\'s a game-changer" is caught', () => {
  assert.ok(
    has("It's not just a viewer, it's a grid.", 'marketing', 'WARN:not-just-x')
  );
});

test('literal narration is not marketing slop in creative mode', () => {
  for (const s of [
    'She unlocked the cage and pulled the pallet jack out.',
    'He used the pry bar for leverage on the crate lid.',
    'The elevated conveyor rattled over aisle 9.',
    'The wrap was robust enough to hold.',
    'At the end of the day shift she clocked out.',
    '“When it comes to forklifts, Dale is useless,” she said.',
    'She nodded. Of course, the door was locked.',
    'He shrugged. Absolutely nothing moved.',
    'The bin held a mix of sand and gravel.',
    'She heard the whisper of tires on the wet lot.',
  ])
    assert.ok(clean(s, 'creative'), s);
  // the same words are still slop in marketing
  assert.ok(has('Unlock your data.', 'marketing', 'BAN:hype-phrase'));
});

test('fiction cliches the first list missed', () => {
  for (const s of [
    'Little did Dale know.',
    'She let out a long breath.',
    'Her heart pounded in her chest. Fear gripped her.',
    'The silence was deafening.',
    'A wave of relief washed over her.',
    'The air smelled of dust and ozone.',
    'A scent of ozone hung there.',
    'This night would change everything.',
    'Some doors are meant to stay closed.',
    'A tapestry of forgotten memories.',
  ])
    assert.ok(has(s, 'creative', 'BAN:fiction-cliche'), s);
  assert.ok(
    has('Mara Chen opened the door.', 'creative', 'WARN:fiction-names')
  );
});

test('exclamation stacks are flagged in every mode', () => {
  assert.ok(
    has('She laughed!! Then again!', 'creative', 'WARN:exclamation-stack')
  );
});

test('a missing file or bad mode exits 2, not 1', () => {
  const r1 = spawnSync(process.execPath, [scan, 'no-such-file.md'], {
    encoding: 'utf8',
  });
  const r2 = spawnSync(process.execPath, [scan, '-', '--mode', 'poetry'], {
    input: 'x',
    encoding: 'utf8',
  });
  assert.equal(r1.status, 2);
  assert.equal(r2.status, 2);
});
