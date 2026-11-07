#!/usr/bin/env node
// Launch-video pipeline: analyze a reference video, capture a running app,
// render a storyboard to MP4 in a consistent motion style.
//
//   node driver.mjs new <slug>                       scaffold .launch-video/<slug>/
//   node driver.mjs analyze <ref.mp4> [--out dir]    palette + pacing + keyframes -> style.json
//   node driver.mjs capture <capture.json>           drive app, record timestamped frames
//   node driver.mjs render <storyboard.json> [--draft] [--from s] [--to s] [--out f.mp4]
//   node driver.mjs still <storyboard.json> <t...>   PNG stills at times (seconds)
//   node driver.mjs sheet <video.mp4> [--out png]    contact sheet for review
//   node driver.mjs palettes                         list style presets
//
// Requires: ffmpeg/ffprobe on PATH, playwright (repo devDependency or global).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = findRoot(process.cwd());
const WORK = path.join(ROOT, '.launch-video');

const FORMATS = {
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
  '9:16': [1080, 1920],
  '4:5': [1080, 1350],
};
const DEFAULT_STYLE = {
  name: 'default',
  palette: {
    bg: '#07080d',
    bg2: '#11131c',
    fg: '#f4f6fb',
    muted: '#8a91a5',
    accent: '#7c6cff',
    accent2: '#2dd4bf',
  },
  font: {
    display: 'Inter Display',
    body: 'Inter',
    mono: 'JetBrains Mono',
    weightDisplay: 800,
    tracking: '-0.045em',
  },
  motion: {
    ease: 'expo',
    text: 'mask',
    wordStagger: 0.07,
    enter: 0.65,
    drift: 0.012,
    transition: 'fade-zoom',
    transitionDuration: 0.5,
    zoomDuration: 0.9,
  },
  highlight: 'gradient',
  background: 'aurora',
  glow: 0.32,
  grain: 0.07,
  vignette: 0.55,
  cornerMark: true,
  frame: { radius: 18, chrome: 'browser', tilt: true },
};

