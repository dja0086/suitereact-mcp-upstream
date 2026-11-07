# Prompt: reference video → style.json

`analyze` measures what can be measured (palette, cuts, motion energy). Typography,
text motion and highlight treatment have to be read from the keyframes. After running
`analyze`, Read `contact.png` and 3–4 files in `keyframes/`, then fill this table and
write the answers into `style.json` (or `styleOverrides` in the storyboard).

| Look for                                           | Set                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Headline weight: heavy/black vs regular            | `font.weightDisplay` 900 / 800 / 600                                                           |
| Tight, overlapping letters vs airy                 | `font.tracking` `-0.055em` … `-0.02em`                                                         |
| Serif or mono headlines                            | `font.display` — must be in `fc-list : family` (Inter Display, JetBrains Mono, DejaVu Serif …) |
| Words slide up from a hidden line                  | `motion.text: "mask"`                                                                          |
| Words fade in from a blur                          | `motion.text: "blur"`                                                                          |
| Words pop/scale                                    | `motion.text: "scale"`                                                                         |
| Key word in a different color                      | `highlight: "gradient"` (two accents) — single solid color: set `accent2` = `accent`           |
| Key word on a colored block                        | `highlight: "pill"`                                                                            |
| Key word underlined                                | `highlight: "underline"`                                                                       |
| Soft colored glows behind text                     | `background: "aurora"`, `glow` 0.2–0.4                                                         |
| Thin grid lines                                    | `background: "grid"`                                                                           |
| Flat backdrop                                      | `background: "solid"` (or `"gradient"` for a subtle top-to-bottom shift)                       |
| Hard cuts between shots                            | `motion.transition: "cut"`                                                                     |
| Shots dissolve / push in                           | `"fade-zoom"`; sideways pushes → `"slide"`                                                     |
| UI shown in a browser window / bare / tilted in 3D | `frame.chrome: "browser"` or `"none"`; `frame.tilt` true/false; `frame.radius`                 |
| Film grain / texture                               | `grain` 0–0.12                                                                                 |

Correct the measured palette by eye: the extractor blends adjacent hues, so if a
keyframe clearly shows a brand color (button, highlighted word), use that hex for
`accent` instead. Keep `bg`/`fg` from the measurement unless they are obviously wrong.

Render `still` frames at 3–4 times and compare them side-by-side with the keyframes
before rendering the full video.
