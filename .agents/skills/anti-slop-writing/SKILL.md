---
name: anti-slop-writing
description: 'Writes, edits and reviews product marketing copy, launch-video scripts, landing pages, release notes, social posts and short fiction without AI-slop tells, then verifies them with a deterministic scanner. Use when asked to write, rewrite, de-slop, tighten, or review copy or creative writing, or before publishing any AI-drafted text.'
---

# Write without slop

**Usage:** `/anti-slop-writing <file or request> [--mode marketing|creative|docs]`

Slop is text that reads like the average of everything a model has seen: hype verbs, em dashes, hedges, stock fiction phrases, templated structure. This skill drafts against explicit rules, checks the draft with a scanner, then applies the checks a scanner cannot make.

## The scanner

`scan.mjs` sits in `<skill-dir>`, the folder that holds this `SKILL.md`. In this repository that is `.agents/skills/anti-slop-writing`; run it from the repository root:

```bash
node .agents/skills/anti-slop-writing/scan.mjs <file-or-dir> --mode marketing --rhythm
```

| Option                                 | Use                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `--mode marketing \| creative \| docs` | Which rule set runs. Default `marketing`.                                                                           |
| `--channel social`                     | For plain-text posts (LinkedIn, X, Slack): BANs Markdown, which those channels show as typed characters.            |
| `--rhythm`                             | Prints words per sentence for each paragraph and WARNs on flat runs. Use it for step 5 instead of counting by hand. |
| `--json`, `--strict`, `-`              | Machine-readable output; fail on WARN too; read stdin.                                                              |

- The last line is always `<mode>: N BAN, M WARN`. If it is missing, the scan did not run (a wrong path makes Node exit 1 with `Cannot find module`). Never read a missing summary as a result.
- Exit codes: 0 clean, 1 a BAN remains (or any finding with `--strict`), 2 usage error or missing file.
- Skipped: code fences, inline code, licence files, and CLI commands whose arguments carry a flag, path or colon (`npm run deploy:app -- data-viewer`). Prose after a command is still read, so `go and unlock` in a sentence is caught.
- A clean scan covers patterns only. The judgment rules in [references/rules.md](references/rules.md) still apply.

## Procedure

1. **Pick the mode, the task type and the channel.** Mode: `marketing` (launch scripts, landing pages, social posts, release notes, storyboard copy), `creative` (fiction, personal essays) or `docs` (READMEs, guides, specs). Task type: write from scratch, or rewrite an existing draft. Channel: where the text will appear (plain-text post, web page, video, document). Done when all three are stated in your reply.

