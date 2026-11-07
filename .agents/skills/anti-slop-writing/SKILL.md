---
name: anti-slop-writing
description: 'Writes, edits and reviews product marketing copy, launch-video scripts, landing pages, release notes, social posts and short fiction without AI-slop tells, then verifies them with a deterministic scanner. Use when asked to write, rewrite, de-slop, tighten, or review copy or creative writing, or before publishing any AI-drafted text.'
---

# Write without slop

**Usage:** `/anti-slop-writing <file or request> [--mode marketing|creative|docs]`

Slop is text that reads like the average of everything a model has seen: hype verbs, em dashes, hedges, stock fiction phrases, templated structure. This skill drafts against explicit rules, checks the draft with a scanner, then applies the checks a scanner cannot make.

## The scanner

`scan.mjs` sits in this skill's directory, the folder that holds this `SKILL.md`. In this repository that is `.agents/skills/anti-slop-writing/`; run it from the repository root:

```bash
node .agents/skills/anti-slop-writing/scan.mjs <file-or-dir> --mode marketing
```

- The last line of output is always `<mode>: N BAN, M WARN`. If that line is missing, the scan did not run (for example, a wrong path makes Node exit 1 with `Cannot find module`). Do not read a missing summary as a result.
- Exit codes: 0 clean, 1 a BAN remains (or any finding with `--strict`), 2 usage error or missing file.
- `-` reads stdin; `--json` gives machine-readable findings. JSON files (storyboards, copy decks) are scanned by string value.
- Skipped: code fences, inline code, shell commands such as `npm run deploy:app -- data-viewer`, and licence files. A command can stay as plain text in a post; it is not read as a dash.
- A clean scan covers patterns only. The judgment rules in [references/rules.md](references/rules.md) still apply.

## Procedure

1. **Pick the mode and the task type.** Mode: `marketing` (launch scripts, landing pages, social posts, release notes, storyboard copy), `creative` (fiction, personal essays), or `docs` (READMEs, guides, specs). Task type: write from scratch, or rewrite an existing draft. Done when both are stated in your reply.

2. **Collect the material.**
   - **Marketing and docs, from scratch.** Gather what the copy can draw on: what the product does in its own nouns, one true number with its source, who it is for, and the action the reader takes. These are facts to look for, not slots to fill: if no number exists, write without one. Ask for what is missing. If nobody can answer, use a visible placeholder such as `[NUMBER: rows per page?]` only where the copy needs the fact.
   - **Marketing and docs, rewriting.** Keep only the claims the original makes that the facts support. Delete unsupported claims. Do not add claims or placeholders for things the original never said.
   - **Fiction, from scratch.** Invented detail is allowed; it is a decision, not a claim. Decide the point-of-view character, the place and one observed detail per scene. Real-world facts (a real town's geography, a date, a trade practice) must be right or flagged in the report as unchecked.
   - **Fiction, rewriting someone else's piece.** Keep their events, point of view and ending's direction. Stay within 20% of the original length. Replace each cliché with a specific detail; change a name only when the name itself is the tell. List every detail you invented.
     Done when you know which facts you hold, which you invented, and which are placeholders.

3. **Draft to the rules** in [references/rules.md](references/rules.md). The short version:
   - Name the thing: concrete nouns, numbers with units, the literal action (`the browser fetches the URL`, not `the request lands`).
   - No dash as punctuation, no emoji, no arrow glyphs, no exclamation stacks.
   - Marketing and docs: no hype vocabulary, hedges, assistant openers or filler transitions. One idea per sentence, sentences under about 20 words. CTAs name the action and its object (`Deploy Data Viewer`). The logo-swap test must fail: a competitor's name must not fit a headline.
   - Fiction: show through observed detail and action, not named emotion; dialogue tags are `said` and `asked`; end on an image or an action, not a moral; give names a reason.
   - Everywhere: avoid "not X, but Y" contrasts and three-item lists used for rhythm.
     Done when the draft is saved to a file.

4. **Scan and fix.** Run the scanner in the chosen mode. Fix every BAN. For each WARN, fix it or keep it and say why. Done when the summary line reads `<mode>: 0 BAN, …`.

5. **Run the checks the scanner cannot make.**
   - **Claim trace** (marketing, docs): list each factual claim and its source (the user, the product, or a placeholder). Delete anything inferred: "hosted inside NetSuite" does not support "no server to run".
   - **Rhythm:** count the words in each sentence. Rewrite any run of three sentences within two words of the same length, and any reflexive triplet.
   - **Specificity:** every paragraph contains a noun or number only this subject has. In marketing, re-read each headline with a competitor's name in it.
   - **Edges:** read the first and last sentence alone. The opening states what the thing is or does (marketing) or puts the reader in a place (fiction). The ending is the action (marketing) or an image (fiction).
     Done when each check passes or the miss is reported.

6. **Report.** Give the final text; the scan summary line exactly as printed, with each WARN you kept and why; the claim trace or the list of invented details; and the status: **final**, or **draft with N open placeholders** when any placeholder remains. A text with an open placeholder is never final.

## Channels

- **Plain-text social posts** (LinkedIn, X, Slack): no Markdown, since backticks, asterisks and `#` headings appear as typed characters. Short paragraphs separated by blank lines; the link last; at most three hashtags, at the end, only if the requester uses them. No emoji.
- **Landing pages and videos:** one idea per section or scene. Highlight one word in a headline at most two or three times per page or video.

## Voice

[references/voice.md](references/voice.md) describes the skill owner's voice: declarative, specific, honest about limits. It is the default for marketing and docs written for the owner (`dja0086`). For anyone else, match the requester's own writing if they share some; otherwise use the rules above. The voice file does not govern fiction, where sentence length and register follow the story.

## Notes

- The [suitereact-launch-video](../suitereact-launch-video/SKILL.md) skill runs this scanner from `driver.mjs lint` on storyboard copy.
- The `unslop` npm package is a code duplicate/dead-code scanner, not a prose tool.
- `references/rules.md` lists banned phrases inside code spans on purpose, so scanning this skill does not flag its own rulebook.
