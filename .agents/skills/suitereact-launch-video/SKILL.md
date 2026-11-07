---
name: suitereact-launch-video
description: 'Builds product launch videos for SuiteReact apps: analyze a reference video into a style (palette, pacing, keyframes), capture a scripted demo of a running app with mocked data, write a storyboard from a feature request or script, and render an MP4 (16:9, 1:1, 4:5, 9:16). Use when asked to make, render, capture, restyle, or screenshot a launch, demo, promo, or feature video.'
---

# Make a launch video

**Usage:** `/suitereact-launch-video <app-name> "<feature or script>" [--format 9:16] [--style <preset|reference.mp4>]`

Everything runs through one driver. Paths below are relative to the repository root:

```bash
node .agents/skills/suitereact-launch-video/driver.mjs
```

| Command                                                               | Does                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `new <slug>`                                                          | Scaffolds `.launch-video/<slug>/` with `brief.md`, `capture.json`, `storyboard.json`                                      |
| `analyze <ref.mp4> [--out dir]`                                       | Reference video → `style.json`, `analysis.json` (cuts, pacing, palette), `contact.png`, `keyframes/`                      |
| `capture <capture.json>`                                              | Drives the running app, records timestamped hi-DPI frames, cursor path, and `mark`s; writes `preview.mp4`                 |
| `still <storyboard.json> <t> [t…] [--scale 0.5]`                      | PNG frames at given seconds → `out/stills/` (≈2 s; use for every iteration)                                               |
| `render <storyboard.json> [--draft] [--from s] [--to s] [--format f]` | MP4 → `out/<name>.mp4`. Full 1080p ≈ 3.5× realtime; `--draft` renders half-size ≈ 1.3× realtime                           |
| `sheet <video.mp4> [--cols 4 --rows 3]`                               | Timestamped contact sheet PNG to review a render in one image                                                             |
| `lint <storyboard.json>`                                              | Contrast, removed slop styles, emoji icons, highlight count, unverified stats, and the anti-slop copy scan. Exit 1 on BAN |
| `palettes`                                                            | Lists style presets: `spotlight` (default), `spotlight-serif`, `paper`                                                    |

`.launch-video/` is git-ignored. Commit only skill changes, never captures or renders.

## Procedure

1. **Brief.** Scaffold a project and fill `brief.md` from the request. A one-line ask ("launch video for the new filters in data-viewer") is enough; propose the remaining fields yourself and fill the demo flow from the app's UI.

   ```bash
   node .agents/skills/suitereact-launch-video/driver.mjs new <slug>
   ```

2. **Style.** Choose a preset, or match a reference video the user supplies (download it into `.launch-video/reference/` first):

   ```bash
   node .agents/skills/suitereact-launch-video/driver.mjs analyze .launch-video/reference/ref.mp4 --out .launch-video/reference/ref
   ```

   Then Read `contact.png` and a few `keyframes/*.jpg`, and complete the style by eye using [prompts/style-from-reference.md](prompts/style-from-reference.md). The measured palette is a starting point, because the extractor blends neighbouring hues.