2. **Collect the material.**
   - **Marketing and docs, from scratch.** Gather what the copy can draw on: what the product does in its own nouns, one true number with its source, who it is for, and the action the reader takes. These are facts to look for, not slots to fill: if no number exists, write without one. Ask for what is missing. If nobody can answer, use a visible placeholder such as `[NUMBER: rows per page?]` only where the copy needs the fact. If the requested length needs more than the facts support, write to the facts and report the shortfall; never pad with inferred claims.
   - **Marketing and docs, rewriting.** The original draft is a source. Keep its claims that the facts (or the draft itself, when it is the only source) support, and delete the rest. You may restate a supported claim with the facts behind it ("access to your NetSuite data" becomes the record types shown) and replace a generic CTA with the named action. Do not add features, claims or placeholders the original never had. Check the draft's claims against each other: flag contradictions, and sentences a reader would take as comparisons the draft does not back. List context the audience needs but the draft omits (the platform's name, a link) as questions for the author, not edits.
   - **Fiction, from scratch.** Invented detail is allowed; it is a decision, not a claim. Decide the point-of-view character, the place and one observed detail per scene. Real-world facts (a real town's geography, a date, a trade practice) must be right or listed in the report as unchecked.
   - **Fiction, rewriting someone else's piece.** Keep their events (what happens on the page), point of view and the direction of the ending. A narrator's forecast or moral ("this night would change everything", "some doors are meant to stay closed") is not an event: turn it into an action or image that points the same way, or cut it and say so. Stay within 20% of the original word count. Replace each cliché with a specific detail. Change a name the scanner flags; take the new name's reason from the original's setting, or, if it has none, choose a plain name that suggests no genre and say so. List every detail you invented.
     Done when you know which facts you hold, which you invented, and which are placeholders.

3. **Draft to the rules** in [references/rules.md](references/rules.md). The short version:
   - Name the thing: concrete nouns, numbers with units, the literal action (`the browser fetches the URL`, not `the request lands`).
   - No dash as punctuation, no emoji, no arrow glyphs, no exclamation stacks.
   - Marketing and docs: no hype vocabulary, hedges, assistant openers or filler transitions. One idea per sentence, sentences under about 20 words. CTAs name the action and its object (`Deploy Data Viewer`).
   - Fiction: show through observed detail and action, not named emotion; dialogue tags are `said` and `asked`; end on an image or an action, not a moral; give names a reason. Show cut-off speech with a dash before the closing quote (`"Wait—" she said`); nowhere else.
   - Everywhere: avoid "not X, but Y" contrasts and three-item lists kept for sound (`cold, dark, and silent`). A complete literal set (`customers, transactions and employees`) and three actions in the order they happen are not triplets.
     Done when the draft is saved to a file.

4. **Scan and fix.** For a rewrite, scan the original first. Then scan the draft in the chosen mode, with `--channel social` for plain-text posts and `--rhythm` always. Fix every BAN. For each WARN, fix it or keep it and say why; a `fiction-cliche-word` WARN on a literal use (a woven tapestry, a medical exam) may stay. Done when the summary line reads `<mode>: 0 BAN, …`.

5. **Run the checks the scanner cannot make.** Each check passes, or its miss goes in the report; never make a text worse to pass a check.
   - **Claim trace** (marketing, docs): list each factual claim and its source: the user, the original draft, the product, or a placeholder. Delete anything inferred: "hosted inside NetSuite" does not support "no server to run".
   - **Rhythm:** read the `--rhythm` output. Within one paragraph, vary any three sentences in a row whose longest and shortest differ by two words or fewer. A paragraph break resets the count; a command or link line is not a sentence; a line of dialogue and its tag count as one. If varying a run would push a sentence past 20 words or change its meaning, leave it and report it.
   - **Specificity:** every paragraph that describes the product contains a noun or number only this product has (a UI element, a record it reads, a command); the product's name does not count. A paragraph that sets up the reader's problem uses the reader's own nouns instead. In fiction, apply this per scene.
   - **Logo-swap** (marketing): if a competitor's name fits a headline that makes a claim about the product, rewrite it with the least-shared fact you hold; if no such fact exists, report the headline as generic. A headline that states the reader's problem is exempt, but the product's name or mechanism must appear within the first three sentences.
   - **Edges:** read the first and last sentence alone. The opening states what the thing is or does, or asks the concrete question the product answers in the reader's own nouns (`What came before this order?`); a template hook (`Ever wondered`, `What if`, `Tired of`) never qualifies. In fiction the opening puts the reader in a place. The ending is the reader's action; if the material holds no action (nothing to open, install or sign up for), end on the plainest status or limit. Never invent a call to action. Fiction ends on an image or an action.
     Done when each check passes or its miss is written down for the report.

6. **Report.** Give, in this order:
   - the final text, exactly as it will be published;
   - the scan summary lines exactly as printed (original and final for a rewrite), with each WARN kept and why;
   - the step-5 results, one line per check, with each miss;
   - for marketing and docs, the claim trace and any questions for the author; for fiction, the step-2 decisions, every invented detail, and each real-world fact marked checked (with its source) or unchecked;
   - for a rewrite, a change list: original text, new text, and the rule or check that justifies it; and the sentences deliberately left unchanged;
   - the status: **final**, or **draft with N open placeholders**. Open placeholders block final; unchecked fiction facts and reported step-5 misses do not.

## Channels

- **Plain-text social posts** (LinkedIn, X, Slack): no Markdown (scan with `--channel social`). Short paragraphs separated by blank lines. If the post asks the reader to go somewhere, the link goes last; if the post needs one and none is known, use `[LINK: …]`. At most three hashtags, at the end, only if the requester uses them. No emoji. Straight quotes are fine here.
- **Web pages, documents, video captions:** curly quotes and the ellipsis character. One idea per section or scene; highlight one word in a headline at most two or three times per page or video.

## Voice

[references/voice.md](references/voice.md) describes the skill owner's voice (`dja0086`): declarative, specific, honest about limits. Treat a request as the owner's when it names their products (Record Trace, Data Viewer, SuiteReact) or comes from their repositories. It is the default when writing for the owner from scratch. When rewriting the owner's own draft, the draft's voice wins where it differs from voice.md, which is drawn from READMEs rather than posts. For anyone else, match the requester's own writing if they share some; otherwise use the rules alone. The voice file does not govern fiction.

## Notes

- The [suitereact-launch-video](../suitereact-launch-video/SKILL.md) skill runs this scanner from `driver.mjs lint` on storyboard copy.
- The `unslop` npm package is a code duplicate/dead-code scanner, not a prose tool.
- `references/rules.md` lists banned phrases inside code spans on purpose, so scanning this skill does not flag its own rulebook.