// ---------------------------------------------------------------- helpers
function findRoot(dir) {
  let d = dir;
  while (d !== path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    d = path.dirname(d);
  }
  return dir;
}
function args(argv) {
  const pos = [],
    flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      flags[k] = v;
    } else pos.push(a);
  }
  return { pos, flags };
}
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) =>
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {}))
    out[k] = isObj(a?.[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k];
  return out;
}
function die(msg) {
  console.error('error: ' + msg);
  process.exit(1);
}
function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    ...opts,
  });
  if (r.status !== 0 && !opts.allowFail)
    die(`${cmd} ${argv.join(' ')}\n${r.stderr?.slice(-2000)}`);
  return r;
}
function chromium() {
  try {
    return require('playwright').chromium;
  } catch {
    die(
      'playwright not found: run `npm ci` at the repo root (or install playwright globally)'
    );
  }
}
// The repo's pinned playwright may expect a browser build that is not
// installed; fall back to an explicit Chrome instead of downloading one.
async function launchBrowser(args = []) {
  const pw = chromium();
  try {
    return await pw.launch({ args });
  } catch (e) {
    if (!/Executable doesn't exist/.test(e.message)) throw e;
    const exe =
      process.env.LAUNCH_VIDEO_CHROME ||
      [
        '/opt/pw-browsers/chromium',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
      ].find(p => fs.existsSync(p));
    if (!exe) throw e;
    console.error(`[info] playwright browser build missing; using ${exe}`);
    return pw.launch({ executablePath: exe, args: ['--no-sandbox', ...args] });
  }
}
const rel = p => path.relative(process.cwd(), p) || '.';

// ---------------------------------------------------------------- style
function loadStyle(ref, baseDir) {
  if (!ref) return DEFAULT_STYLE;
  if (isObj(ref)) return merge(DEFAULT_STYLE, ref);
  const candidates = [
    path.resolve(baseDir, ref),
    path.join(HERE, 'palettes', ref + '.json'),
  ];
  const hit = candidates.find(c => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!hit)
    die(
      `style "${ref}" not found (looked in ${candidates.map(rel).join(', ')})`
    );
  return merge(DEFAULT_STYLE, readJson(hit));
}

// ---------------------------------------------------------------- new
function cmdNew(slug) {
  if (!slug) die('usage: new <slug>');
  const dir = path.join(WORK, slug);
  if (fs.existsSync(dir)) die(`${rel(dir)} already exists`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['brief.md', 'capture.json', 'storyboard.json']) {
    fs.copyFileSync(path.join(HERE, 'templates', f), path.join(dir, f));
  }
  console.log(`created ${rel(dir)}/{brief.md,capture.json,storyboard.json}`);
}

// ---------------------------------------------------------------- capture
async function cmdCapture(file, flags) {
  if (!file) die('usage: capture <capture.json>');
  const spec = readJson(file);
  const baseDir = path.dirname(path.resolve(file));
  const name = spec.name || path.basename(file, '.json');
  const out = path.resolve(
    baseDir,
    flags.out || spec.out || path.join('captures', name)
  );
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
  const [vw, vh] = spec.viewport || [1440, 900];
  const dsf = spec.deviceScaleFactor ?? 2;
  const quality = spec.quality ?? 90;

  // CDP screencast ignores the context's deviceScaleFactor and emits CSS-pixel
  // frames; forcing the browser-wide scale factor yields hi-DPI frames.
  const browser = await launchBrowser([`--force-device-scale-factor=${dsf}`]);
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh },
    deviceScaleFactor: dsf,
    colorScheme: spec.colorScheme || 'light',
  });
  const page = await ctx.newPage();
  // Demo data: route matching requests to a local handler module so captures
  // never touch a live account. Handler: ({url, method, body}) => json | undefined
  for (const m of [].concat(spec.mock || [])) {
    const mod = await import(
      pathToFileURL(path.resolve(baseDir, m.module)).href
    );
    const handler = mod.default || mod.handler;
    await page.route(m.pattern, async route => {
      const req = route.request();
      const cors = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      };
      if (req.method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers: cors });
      let body = null;
      try {
        body = req.postDataJSON();
      } catch {
        body = req.postData();
      }
      const res = await handler({ url: req.url(), method: req.method(), body });
      if (res === undefined) return route.continue();
      if (m.delay) await sleep(m.delay);
      return route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify(res),
      });
    });
  }
  if (spec.beforeNavigate?.length)
    await runSteps(page, spec.beforeNavigate, null);
  await page.goto(spec.url, {
    waitUntil: spec.waitUntil || 'networkidle',
    timeout: 60000,
  });
  if (spec.css) await page.addStyleTag({ content: spec.css });

  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const writes = [];
  let t0 = null;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    const now = Date.now() / 1000;
    if (t0 == null) t0 = now;
    const fileName = `${String(frames.length).padStart(5, '0')}.jpg`;
    frames.push({ t: +(now - t0).toFixed(4), file: 'frames/' + fileName });
    writes.push(
      fs.promises.writeFile(
        path.join(out, 'frames', fileName),
        Buffer.from(data, 'base64')
      )
    );
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality,
    maxWidth: vw * dsf,
    maxHeight: vh * dsf,
    everyNthFrame: 1,
  });
  while (t0 == null) await sleep(10);

  const rec = { t0, cursor: [], marks: {}, pos: { x: vw / 2, y: vh / 2 } };
  rec.cursor.push({ t: 0, x: rec.pos.x, y: rec.pos.y });
  if (process.env.DEBUG)
    page.on('request', r => console.error('[req]', r.method(), r.url()));
  page.on('pageerror', e => console.error('[page error]', e.message));
  try {
    await runSteps(page, spec.steps || [], rec);
  } catch (e) {
    const shot = path.join(out, 'error.png');
    await page.screenshot({ path: shot }).catch(() => {});
    await browser.close();
    die(`${e.message.split('\n')[0]}\n  failure screenshot: ${rel(shot)}`);
  }
  await sleep(spec.tail ?? 800);
  await cdp.send('Page.stopScreencast');
  await Promise.all(writes);
  const duration = +(Date.now() / 1000 - t0).toFixed(3);
  await browser.close();

  const meta = {
    name,
    url: spec.displayUrl || spec.url,
    width: vw,
    height: vh,
    deviceScaleFactor: dsf,
    duration,
    frames,
    cursor: rec.cursor,
    marks: rec.marks,
  };
  writeJson(path.join(out, 'capture.json'), meta);
  // raw preview MP4 (variable frame timing -> constant 30fps)
  const list =
    frames
      .map(
        (f, i) =>
          `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? duration) - f.t).toFixed(4)}`
      )
      .join('\n') + `\nfile '${frames.at(-1).file}'\n`;
  fs.writeFileSync(path.join(out, 'frames.txt'), list);
  run(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'frames.txt',
      '-vf',
      'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-pix_fmt',
      'yuv420p',
      '-c:v',
      'libx264',
      '-crf',
      '20',
      'preview.mp4',
    ],
    { cwd: out }
  );
  console.log(
    JSON.stringify(
      {
        capture: rel(out),
        frames: frames.length,
        duration,
        marks: Object.fromEntries(
          Object.entries(rec.marks).map(([k, v]) => [k, v.t])
        ),
        preview: rel(path.join(out, 'preview.mp4')),
      },
      null,
      2
    )
  );
}

