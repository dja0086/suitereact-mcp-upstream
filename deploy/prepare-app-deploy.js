#!/usr/bin/env node

/**
 * Writes a scoped deploy.override (and, when needed, manifest.override) for
 * one app.
 *
 * Update (default): only the app's File Cabinet files. Redeploying the app's
 * Suitelet object would reset its deployment (Deployed, Status, Audience) to
 * the values in sdf/objects/suitelet/*.xml, which ship disabled, so an update
 * leaves the object out and keeps the account's live settings.
 *
 * --install: also deploys the app's Suitelet object, for a first install.
 * --with-center-category: also deploys the shared SuiteReact center category.
 *   The category links to every app's deployment, so a manifest.override is
 *   written that lists the other apps' deployments as dependencies; they are
 *   referenced, not deployed.
 */

const { existsSync, readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const args = process.argv.slice(2);
const appName = args.find(arg => !arg.startsWith('--'));
const force = args.includes('--force');
const ifMissing = args.includes('--if-missing');
const install = args.includes('--install');
const withCenterCategory = args.includes('--with-center-category');
const root = process.cwd();

const knownFlags = new Set([
  '--force',
  '--if-missing',
  '--install',
  '--with-center-category',
]);

function usage() {
  console.error(
    'Usage: node deploy/prepare-app-deploy.js <app-name> [--install] [--with-center-category] [--if-missing|--force]'
  );
}

const unknownFlags = args.filter(
  arg => arg.startsWith('--') && !knownFlags.has(arg)
);
if (!appName || unknownFlags.length > 0) {
  if (unknownFlags.length > 0) {
    console.error(`Unknown option: ${unknownFlags.join(', ')}`);
  }
  usage();
  process.exit(1);
}

const appPath = join(root, 'apps', appName);
if (!existsSync(appPath)) {
  console.error(`App does not exist: apps/${appName}`);
  process.exit(1);
}

const appScriptId = appName.replace(/-/g, '_');
const suiteletObject = `customscript_sr_sui_${appScriptId}.xml`;
const suiteletObjectPath = join(
  root,
  'sdf',
  'objects',
  'suitelet',
  suiteletObject
);
const centerCategoryObject = 'custcentercategory_suitereact.xml';
const centerCategoryPath = join(
  root,
  'sdf',
  'objects',
  'centerCategory',
  centerCategoryObject
);

const objects = [];
if (install) {
  if (existsSync(suiteletObjectPath)) {
    objects.push(suiteletObject);
  } else {
    console.warn(
      `Warning: ${suiteletObjectPath} does not exist; app object not included`
    );
  }
}

let dependencies = [];
if (withCenterCategory) {
  if (!existsSync(centerCategoryPath)) {
    console.error(`Center category does not exist: ${centerCategoryPath}`);
    process.exit(1);
  }
  objects.push(centerCategoryObject);

  const deployedScriptIds = new Set(
    objects.map(object => object.replace(/\.xml$/, ''))
  );
  const references = Array.from(
    readFileSync(centerCategoryPath, 'utf8').matchAll(/\[scriptid=([^\]]+)\]/g),
    match => match[1].trim()
  );
  dependencies = [...new Set(references)]
    .filter(reference => !deployedScriptIds.has(reference.split('.')[0]))
    .sort();
}

function buildDeployXml() {
  const lines = [
    '<deploy>',
    '  <files>',
    `    <path>~/FileCabinet/SuiteScripts/apps/${appName}/*</path>`,
    '  </files>',
  ];
  if (objects.length > 0) {
    lines.push('  <objects>');
    for (const object of objects) {
      lines.push(`    <path>~/Objects/${object}</path>`);
    }
    lines.push('  </objects>');
  }
  lines.push('</deploy>', '');
  return lines.join('\n');
}

function buildManifestXml() {
  const baseManifestPath = join(root, 'manifest.xml');
  if (!existsSync(baseManifestPath)) {
    console.error(`Base manifest does not exist: ${baseManifestPath}`);
    process.exit(1);
  }
  const base = readFileSync(baseManifestPath, 'utf8');
  if (/<objects>/.test(base) || !base.includes('</dependencies>')) {
    console.error(
      'manifest.xml already declares object dependencies or has no <dependencies>; edit manifest.override by hand'
    );
    process.exit(1);
  }
  const entries = dependencies
    .map(dependency => `      <object>${dependency}</object>`)
    .join('\n');
  return base.replace(
    '</dependencies>',
    `  <objects>\n${entries}\n    </objects>\n  </dependencies>`
  );
}

function writeOverride(fileName, content) {
  const path = join(root, fileName);
  if (existsSync(path) && !force) {
    if (ifMissing) {
      if (readFileSync(path, 'utf8') !== content) {
        console.warn(
          `Warning: ${fileName} already exists and differs from the scope generated for ${appName} (${mode}); leaving it unchanged. Use --force to replace it.`
        );
      } else {
        console.log(`${fileName} already exists; leaving it unchanged`);
      }
      return;
    }

    console.error(`${fileName} already exists. Use --force to replace it.`);
    process.exit(1);
  }

  writeFileSync(path, content);
  console.log(`Wrote ${fileName} for ${appName} (${mode})`);
}

const mode = [
  install ? 'install' : 'update',
  ...(withCenterCategory ? ['center category'] : []),
].join(' + ');

writeOverride('deploy.override', buildDeployXml());
if (dependencies.length > 0) {
  writeOverride('manifest.override', buildManifestXml());
}

if (!install) {
  console.log(
    `Update scope: files only. The ${suiteletObject.replace(/\.xml$/, '')} deployment keeps its settings in the account.`
  );
}
