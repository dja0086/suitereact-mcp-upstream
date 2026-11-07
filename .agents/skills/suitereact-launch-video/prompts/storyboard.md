# Prompt: brief to storyboard.json

Use this to turn a filled `brief.md`, or a one-line feature request, into `storyboard.json`. Write the JSON directly, then run `driver.mjs lint` on it.

## Narrative arc

Pick the row for the requested length. Durations are seconds.

| Length | Scenes, in order                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------- |
| 15s    | title 2.6, capture 5 to 6, statement 2.4, end 3                                                          |
| 30s    | title 3, statement (the task it replaces) 2.6, capture 5 to 7, split capture 4 to 5, features 4, end 3.2 |
| 45s    | the 30s arc plus one more capture beat, and a verified stat (3) before the end card                      |
| 60s    | the 45s arc plus a second statement between the demo beats                                               |

Transitions overlap scenes by `motion.transitionDuration`, so the rendered video is shorter than the sum of durations. `still` and `render` print the real timeline.

## Copy rules

The copy follows the [anti-slop-writing](../../anti-slop-writing/SKILL.md) rules in `marketing` mode; `lint` runs that scanner. On top of them:

- Title `text`: the product name. `sub`: what it does, 8 words or fewer, sentence case, ending with a period. No eyebrow label above the title.
- Statements: 7 words or fewer per line, 2 lines at most (`\n`). Name the task the product replaces, in the viewer's words.
- Highlight one word with `*word*` in 2 or 3 scenes per video, not in every scene. Trailing punctuation goes outside the asterisks: `*spreadsheets*.`
- Captions on capture scenes start with a verb, use 6 words or fewer, and describe the result (`Load 18 customers in one click`), never the UI (`Click the button`).
- Features: 3 items (2 or 4 allowed). `title` 3 words or fewer, `text` 9 words or fewer, each stating a mechanism. `icon` is a built-in line icon name: `table`, `grid`, `filter`, `search`, `download`, `check`, `clock`, `shield`, `zap`. No emoji or glyphs.
- Headings must fail the logo-swap test: a competitor's name should not fit. `Built for operators` fits any product; `One grid for customers, transactions and employees` does not.
- Stat: only a number the user supplied or you verified in the app, marked `"verified": true`. Without one, leave the stat scene out.
- End card: product name, a tagline, a CTA that names the action and its object (`Deploy Data Viewer`), and a URL or command.

## Mapping the demo to the capture

- Every user-visible action in the brief's demo flow is a capture step with a `mark`.
- A capture scene shows a window of the recording. `from: "@mark-1"` starts one second before the action so the cursor is seen moving; end with `until: "@nextmark-0.3"` or a `duration`.
- Zoom into the control 0.8 seconds before it is clicked (`"at": "@mark-0.8", "rect": "@mark", "pad": 200` to `300`), then back out once the result renders (`"at": "@resultmark", "rect": "full"`). One zoom-in per scene.
- Use `layout: "split"` (16:9) for the second demo beat so the copy can explain it; keep the first demo beat full width.
- `speed: 1.5` shortens slow waits; keep it at 2 or below.

## Matching a reference video

If `analyze` produced `analysis.json`:

- Use `suggestedSceneDuration` as the default text-scene duration, and match `pacing.cutsPerMinute` within 20% over the whole video.
- Point `style` at the generated `style.json`, then add `styleOverrides` for what you saw in the keyframes (see `prompts/style-from-reference.md`). The lint rules still apply: a reference with purple glows or gradient text becomes monochrome spotlight unless purple is the documented brand color.