async function moveTo(page, rec, x, y, ms = 650) {
  const steps = Math.max(8, Math.round(ms / 16));
  const { x: sx, y: sy } = rec ? rec.pos : { x, y };
  for (let i = 1; i <= steps; i++) {
    const p = i / steps;
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const cx = sx + (x - sx) * e,
      cy = sy + (y - sy) * e;
    await page.mouse.move(cx, cy);
    if (rec)
      rec.cursor.push({
        t: +(Date.now() / 1000 - rec.t0).toFixed(4),
        x: +cx.toFixed(1),
        y: +cy.toFixed(1),
      });
    await sleep(ms / steps);
  }
  if (rec) rec.pos = { x, y };
}
async function target(page, sel) {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 15000 });
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  return { loc, box: b, x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function runSteps(page, steps, rec) {
  const now = () => (rec ? +(Date.now() / 1000 - rec.t0).toFixed(3) : 0);
  for (const [idx, s] of steps.entries()) {
    try {
      await runStep(page, s, rec, now);
    } catch (e) {
      e.message = `step ${idx + 1} ${JSON.stringify(s)}: ${e.message}`;
      throw e;
    }
  }
}
async function runStep(page, s, rec, now) {
  {
    let box = null;
    if (s.wait != null) await sleep(s.wait);
    if (s.waitFor)
      await page
        .locator(s.waitFor)
        .first()
        .waitFor({ state: 'visible', timeout: 30000 });
    if (s.move) {
      await moveTo(page, rec, s.move[0], s.move[1], s.ms);
    }
    if (s.hover) {
      const t = await target(page, s.hover);
      box = t.box;
      await moveTo(page, rec, t.x, t.y, s.ms);
    }
    if (s.click) {
      const t = await target(page, s.click);
      box = t.box;
      await moveTo(page, rec, t.x, t.y, s.ms);
      await sleep(120);
      if (rec) rec.cursor.push({ t: now(), x: t.x, y: t.y, click: true });
      await page.mouse.down();
      await sleep(70);
      await page.mouse.up();
    }
    if (s.type) {
      const [sel, text] = s.type;
      const t = await target(page, sel);
      box = t.box;
      await moveTo(page, rec, t.x, t.y, s.ms);
      if (rec) rec.cursor.push({ t: now(), x: t.x, y: t.y, click: true });
      await t.loc.click();
      await page.keyboard.type(text, { delay: s.delay ?? 55 });
    }
    if (s.press) await page.keyboard.press(s.press);
    if (s.scroll) {
      const n = 20;
      for (let i = 0; i < n; i++) {
        await page.mouse.wheel(0, s.scroll / n);
        await sleep((s.ms ?? 700) / n);
      }
    }
    if (s.eval) await page.evaluate(s.eval);
    if (s.mark && rec)
      rec.marks[s.mark] = {
        t: now(),
        rect: box
          ? [box.x, box.y, box.width, box.height].map(v => +v.toFixed(1))
          : null,
      };
    if (s.markRect && rec) {
      const t = await target(page, s.markRect[1]);
      rec.marks[s.markRect[0]] = {
        t: now(),
        rect: [t.box.x, t.box.y, t.box.width, t.box.height].map(
          v => +v.toFixed(1)
        ),
      };
    }
    if (s.pause != null) await sleep(s.pause);
  }
}

// ---------------------------------------------------------------- storyboard resolution
function resolveMark(ref, cap, what) {
  // "@mark" | "@mark+0.4" | "@mark-1"
  const m = /^@([\w-]+)([+-][\d.]+)?$/.exec(ref);
  if (!m) die(`bad mark reference "${ref}"`);
  const mk = cap.marks[m[1]];
  if (!mk)
    die(
      `capture "${cap.name}" has no mark "${m[1]}" (has: ${Object.keys(cap.marks).join(', ') || 'none'})`
    );
  if (what === 'rect') return mk.rect;
  return mk.t + (m[2] ? parseFloat(m[2]) : 0);
}
function loadStoryboard(file, flags = {}) {
  const sbPath = path.resolve(file);
  const baseDir = path.dirname(sbPath);
  const sb = readJson(sbPath);
  const style = merge(loadStyle(sb.style, baseDir), sb.styleOverrides || {});
  const format = flags.format || sb.format || '16:9';
  const [width, height] =
    FORMATS[format] ||
    die(`unknown format ${format} (use ${Object.keys(FORMATS).join(', ')})`);
  const caps = {};
  for (const sc of sb.scenes) {
    if (sc.type !== 'capture') continue;
    if (!sc.src) die('capture scene needs "src" (capture directory)');
    const dir = path.resolve(baseDir, sc.src);
    const metaFile = path.join(dir, 'capture.json');
    if (!fs.existsSync(metaFile))
      die(
        `no capture at ${rel(dir)}; run: node driver.mjs capture <capture.json>`
      );
    const cap = (caps[dir] ||= readJson(metaFile));
    sc._from =
      typeof sc.from === 'string' ? resolveMark(sc.from, cap) : sc.from || 0;
    if (sc.until) {
      const until =
        typeof sc.until === 'string' ? resolveMark(sc.until, cap) : sc.until;
      sc.duration ??= +((until - sc._from) / (sc.speed || 1)).toFixed(2);
    }
    sc.duration ??= Math.min(6, (cap.duration - sc._from) / (sc.speed || 1));
    for (const z of sc.zoom || []) {
      if (typeof z.at === 'string')
        z.at = (resolveMark(z.at, cap) - sc._from) / (sc.speed || 1);
      if (typeof z.rect === 'string' && z.rect !== 'full') {
        const r = resolveMark(z.rect, cap, 'rect');
        if (!r)
          die(
            `mark ${z.rect} has no element rect (use a click/hover/type step or markRect)`
          );
        z.rect = padRect(r, z.pad ?? 120, cap, width / height);
      }
    }
    sc._capture = {
      ...cap,
      dir: path.relative(baseDir, dir).split(path.sep).join('/'),
    };
  }
  for (const sc of sb.scenes) sc.duration ??= 3;
  return { sb, style, width, height, baseDir, sbPath };
}
function padRect([x, y, w, h], pad, cap, _aspect) {
  // pad, then grow to the capture's aspect so the zoom fills the frame
  let nx = x - pad,
    ny = y - pad,
    nw = w + pad * 2,
    nh = h + pad * 2;
  const a = cap.width / cap.height;
  if (nw / nh < a) {
    const d = nh * a - nw;
    nx -= d / 2;
    nw += d;
  } else {
    const d = nw / a - nh;
    ny -= d / 2;
    nh += d;
  }
  return [nx, ny, nw, nh].map(v => +v.toFixed(1));
}

async function openStage(ctx, scale = 1) {
  const page = await launchBrowser().then(
    b => (
      (ctx.browser = b),
      b.newPage({
        viewport: {
          width: Math.round(ctx.width * scale),
          height: Math.round(ctx.height * scale),
        },
      })
    )
  );
  page.on('pageerror', e => console.error('[stage error]', e.message));
  await page.goto(pathToFileURL(path.join(HERE, 'stage.html')).href);
  const info = await page.evaluate(d => window.__init(d), {
    // bundled fonts (font.files[].src) resolve relative to the skill directory
    fontFaces: (ctx.style.font.files || []).map(f => ({
      ...f,
      url: pathToFileURL(path.resolve(HERE, f.src)).href,
    })),
    storyboard: ctx.sb,
    style: ctx.style,
    width: ctx.width,
    height: ctx.height,
    scale,
    base: pathToFileURL(ctx.baseDir).href + '/',
  });
  // @font-face fonts load lazily; force them before the first frame
  await page.evaluate(
    files =>
      Promise.all(
        files.map(f =>
          document.fonts.load(`${f.weight || 400} 64px "${f.family}"`)
        )
      ),
    ctx.style.font.files || []
  );
  await page.evaluate(() => document.fonts.ready);
  // document.fonts.check() is true for any family not in the FontFaceSet, so ask fontconfig instead
  const fc = spawnSync('fc-list', [':', 'family'], { encoding: 'utf8' });
  if (fc.status === 0) {
    const have = new Set(
      fc.stdout.split(/[\n,]/).map(f => f.trim().toLowerCase())
    );
    const missing = [
      ctx.style.font.display,
      ctx.style.font.body,
      ctx.style.font.mono,
    ].filter(
      f =>
        !have.has(String(f).toLowerCase()) &&
        !(ctx.style.font.files || []).some(x => x.family === f)
    );
    if (missing.length)
      console.error(
        `[warn] fonts not installed, Chromium will fall back: ${missing.join(', ')} (see: fc-list : family)`
      );
  }
  return { page, info };
}

// ---------------------------------------------------------------- render
async function cmdRender(file, flags) {
  if (!file) die('usage: render <storyboard.json>');
  const ctx = loadStoryboard(file, flags);
  const fps = +(flags.fps || ctx.sb.fps || 30);
  const scale = flags.draft ? 0.5 : +(flags.scale || 1);
  const { page, info } = await openStage(ctx, scale);
  const from = +(flags.from || 0);
  const to = Math.min(+(flags.to || info.duration), info.duration);
  const outDir = path.join(ctx.baseDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.resolve(
    flags.out ||
      path.join(
        outDir,
        `${path.basename(file, '.json')}${flags.draft ? '-draft' : ''}.mp4`
      )
  );
  const nFrames = Math.round((to - from) * fps);

  const ff = [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-framerate',
    String(fps),
    '-c:v',
    'mjpeg',
    '-i',
    '-',
  ];
  const music = ctx.sb.music;
  if (music?.src) {
    const mpath = path.resolve(ctx.baseDir, music.src);
    if (!fs.existsSync(mpath)) die(`music not found: ${rel(mpath)}`);
    const len = to - from,
      fade = music.fadeOut ?? 1.5;
    ff.push(
      '-ss',
      String((music.start || 0) + from),
      '-i',
      mpath,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-af',
      `volume=${music.volume ?? 1},afade=t=in:d=${from > 0 ? 0 : 0.3},afade=t=out:st=${Math.max(0, len - fade)}:d=${fade}`,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-shortest'
    );
  }
  ff.push(
    '-c:v',
    'libx264',
    '-preset',
    flags.draft ? 'veryfast' : 'medium',
    '-crf',
    flags.draft ? '26' : '17',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-movflags',
    '+faststart',
    out
  );
  const enc = spawn('ffmpeg', ff, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) =>
    enc.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))))
  );
  const started = Date.now();
  for (let i = 0; i < nFrames; i++) {
    await page.evaluate(t => window.__seek(t), from + i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!enc.stdin.write(buf))
      await new Promise(r => enc.stdin.once('drain', r));
    if (i % fps === 0)
      process.stderr.write(
        `\rrender ${((i / nFrames) * 100).toFixed(0).padStart(3)}%  ${(from + i / fps).toFixed(1)}s / ${to.toFixed(1)}s`
      );
  }
  enc.stdin.end();
  await done;
  await ctx.browser.close();
  process.stderr.write('\r' + ' '.repeat(60) + '\r');
  console.log(
    JSON.stringify(
      {
        out: rel(out),
        duration: +(to - from).toFixed(2),
        frames: nFrames,
        fps,
        size: `${Math.round(ctx.width * scale)}x${Math.round(ctx.height * scale)}`,
        seconds: Math.round((Date.now() - started) / 1000),
        timeline: info.scenes,
      },
      null,
      2
    )
  );
}

