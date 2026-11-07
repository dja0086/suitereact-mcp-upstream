# Prompt: brief → storyboard.json

Use this when turning a filled `brief.md` (or a one-line feature request) into
`storyboard.json`. Write the JSON directly; do not ask for approval of every scene.

## Narrative arc (pick the row for the requested length)

| Length | Scenes, in order                                                                        |
| ------ | --------------------------------------------------------------------------------------- |
| 15s    | title 2.6 → capture 5–6 → statement 2.4 → end 3                                         |
| 30s    | title 3 → statement (pain) 2.6 → capture 5–7 → capture split 4–5 → features 4 → end 3.2 |
| 45s    | 30s arc + one more capture beat + stat 3 before the end card                            |
| 60s    | 45s arc + a second statement between demo beats ("And it gets better.")                 |

Transitions overlap scenes by `motion.transitionDuration`, so the rendered length is
slightly shorter than the sum of durations; `still`/`render` print the real timeline.

## Copy rules (the look depends on them)

- Title `text`: product name only. `sub`: the promise, ≤ 8 words, sentence case, ends with a period.
- Statements: ≤ 7 words per line, max 2 lines (`\n`), exactly ONE `*highlight*` — the word that carries the meaning. Trailing punctuation goes outside the asterisks: `*spreadsheets*.`
- Captions on capture scenes: verb-first, ≤ 6 words, describe the outcome ("Load 18 customers in one click"), never the UI ("Click the button").
- Feature items: 3 items (2 or 4 allowed). `title` ≤ 3 words, `text` ≤ 8 words. Icons: single glyphs (⚡ ✓ ⇩ ⌕ ↻ ★ ◎), not multi-color emoji, so they read on the accent tile.
- Stat: only a number the user supplied or that is verifiable from the app. Never invent metrics.
- End card: product name, tagline, CTA verb phrase, URL or command.

## Mapping the demo to the capture

- Every user-visible action in the brief's demo flow is a capture step with a `mark`.
- A capture scene shows a window of the recording: `from: "@mark-1"` starts one second before the action so the cursor is seen travelling; end it with `until: "@nextmark-0.3"` or a `duration`.
- Zoom INTO the control just before it is clicked (`"at": "@mark-0.8", "rect": "@mark", "pad": 200–300`), then back out once the result renders (`"at": "@resultmark", "rect": "full"`). One zoom-in per scene; more feels seasick.
- Use `layout: "split"` (16:9) for the second demo beat so the copy can explain it; full-width for the hero beat.
- `speed: 1.5` tightens slow waits; keep ≤ 2.

## Matching a reference video

If `analyze` produced `analysis.json`:

- Use `suggestedSceneDuration` as the default text-scene duration and match `pacing.cutsPerMinute` within ±20% over the whole video.
- Point `style` at the generated `style.json`, then add `styleOverrides` for what you saw in the keyframes (see `prompts/style-from-reference.md`).
