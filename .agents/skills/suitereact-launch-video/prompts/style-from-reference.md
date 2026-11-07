# Prompt: reference video to style.json

`analyze` measures palette, cuts and motion energy. Typography, text motion and the highlight treatment have to be read from the keyframes. After running `analyze`, Read `contact.png` and 3 or 4 files in `keyframes/`, then fill this table and write the answers into `style.json`, or into `styleOverrides` in the storyboard.

| Look for                                      | Set                                                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Heavy or regular headline weight              | `font.weightDisplay` 700 or 400; bundled faces are Bricolage Grotesque 700 and Instrument Serif 400                    |
| Tight or airy letter spacing                  | `font.tracking` from `-0.055em` to `-0.02em`                                                                           |
| Serif headlines                               | the `spotlight-serif` preset (upright only); other faces must appear in `fc-list : family` or be added to `font.files` |
| Words slide up from a hidden line             | `motion.text: "mask"`                                                                                                  |
| Words fade in from a blur                     | `motion.text: "blur"`                                                                                                  |
| Words scale in                                | `motion.text: "scale"`                                                                                                 |
| Sentence dimmed, one word lit                 | `highlight: "spotlight"`, with `palette.dim` for the dimmed words                                                      |
| Key word on a solid block                     | `highlight: "pill"`                                                                                                    |
| Key word underlined                           | `highlight: "underline"`                                                                                               |
| One soft light on a dark backdrop             | `background: "spotlight"`, `glow` 0.05 to 0.12                                                                         |
| Flat backdrop                                 | `background: "solid"`                                                                                                  |
| Hard cuts between shots                       | `motion.transition: "cut"`                                                                                             |
| Shots dissolve or push in                     | `"fade-zoom"`; sideways pushes: `"slide"`                                                                              |
| UI in a browser window, bare, or tilted in 3D | `frame.chrome: "browser"` or `"none"`; `frame.tilt` true or false; `frame.radius`                                      |
| Film grain                                    | `grain` 0 to 0.12                                                                                                      |

Gradient text, colored glow blobs, aurora and grid backgrounds were removed as AI-design tells; `lint` reports them as BAN. If the reference relies on them, use `spotlight` and say so in your report.

Correct the measured palette by eye. The extractor blends neighbouring hues, so if a keyframe clearly shows a brand color on a button or highlighted word, use that hex for `accent`. Keep one accent. `lint` checks contrast: 4.5:1 for `fg`, `muted` and `eyebrow`, 3:1 for `dim`.

Render `still` frames at 3 or 4 times and compare them side by side with the keyframes before rendering the full video.