async function cmdStill(file, times, flags) {
  if (!file || !times.length) die('usage: still <storyboard.json> <t> [t...]');
  const ctx = loadStoryboard(file, flags);
  const { page, info } = await openStage(ctx, +(flags.scale || 0.5));
  const outDir = path.join(ctx.baseDir, 'out', 'stills');
  fs.mkdirSync(outDir, { recursive: true });
  const outs = [];
  for (const t of times.map(Number)) {
    await page.evaluate(x => window.__seek(x), t);
    const p = path.join(outDir, `t${t.toFixed(2)}.png`);
    await page.screenshot({ path: p });
    outs.push(rel(p));
  }
  await ctx.browser.close();
  console.log(
    JSON.stringify(
      { duration: info.duration, timeline: info.scenes, stills: outs },
      null,
      2
    )
  );
}

// ---------------------------------------------------------------- sheet
function probe(file) {
  const r = run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,r_frame_rate:format=duration',
    '-of',
    'json',
    file,
  ]);
  const j = JSON.parse(r.stdout);
  const [n, d] = j.streams[0].r_frame_rate.split('/').map(Number);
  return {
    width: j.streams[0].width,
    height: j.streams[0].height,
    fps: +(n / d).toFixed(2),
    duration: +(+j.format.duration).toFixed(3),
  };
}
function contactSheet(file, out, { cols = 4, rows = 3, times } = {}) {
  const info = probe(file);
  const n = cols * rows;
  const ts = times?.length
    ? times.slice(0, n)
    : Array.from({ length: n }, (_, i) => ((i + 0.5) * info.duration) / n);
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.sheet-'));
  const font = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf';
  const label = fs.existsSync(font)
    ? `,drawtext=fontfile=${font}:text='%{pts\\:hms}':x=10:y=10:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`
    : '';
  ts.forEach((t, i) => {
    run('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      t.toFixed(3),
      '-copyts',
      '-i',
      file,
      '-frames:v',
      '1',
      '-vf',
      `scale=480:-2${label}`,
      path.join(tmp, `${String(i).padStart(3, '0')}.png`),
    ]);
  });
  run('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '1',
    '-i',
    path.join(tmp, '%03d.png'),
    '-vf',
    `tile=${cols}x${Math.ceil(ts.length / cols)}:padding=6:margin=6:color=0x202020`,
    '-frames:v',
    '1',
    out,
  ]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { ...info, sheet: out, times: ts.map(t => +t.toFixed(2)) };
}
function cmdSheet(file, flags) {
  if (!file) die('usage: sheet <video.mp4>');
  const out = path.resolve(
    flags.out || file.replace(/\.[^.]+$/, '') + '-sheet.png'
  );
  const r = contactSheet(path.resolve(file), out, {
    cols: +(flags.cols || 4),
    rows: +(flags.rows || 3),
  });
  console.log(JSON.stringify({ ...r, sheet: rel(r.sheet) }, null, 2));
}

