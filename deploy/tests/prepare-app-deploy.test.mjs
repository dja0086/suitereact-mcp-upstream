import assert from 'node:assert/strict';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repo = process.cwd();
const prepare = resolve(repo, 'deploy/prepare-app-deploy.js');
const checkScope = resolve(repo, 'deploy/check-deploy-scope.js');

const otherDeployments = [
  'customscript_sr_sui_approval_manager.customdeploy_sr_sui_approval_manager',
  'customscript_sr_sui_doc_spaces.customdeploy_sr_sui_doc_spaces',
  'customscript_sr_sui_invoice_pdf.customdeploy_sr_sui_invoice_pdf',
  'customscript_sr_sui_script_logs.customdeploy_sr_sui_script_logs',
  'customscript_sr_sui_suiteql_bot.customdeploy_sr_sui_suiteql_bot',
];

async function makeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'suitereact-prepare-'));
  await mkdir(join(root, 'apps/data-viewer'), { recursive: true });
  await mkdir(join(root, 'sdf/objects/suitelet'), { recursive: true });
  await mkdir(join(root, 'sdf/objects/centerCategory'), { recursive: true });
  for (const file of [
    'manifest.xml',
    'sdf/objects/suitelet/customscript_sr_sui_data_viewer.xml',
    'sdf/objects/centerCategory/custcentercategory_suitereact.xml',
  ]) {
    await copyFile(join(repo, file), join(root, file));
  }
  return root;
}

function run(root, script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

function paths(xml) {
  return Array.from(xml.matchAll(/<path>([^<]+)<\/path>/g), m => m[1]);
}

test('update mode deploys only the app files and passes the scope check', async () => {
  const root = await makeRoot();
  const result = run(root, prepare, ['data-viewer']);
  assert.equal(result.status, 0, result.stderr);

  const xml = await readFile(join(root, 'deploy.override'), 'utf8');
  assert.deepEqual(paths(xml), [
    '~/FileCabinet/SuiteScripts/apps/data-viewer/*',
  ]);
  assert.doesNotMatch(xml, /<objects>/);
  assert.equal(existsSync(join(root, 'manifest.override')), false);

  const scope = run(root, checkScope, [
    '--app',
    'data-viewer',
    '--file',
    'deploy.override',
  ]);
  assert.equal(scope.status, 0, scope.stderr);
});

test('install mode adds the app Suitelet object but not the center category', async () => {
  const root = await makeRoot();
  const result = run(root, prepare, ['data-viewer', '--install']);
  assert.equal(result.status, 0, result.stderr);

  const xml = await readFile(join(root, 'deploy.override'), 'utf8');
  assert.deepEqual(paths(xml), [
    '~/FileCabinet/SuiteScripts/apps/data-viewer/*',
    '~/Objects/customscript_sr_sui_data_viewer.xml',
  ]);
  assert.equal(existsSync(join(root, 'manifest.override')), false);
});

test('center category lists the other apps as manifest dependencies', async () => {
  const root = await makeRoot();
  const result = run(root, prepare, [
    'data-viewer',
    '--install',
    '--with-center-category',
  ]);
  assert.equal(result.status, 0, result.stderr);

  const xml = await readFile(join(root, 'deploy.override'), 'utf8');
  assert.deepEqual(paths(xml), [
    '~/FileCabinet/SuiteScripts/apps/data-viewer/*',
    '~/Objects/customscript_sr_sui_data_viewer.xml',
    '~/Objects/custcentercategory_suitereact.xml',
  ]);

  const manifest = await readFile(join(root, 'manifest.override'), 'utf8');
  const objects = Array.from(
    manifest.matchAll(/<object>([^<]+)<\/object>/g),
    m => m[1]
  );
  assert.deepEqual(objects, otherDeployments);
  assert.match(
    manifest,
    /<feature required="true">SERVERSIDESCRIPTING<\/feature>/
  );
  assert.match(manifest, /<\/objects>\n\s*<\/dependencies>/);
});

test('center category without --install also lists the app itself as a dependency', async () => {
  const root = await makeRoot();
  const result = run(root, prepare, ['data-viewer', '--with-center-category']);
  assert.equal(result.status, 0, result.stderr);

  const manifest = await readFile(join(root, 'manifest.override'), 'utf8');
  assert.match(
    manifest,
    /<object>customscript_sr_sui_data_viewer\.customdeploy_sr_sui_data_viewer<\/object>/
  );
});

test('--if-missing keeps an existing override and warns when it differs', async () => {
  const root = await makeRoot();
  const stale =
    '<deploy>\n  <files>\n    <path>~/FileCabinet/SuiteScripts/apps/data-viewer/*</path>\n  </files>\n  <objects>\n    <path>~/Objects/custcentercategory_suitereact.xml</path>\n  </objects>\n</deploy>\n';
  await writeFile(join(root, 'deploy.override'), stale);

  const result = run(root, prepare, ['data-viewer', '--if-missing']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /differs from the scope generated/);
  assert.equal(await readFile(join(root, 'deploy.override'), 'utf8'), stale);

  const forced = run(root, prepare, ['data-viewer', '--force']);
  assert.equal(forced.status, 0, forced.stderr);
  assert.doesNotMatch(
    await readFile(join(root, 'deploy.override'), 'utf8'),
    /<objects>/
  );
});

test('unknown options are rejected', async () => {
  const root = await makeRoot();
  const result = run(root, prepare, ['data-viewer', '--instal']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option: --instal/);
  assert.equal(existsSync(join(root, 'deploy.override')), false);
});

test('scope check rejects another app Suitelet object during an app deploy', async () => {
  const root = await makeRoot();
  await writeFile(
    join(root, 'deploy.override'),
    '<deploy>\n  <files>\n    <path>~/FileCabinet/SuiteScripts/apps/data-viewer/*</path>\n  </files>\n  <objects>\n    <path>~/Objects/customscript_sr_sui_doc_spaces.xml</path>\n  </objects>\n</deploy>\n'
  );
  const scope = run(root, checkScope, [
    '--app',
    'data-viewer',
    '--file',
    'deploy.override',
  ]);
  assert.equal(scope.status, 1);
  assert.match(scope.stderr, /another app's Suitelet object/);
});
