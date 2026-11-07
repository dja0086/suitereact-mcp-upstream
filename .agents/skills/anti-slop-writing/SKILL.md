---
name: anti-slop-writing
description: 'Writes, edits and reviews product marketing copy, launch-video scripts, landing pages, release notes, social posts and short fiction without AI-slop tells, then verifies them with a deterministic scanner. Use when asked to write, rewrite, de-slop, tighten, or review copy or creative writing, or before publishing any AI-drafted text.'
---

# Write without slop

**Usage:** `/anti-slop-writing <file or request> [--mode marketing|social|creative|docs] [--max-dashes N]`

Slop is text that reads like the average of everything a model has seen: hype verbs, dashes as punctuation, hedges, stock fiction phrases, templated structure. Readers rarely name it, but they trust the writing less. This skill drafts against explicit rules and then checks the result with a scanner, so "sounds human" is tested, not asserted.

## Procedure

1. **Pick the mode.** `social` for Reddit, LinkedIn and other short posts. It runs every `marketing` rule, then post-structure checks (hashtag piles, `Thoughts?` / `Agree?` closers, one-sentence-per-line posts, stacked questions, engagement bait). `marketing` for launch scripts, landing pages, release notes and storyboard copy. `creative` for fiction and personal essays. `docs` for READMEs, guides and specs. Default is `marketing`, which is what launch-video lint calls. Done when the mode is stated in your reply.
2. **Collect the facts before drafting.** Marketing and social posts need one concrete mechanism (what the product does, in its own nouns), one true number with its source, who it is for, and the action the reader takes. Fiction needs a point-of-view character, a specific place and one observed detail per scene. Ask for anything missing. If you must proceed, write a visible placeholder such as `[NUMBER: rows per page?]`, never an invented figure. Done when every claim traces to the user, the product or a placeholder.
3. **Draft to the rules** in [references/rules.md](references/rules.md). The short version:
   - Name the thing. Concrete nouns, numbers with units, the literal action (`the browser fetches the URL`, not `the request lands`).
   - No dash as punctuation, no emoji, no arrow glyphs, no exclamation stacks. A LinkedIn post may keep one dash and a Reddit post two, via `--max-dashes`. Copyright and trademark signs (`©` `®` `™`) are not emoji.
   - No hype vocabulary, hedges, assistant interjections (`Of course.` as its own sentence) or filler transitions. A clause such as `Of course, the downside is cost.` is ordinary prose.
   - One idea per sentence, sentences under about 20 words, varied lengths. Avoid `not X, but Y` and `It's not X, it's Y` contrasts, and three-item rhythms used for cadence.
   - Social: no hashtag pile, no `Thoughts?` or `Agree?` closer, no one-sentence-per-line post, no `So,` opener, no `real talk`.
   - Marketing: the logo-swap test must fail (a competitor's name must not fit), and CTAs name the action and its object (`Deploy Data Viewer`).
   - Fiction: show through observed detail and action; end on an image or action, not a moral; give names a reason.
     Done when the draft exists in a file.
4. **Scan and fix.** Fix every BAN, then decide each WARN (fix it, or keep it and say why):

   ```bash
   node .agents/skills/anti-slop-writing/scan.mjs <file-or-dir> --mode social --max-dashes 1
   ```

   Exit code 1 means a BAN remains. `--strict` also exits 1 when any WARN is present, and exits 0 when the scan is clean. `--json` gives machine-readable findings; `-` reads stdin. `--max-dashes N` allows N dashes per file (LinkedIn `1`, Reddit `2`). Omit it and every dash is a BAN. Curly apostrophes and quotes are folded before matching, so a paste from LinkedIn or Docs hits the same rules. JSON files (storyboards, copy decks) are scanned by string value; hashtag, closer, broetry and stacked-question checks run on text files. Done when the scan reports 0 BAN.

5. **Run the checks a scanner cannot.** Read the text aloud once. Then apply: the logo-swap test (marketing), the specificity test (every paragraph contains a noun or number only this subject has), rhythm (no run of same-length sentences, no reflexive triplets), and the ending (marketing ends on the action; fiction ends on an image). Done when each test passes or the miss is reported.
6. **Report.** Give the final text, the scan summary (`0 BAN, n WARN` with the WARNs you kept), and every placeholder still open.

## Voice

When writing for this user, match the plain engineering voice described in [references/voice.md](references/voice.md): declarative, specific, honest about limits.

## Notes

- The launch-video skill runs this scanner from `driver.mjs lint` on storyboard copy in `marketing` mode, so copy rules apply to videos too. `social` rules do not.
- The `unslop` npm package is a code duplicate/dead-code scanner, not a prose tool; the local `content-quality-editor` agent's description of it is wrong. Use `scan.mjs`.
- `references/rules.md` lists banned phrases inside code spans on purpose, so scanning the rulebook does not flag it. `test/cases.mjs` holds slop on purpose; it is not a prose file.
- Regression tests: `node .agents/skills/anti-slop-writing/test/run.mjs`