// ---------------------------------------------------------------- analyze
const hex = ([r, g, b]) =>
  '#' +
  [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const lum = ([r, g, b]) => {
  const f = v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function hsl([r, g, b]) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2,
    d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
const mix = (a, b, p) => a.map((v, i) => v + (b[i] - v) * p);
function kmeans(px, k, iters = 14) {
  const n = px.length / 3;
  let cents = Array.from({ length: k }, (_, i) => {
    const j = Math.floor(((i + 0.5) / k) * n) * 3;
    return [px[j], px[j + 1], px[j + 2]];
  });
  const assign = new Uint8Array(n);
  for (let it = 0; it < iters; it++) {
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const r = px[i * 3],
        g = px[i * 3 + 1],
        b = px[i * 3 + 2];
      let best = 0,
        bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d =
          (r - cents[c][0]) ** 2 +
          (g - cents[c][1]) ** 2 +
          (b - cents[c][2]) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      assign[i] = best;
      const s = sum[best];
      s[0] += r;
      s[1] += g;
      s[2] += b;
      s[3]++;
    }
    cents = sum.map((s, c) =>
      s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : cents[c]
    );
  }
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[assign[i]]++;
  return cents
    .map((c, i) => ({ rgb: c, share: counts[i] / n }))
    .filter(c => c.share > 0)
    .sort((a, b) => b.share - a.share);
}
function cmdAnalyze(file, flags) {
  if (!file) die('usage: analyze <reference video>');
  const src = path.resolve(file);
  const out = path.resolve(
    flags.out ||
      path.join(WORK, 'reference', path.basename(file).replace(/\.[^.]+$/, ''))
  );
  fs.mkdirSync(path.join(out, 'keyframes'), { recursive: true });
  const info = probe(src);

  // 1. downscaled frames: motion energy, dissolve-aware cuts, palette
  const SW = 96,
    SH = Math.max(2, Math.round((SW * info.height) / info.width / 2) * 2);
  const sampleFps = Math.min(8, 960 / info.duration);
  const raw = run(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-i',
      src,
      '-vf',
      `fps=${sampleFps.toFixed(3)},scale=${SW}:${SH}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { encoding: 'buffer' }
  ).stdout;
  const fsz = SW * SH * 3,
    nf = Math.floor(raw.length / fsz);
  const fdiff = (a, b) => {
    let d = 0;
    for (let i = 0; i < fsz; i += 9)
      d += Math.abs(raw[a * fsz + i] - raw[b * fsz + i]);
    return d / (fsz / 9) / 255;
  };
  const d1 = Array.from({ length: nf }, (_, f) => (f ? fdiff(f, f - 1) : 0));
  const energy = nf > 1 ? d1.reduce((a, b) => a + b, 0) / (nf - 1) : 0;
  // compare frames ~0.3s apart so cross-dissolves register as one peak
  const gap = Math.max(1, Math.round(sampleFps * 0.3));
  const dg = Array.from({ length: nf }, (_, f) =>
    f >= gap ? fdiff(f, f - gap) : 0
  );
  // a peak must stand out from its local (~2s) baseline: text-on-dark dissolves are faint globally
  const win2 = Math.round(sampleFps);
  const localMed = f => {
    const w = dg
      .slice(Math.max(gap, f - win2), f + win2 + 1)
      .sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)] || 0;
  };
  const peakThr = f => Math.max(0.012, localMed(f) * 2.5);
  const diffCuts = [];
  for (let f = gap; f < nf; f++) {
    const win = dg.slice(Math.max(0, f - gap), f + gap + 1);
    if (dg[f] >= peakThr(f) && dg[f] === Math.max(...win))
      diffCuts.push(+((f - gap / 2) / sampleFps).toFixed(3));
  }
  const stride = Math.max(1, Math.floor(raw.length / 3 / 60000));
  const px = new Float32Array(Math.floor(raw.length / 3 / stride) * 3);
  for (let i = 0, j = 0; j < px.length; i += stride * 3, j += 3) {
    px[j] = raw[i];
    px[j + 1] = raw[i + 1];
    px[j + 2] = raw[i + 2];
  }
  // 2. cuts = ffmpeg hard-cut detector + dissolve peaks, merged within 0.5s
  const thr = +(flags.threshold || 0.3);
  const sc = run(
    'ffmpeg',
    [
      '-hide_banner',
      '-i',
      src,
      '-vf',
      `select='gt(scene,${thr})',showinfo`,
      '-an',
      '-f',
      'null',
      '-',
    ],
    { allowFail: true }
  );
  const hardCuts = [...sc.stderr.matchAll(/pts_time:([\d.]+)/g)].map(
    m => +(+m[1]).toFixed(3)
  );
  const cuts = [...hardCuts, ...diffCuts]
    .sort((a, b) => a - b)
    .filter(
      (t, i, a) =>
        t > 0.3 && t < info.duration - 0.3 && (i === 0 || t - a[i - 1] > 0.5)
    );
  const bounds = [0, ...cuts, info.duration];
  const shots = bounds
    .slice(0, -1)
    .map((s, i) => ({
      start: s,
      end: bounds[i + 1],
      duration: +(bounds[i + 1] - s).toFixed(3),
    }))
    .filter(s => s.duration > 0.05);
  const durs = shots.map(s => s.duration).sort((a, b) => a - b);
  const median = durs[Math.floor(durs.length / 2)];
  const avg = durs.reduce((a, b) => a + b, 0) / durs.length;

  // 3. keyframes at shot midpoints (max 24)
  const pick =
    shots.length > 24
      ? shots.filter((_, i) => i % Math.ceil(shots.length / 24) === 0)
      : shots;
  const kf = pick.map((s, i) => {
    const t = (s.start + s.end) / 2;
    const p = path.join(
      out,
      'keyframes',
      `shot-${String(i + 1).padStart(2, '0')}-${t.toFixed(2)}s.jpg`
    );
    run('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      t.toFixed(3),
      '-i',
      src,
      '-frames:v',
      '1',
      '-vf',
      'scale=960:-2',
      '-q:v',
      '3',
      p,
    ]);
    return rel(p);
  });
  const sheet = contactSheet(src, path.join(out, 'contact.png'), {
    cols: 4,
    rows: Math.min(4, Math.ceil(pick.length / 4)) || 3,
    times: pick.map(s => (s.start + s.end) / 2),
  });

  const clusters = kmeans(px, 10).map(c => ({
    ...c,
    hex: hex(c.rgb),
    hsl: hsl(c.rgb),
  }));

  const bgC = clusters[0];
  const dark = lum(bgC.rgb) < 0.2;
  const fgC = clusters
    .filter(c => c.share > 0.004 && c.hsl[1] < 0.35)
    .sort((a, b) => contrast(b.rgb, bgC.rgb) - contrast(a.rgb, bgC.rgb))[0] || {
    rgb: dark ? [245, 245, 250] : [15, 15, 20],
  };
  // accents: cluster only saturated, mid-light pixels so small accent areas survive
  const vp = [];
  for (let j = 0; j < px.length; j += 3) {
    const h = hsl([px[j], px[j + 1], px[j + 2]]);
    if (h[1] > 0.35 && h[2] > 0.22 && h[2] < 0.88)
      vp.push(px[j], px[j + 1], px[j + 2]);
  }
  const vivid =
    vp.length / 3 > 50
      ? kmeans(Float32Array.from(vp), 8)
          .filter(c => c.share > 0.02 && contrast(c.rgb, bgC.rgb) > 1.8)
          .map(c => ({ ...c, hsl: hsl(c.rgb) }))
          // brand accents are saturated and mid-light; big dim glows are not
          .map(c => ({
            ...c,
            score:
              Math.sqrt(c.share) *
              c.hsl[1] ** 2 *
              (1 - Math.abs(c.hsl[2] - 0.6)),
          }))
          .sort((a, b) => b.score - a.score)
      : [];
  const hueDist = (a, b) =>
    Math.min(
      Math.abs(a.hsl[0] - b.hsl[0]),
      360 - Math.abs(a.hsl[0] - b.hsl[0])
    );
  const acc = vivid[0];
  const acc2 = vivid.find(c => acc && hueDist(c, acc) > 28);
  const accent = acc ? acc.rgb : dark ? [124, 108, 255] : [255, 90, 31];
  const accent2 = acc2
    ? acc2.rgb
    : mix(accent, dark ? [255, 255, 255] : [255, 200, 0], 0.35);
  const vividShare = +(vp.length / px.length).toFixed(4);
  const palette = {
    bg: hex(bgC.rgb),
    bg2: hex(mix(bgC.rgb, fgC.rgb, 0.06)),
    fg: hex(fgC.rgb),
    muted: hex(mix(fgC.rgb, bgC.rgb, 0.45)),
    accent: hex(accent),
    accent2: hex(accent2),
  };

  // 4. map measurements -> motion tokens
  const tier = energy > 0.09 ? 'high' : energy > 0.035 ? 'medium' : 'low';
  const motion = {
    high: {
      wordStagger: 0.045,
      enter: 0.42,
      transitionDuration: 0.3,
      zoomDuration: 0.6,
      drift: 0.018,
    },
    medium: {
      wordStagger: 0.065,
      enter: 0.6,
      transitionDuration: 0.45,
      zoomDuration: 0.85,
      drift: 0.012,
    },
    low: {
      wordStagger: 0.09,
      enter: 0.85,
      transitionDuration: 0.7,
      zoomDuration: 1.2,
      drift: 0.008,
    },
  }[tier];
  if (median < 1.2) motion.transition = 'cut';
  const style = {
    name: path.basename(out),
    source: rel(src),
    palette,
    motion,
    background: dark ? 'aurora' : 'gradient',
    highlight: 'gradient',
  };
  writeJson(path.join(out, 'style.json'), style);
  const analysis = {
    source: rel(src),
    ...info,
    threshold: thr,
    pacing: {
      shots: shots.length,
      medianShot: +median.toFixed(2),
      avgShot: +avg.toFixed(2),
      cutsPerMinute: +((shots.length / info.duration) * 60).toFixed(1),
      energy: +energy.toFixed(4),
      tier,
    },
    suggestedSceneDuration: +Math.min(5, Math.max(1.2, median)).toFixed(1),
    palette,
    vividShare,
    accents: vivid.map(c => ({ hex: hex(c.rgb), share: +c.share.toFixed(3) })),
    clusters: clusters.map(c => ({
      hex: c.hex,
      share: +c.share.toFixed(3),
      sat: +c.hsl[1].toFixed(2),
      light: +c.hsl[2].toFixed(2),
    })),
    shots,
    keyframes: kf,
    contactSheet: rel(sheet.sheet),
  };
  writeJson(path.join(out, 'analysis.json'), analysis);
  console.log(
    JSON.stringify(
      {
        out: rel(out),
        style: rel(path.join(out, 'style.json')),
        contactSheet: rel(sheet.sheet),
        keyframes: kf.length,
        pacing: analysis.pacing,
        palette,
      },
      null,
      2
    )
  );
}

// ---------------------------------------------------------------- main
const [cmd, ...rest] = process.argv.slice(2);
const { pos, flags } = args(rest);
const commands = {
  new: () => cmdNew(pos[0]),
  analyze: () => cmdAnalyze(pos[0], flags),
  capture: () => cmdCapture(pos[0], flags),
  render: () => cmdRender(pos[0], flags),
  still: () => cmdStill(pos[0], pos.slice(1), flags),
  sheet: () => cmdSheet(pos[0], flags),
  palettes: () => {
    for (const f of fs.readdirSync(path.join(HERE, 'palettes')).sort()) {
      const s = readJson(path.join(HERE, 'palettes', f));
      console.log(
        `${f.replace('.json', '').padEnd(10)} ${s.palette.bg} ${s.palette.fg} ${s.palette.accent} ${s.palette.accent2}  ${s.description || ''}`
      );
    }
  },
};
if (!commands[cmd]) {
  console.log(
    fs
      .readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 13)
      .map(l => l.replace(/^\/\/ ?/, ''))
      .join('\n')
  );
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch(e => die(e.stack || e.message));