3. **Capture.** Start the app UI-only and record the demo flow (see [Capture spec](#capture-spec)):

   ```bash
   npm run dev -- <app-name>
   ```

   ```bash
   node .agents/skills/suitereact-launch-video/driver.mjs capture .launch-video/<slug>/capture.json
   ```

   Check the printed `marks`, then Read `captures/<name>/error.png` on failure, or run `sheet` on `preview.mp4` on success.

4. **Storyboard.** Write `storyboard.json` from the brief following [prompts/storyboard.md](prompts/storyboard.md) (arc, copy rules, zoom placement). If the user gave a script, use their lines verbatim as statements and captions.

5. **Lint.** Fix every BAN and decide each WARN before rendering. The copy check is the [anti-slop-writing](../anti-slop-writing/SKILL.md) scanner in `marketing` mode:

   ```bash
   node .agents/skills/suitereact-launch-video/driver.mjs lint .launch-video/<slug>/storyboard.json
   ```

6. **Iterate on stills.** Render 4 to 8 key moments and Read them. Fix copy, timing, and zooms until each frame looks intentional:

   ```bash
   node .agents/skills/suitereact-launch-video/driver.mjs still .launch-video/<slug>/storyboard.json 1.6 4.4 6.5 13 17 21 24
   ```

7. **Render**, then review the result with a contact sheet:

   ```bash
   node .agents/skills/suitereact-launch-video/driver.mjs render .launch-video/<slug>/storyboard.json
   ```

   ```bash
   node .agents/skills/suitereact-launch-video/driver.mjs sheet .launch-video/<slug>/out/storyboard.mp4
   ```

8. **Stop** the dev session: `npm run dev:stop -- <app-name>`. Report the MP4 path, its duration, and anything unverified (for example "stat value supplied by user").

A complete worked example is in [examples/data-viewer/](examples/data-viewer/), with `capture.json`, `mock.mjs`, and `storyboard.json`. To reproduce it:

```bash
mkdir -p .launch-video && cp -r .agents/skills/suitereact-launch-video/examples/data-viewer .launch-video/data-viewer
```

```bash
printf 'VITE_PROXY_SERVER_BASE_URL=http://localhost:3001\nVITE_PROXY_SERVER_TOKEN=demo-capture\n' > apps/data-viewer/.env.development.local
```

```bash
npm run dev -- data-viewer
```

```bash
node .agents/skills/suitereact-launch-video/driver.mjs capture .launch-video/data-viewer/capture.json
```

```bash
node .agents/skills/suitereact-launch-video/driver.mjs render .launch-video/data-viewer/storyboard.json
```

## Capture spec

```jsonc
{
  "name": "customers", // → captures/customers/
  "url": "http://127.0.0.1:5173/", // the Vite URL that `npm run dev` reported
  "displayUrl": "netsuite.com/app/…", // shown in the rendered browser chrome
  "viewport": [1440, 900],
  "deviceScaleFactor": 2,
  "mock": {
    "pattern": "**/api/handle-action",
    "module": "mock.mjs",
    "delay": 450,
  },
  "steps": [
    { "waitFor": "text=Data Viewer" },
    {
      "click": "main >> role=button[name='Load data']",
      "mark": "load",
      "ms": 900,
    },
    {
      "type": ["input[placeholder='Search loaded rows']", "Northwind"],
      "mark": "search",
    },
    { "hover": "text=Fabrikam Robotics", "pause": 600 },
    { "scroll": 400 },
    { "press": "Escape" },
    { "wait": 900 },
    { "markRect": ["grid", "role=grid"] }, // mark an element's rect without interacting
  ],
}
```

A step's `mark` records the time and, for `click`/`hover`/`type`, the element's rect. In the storyboard, `"from": "@load-1.2"`, `"until": "@filters-0.4"`, `"at": "@load-0.8"`, and `"rect": "@load"` resolve against these marks. Moves are eased over `ms` milliseconds. The cursor is drawn at render time from the recorded path, with a ripple on each click.

**Demo data:** `mock` routes matching requests to `module`'s default export `({ url, method, body }) => json | undefined` (`undefined` passes the request through). SuiteReact apps only send `/api/handle-action` when the dev proxy URL is configured, so create `apps/<app>/.env.development.local` with `VITE_PROXY_SERVER_BASE_URL=http://localhost:3001` (git-ignored) and restart `npm run dev`. No proxy needs to run and no NetSuite account is touched. Return the shape the action returns; `getTableRowsFromSuiteql` returns `{ headers, rows }`.

## Storyboard scenes

Shared fields are `type`, `duration` (seconds), and `transition: "cut"` (optional per scene). In text, `*word*` marks the one highlighted word and `\n` breaks a line.

| type        | Fields                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`     | `eyebrow`, `text`, `sub`, `size`                                                                                                                                                                                                     |
| `statement` | `text`, `sub`, `size`                                                                                                                                                                                                                |
| `capture`   | `src` (capture dir), `from`, `until` or `duration`, `speed`, `caption`, `captionAt`, `zoom: [{at, rect: [x,y,w,h] \| "@mark" \| "full", pad, dur}]`, `layout: "split"` + `eyebrow`/`heading`/`text`, `cursor: false`, `url`, `width` |
| `features`  | `heading`, `size`, `items: [{icon, title, text}]` (icons: `table`, `grid`, `filter`, `search`, `download`, `check`, `clock`, `shield`, `zap`), `stagger`                                                                             |
| `stat`      | `value`, `verified`, `from`, `prefix`, `suffix`, `label`, `countDuration`, `eyebrow`                                                                                                                                                 |
| `end`       | `logo`, `text`, `sub`, `cta`, `url`                                                                                                                                                                                                  |

Top level: `style` (preset name or path to a `style.json`), `styleOverrides` (deep-merged), `format` (`16:9`, `1:1`, `4:5`, `9:16`), `fps`, `brand: {name, logo}` (corner mark on body scenes), and `music: {src, volume, fadeOut, start}`. Music must be a track the user owns or has licensed; the driver never fetches audio.

## Style tokens

`palette {bg, bg2, fg, muted, dim, accent, accent2, onAccent, eyebrow, chrome, frameGlow}` · `font {display, body, mono, weightDisplay, tracking, trackingSmall, leading, scale, files: [{family, src, weight}]}` · `motion {ease: expo|quint|cubic|back|inout, text: mask|blur|scale, wordStagger, enter, drift, transition: fade-zoom|fade|slide|cut, transitionDuration, zoomDuration}` · `highlight: spotlight|underline|pill` · `background: spotlight|solid` · `glow`, `grain`, `vignette` · `cornerMark` · `frame {radius, chrome: browser|none, tilt}` · `brandPurple`. Defaults are in `DEFAULT_STYLE` in `driver.mjs`. Bundled OFL fonts in `fonts/` (Bricolage Grotesque, Instrument Sans, Instrument Serif upright) load through `font.files` with paths relative to the skill; other families must appear in `fc-list : family`.

## Design rules

The defaults avoid the AI-design tells listed in the starred `devsloka-anti-slop` checklist and the local `frontend-design` skill: no purple or gradient text, no aurora or glow-blob backgrounds, no emoji icons, no row of identical cards, no tracked all-caps eyebrows, no arrow on buttons, and one rationed highlight device. Those code paths were removed, and `lint` reports them as BAN if a style asks for them. Purple accents pass only with `"brandPurple": true` for a documented brand color.

## Gotchas

- **Playwright browser mismatch.** The repo pins a newer Playwright than the container's pre-installed Chromium. `launch()` fails with "Executable doesn't exist … chromium_headless_shell-1248". The driver retries with `/opt/pw-browsers/chromium` (override with `LAUNCH_VIDEO_CHROME`) and prints `[info] playwright browser build missing`. Do not run `playwright install`.
- **CDP screencast ignores `deviceScaleFactor`.** Frames arrive at CSS size (1440 px) even with a 2× context, which makes zoom-ins soft. The driver launches with `--force-device-scale-factor=<dsf>` to get 2880 px frames. Captures are about 2.5 MB/s of recording.
- **Screencast emits only on change.** A static page yields one frame, which is expected. The renderer holds the latest frame at or before each timestamp.
- **MUI search inputs have no accessible name**: `role=textbox[name='Search loaded rows']` timed out; `input[placeholder='Search loaded rows']` works. Capture errors name the failing step (`step 4 {…}`).
- **`text=` selectors match substrings.** `text=Load data` matched the paragraph "…Load data to query NetSuite." before the button, so the click did nothing and the capture timed out waiting for data. Use `role=button[name='…']`.
- **Apps fail to resolve `suitereact` on a fresh clone.** Vite shows `Failed to resolve entry for package "suitereact"`. Build the library first. `npm run build:suitereact` runs format and lint-fix over the library, and `tsc`/`vite build` ran out of the default heap here, so build directly: `cd suitereact && NODE_OPTIONS=--max-old-space-size=8192 npx tsc && NODE_OPTIONS=--max-old-space-size=8192 npx vite build`.
- **Without `.env.development.local`, `handleRestletAction` falls back to hosted `REST.post`**, and the request never reaches the mock. Restart `npm run dev` after creating the file.
- **Rendered length is less than the sum of scene durations.** Scenes overlap by `transitionDuration`. Read the `timeline` that `still`/`render` print before placing stills.
- **Dissolves defeat ffmpeg scene detection.** `analyze` adds frame-difference peaks against a local baseline. On a 7-scene self-test it found all 6 transitions plus 2 in-scene motion beats. Treat extra cuts as rhythm, not as an error.
- **Mid-animation stills look broken** (half-revealed words, pills mid-wipe). Before judging, check `lt = t - scene.start` against `motion.enter`.
- **Network:** link shorteners and social hosts (for example `lnkd.in`) may be outside the session allowlist. Ask the user to drop the reference MP4 into the repo instead.

## Troubleshooting

| Symptom                                                           | Fix                                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `capture`: `locator.waitFor: Timeout … exceeded` + `error.png`    | Read `error.png`. Usually a substring `text=` selector or a mock that never matched; rerun with `DEBUG=1` to log requests  |
| `capture "x" has no mark "y"`                                     | Marks are case-sensitive; the error lists the existing marks                                                               |
| `mark @x has no element rect`                                     | That step had no element; use `click`/`hover`/`type` or `markRect`                                                         |
| `Failed to resolve entry for package "suitereact"` in the capture | Build the shared library (see Gotchas), then restart `npm run dev`                                                         |
| `[info] playwright browser build missing; using …`                | Expected in this container; not an error                                                                                   |
| `[warn] fonts not installed, Chromium will fall back: …`          | Use a family listed by `fc-list : family`, or bundle the font and list it in `font.files`                                  |
| `style "midnight" not found`                                      | `midnight`, `daylight`, `harbor` and `volt` were removed as AI-design tells; use `spotlight`, `spotlight-serif` or `paper` |
| `lint`: `BAN contrast: palette.dim … needs 3:1`                   | Lighten `dim` on dark backgrounds or darken it on light ones until the ratio passes                                        |
