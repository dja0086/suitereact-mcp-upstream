#!/usr/bin/env node
// Deterministic AI-slop scanner for product marketing, fiction and docs.
//
//   node scan.mjs <file|dir|-> [...] [--mode marketing|creative|docs] [--json] [--strict]
//
// Scans .md/.mdx/.txt/.html files and the string values of .json files.
// Skips code fences, inline code, shell commands and licence files.
// Curly quotes and apostrophes are normalized before matching.
// Exit codes: 0 clean, 1 a BAN remains (or a WARN with --strict), 2 usage error.
// The last line of output is always "<mode>: N BAN, M WARN"; if it is missing,
// the scan did not run. Rule sources are in references/rules.md.
import fs from 'node:fs';
import path from 'node:path';

const W = s => new RegExp(`\\b(?:${s})\\b`, 'giu');
const P = s => new RegExp(s, 'giu');
const MKT_DOCS = 'marketing,docs';

// [id, severity, modes ('*' = all), regex, message]
const RULES = [
  // ---- punctuation and glyphs (all modes) ----
  // A dash between words, after closing quotes, or opening a line of dialogue is punctuation.
  // A lone dash in an empty table cell is not.
  [
    'em-dash',
    'BAN',
    '*',
    P(
      '(?<=[\\p{L}\\p{N}.,;:)"\'*?!])\\s?—\\s?(?=[\\p{L}\\p{N}("\'*])|^\\s*—\\s?(?=[\\p{L}"\'])|(?<=\\p{L})\\s–\\s(?=\\p{L})|(?<=\\p{L})\\s--\\s(?=\\p{L})'
    ),
    'Dash used as punctuation. Use a period, comma, colon or parentheses.',
  ],
  [
    'emoji',
    'BAN',
    'marketing,creative',
    P('\\p{Extended_Pictographic}'),
    'Emoji in copy. Use words, or a real icon in the design.',
  ],
  [
    'emoji-docs',
    'WARN',
    'docs',
    P('\\p{Extended_Pictographic}'),
    'Emoji in prose. Fine as a status mark in a table; otherwise use words.',
  ],
  [
    'arrow-glyph',
    'BAN',
    'marketing',
    P('[→↗➜➡]|->(?=\\s|$)'),
    'Arrow glyph appended to copy or CTA.',
  ],
  [
    'middle-dot-meta',
    'WARN',
    'marketing',
    P('\\S+ [·•] \\S+ [·•] \\S+'),
    'Meta string joined with middle dots (A · B · C). Write a sentence or a list.',
  ],
  [
    'three-dots',
    'WARN',
    'docs',
    P('(?<!\\.)\\.\\.\\.(?!\\.)'),
    'Three periods. Use the ellipsis character, or cut the trailing-off.',
  ],
  [
    'exclamation-stack',
    'WARN',
    '*',
    P('!{2,}|![^.!?\\n]*!'),
    'More than one exclamation mark nearby.',
  ],

  // ---- assistant voice and hedging ----
  [
    'sycophant-opener',
    'BAN',
    MKT_DOCS,
    P(
      '(?:^|[.!?]\\s+)(?:great question|certainly|absolutely|of course|i hope this helps|happy to help)\\b'
    ),
    'Assistant-voice opener or closer.',
  ],
  [
    'hedge-stack',
    'BAN',
    '*',
    W(
      "it(?:'s| is) (?:worth|important to) (?:noting|note|mention(?:ing)?|consider(?:ing)?)|it should be noted|needless to say"
    ),
    'Hedging stack. State the point.',
  ],
  [
    'hedge-phrase',
    'BAN',
    MKT_DOCS,
    W('at the end of the day|when it comes to'),
    'Hedging phrase. State the point.',
  ],
  [
    'filler-transition',
    'WARN',
    MKT_DOCS,
    P(
      '(?:^|[.!?]\\s+)(?:furthermore|moreover|additionally|in conclusion|ultimately|in summary|that said|notably|importantly),'
    ),
    'Filler transition at sentence start.',
  ],

  // ---- product marketing (devsloka list, extended) ----
  // Marketing and docs only: several of these words are literal in fiction (unlock a cage, leverage a crate lid).
  [
    'hype-phrase',
    'BAN',
    MKT_DOCS,
    W(
      "unlock(?:s|ed|ing)?|unleash(?:es|ed|ing)?|supercharg\\w*|revolutioni[sz]\\w*|seamless(?:ly)?|effortless(?:ly)?|elevat(?:e|es|ed|ing)|empower\\w*|game[- ]chang\\w*|cutting[- ]edge|next[- ]level|leverag\\w*|harness the power|in today's fast[- ]paced|to the next level|transform your|all[- ]in[- ]one|streamlin\\w*|boost your productivity|world[- ]class|best[- ]in[- ]class|robust|powerful yet simple|built for the future|your journey|say goodbye to|look no further|like never before|at your fingertips|reimagin\\w*|lorem ipsum|john doe|delve|delving|utili[sz]e|synerg\\w*|paradigm shift|state[- ]of[- ]the[- ]art|future[- ]proof|one[- ]stop shop|mission[- ]critical|dive (?:deep|into)|deep dive|unparalleled|groundbreaking|innovative solution|holistic"
    ),
    'Stock marketing phrase. Name the concrete mechanism or result.',
  ],
  [
    'superlative-claim',
    'WARN',
    'marketing',
    W(
      'the best|best-ever|fastest|the only (?:tool|platform|app|solution|way|product|software|one you need)|#1|number one (?:tool|platform|choice|app|solution)|most powerful|most advanced|ultimate'
    ),
    'Superlative. Back it with a number and a source, or cut it.',
  ],
  [
    'weak-cta',
    'WARN',
    'marketing',
    W(
      'get started|learn more|click here|find out more|discover more|sign up today'
    ),
    'Generic CTA. Name the action and its object (e.g. "Deploy data-viewer").',
  ],
  [
    'introducing-label',
    'WARN',
    'marketing',
    P('^\\s*(?:introducing|meet|say hello to)\\b'),
    'Template label/opener. Lead with what the product does.',
  ],
  [
    'not-just-x',
    'WARN',
    'marketing,creative',
    P(
      "\\bnot (?:just|only|merely) [^.,;]{1,40}[,;]? but\\b|\\b(?:it|this|that)(?:'s| is|n't| isn't) (?:not )?(?:just |only |about )?[^.,;]{1,40}[.,;] (?:it|this|that)(?:'s| is)\\b|\\bmore than just\\b"
    ),
    '"Not just X, but Y" / "It\'s not X. It\'s Y." contrast template.',
  ],
  [
    'filler-word',
    'WARN',
    MKT_DOCS,
    W(
      'very|really|simply|just|easy|easily|simple|quick(?:ly)?|basically|actually|literally'
    ),
    'Filler or effort-judging word. Describe the concrete thing.',
  ],
  [
    'weasel-word',
    'WARN',
    MKT_DOCS,
    W(
      'significantly|many|various|numerous|often|typically|generally|a wide range of|a variety of|countless|near[- ]zero|lightning[- ]fast|blazing(?:ly)?[- ]fast'
    ),
    'Vague quantity. Give a number.',
  ],
  [
    'datasheet-verb',
    'WARN',
    MKT_DOCS,
    W(
      'provides|is configurable|offers a|allows (?:you|users) to|enables (?:you|users) to|is designed to|helps (?:you|users) to'
    ),
    'Datasheet verb. Say what the reader does or gets.',
  ],
  [
    'the-user',
    'WARN',
    'docs',
    W('the user|the end user|one can'),
    'Address the reader as "you".',
  ],
  [
    'rhetorical-q',
    'WARN',
    MKT_DOCS,
    P(
      "(?:^|[.!]\\s+)(?:ever wondered|what if|why settle|tired of|wouldn't it be|imagine)\\b[^?]*\\?"
    ),
    'Rhetorical-question opener.',
  ],

  // ---- fiction (compiled list; see references/rules.md) ----
  [
    'fiction-cliche',
    'BAN',
    'creative',
    W(
      "tapestry|testament to|symphony of|a dance of|in the heart of|little did \\w+ know|breath (?:he|she|they|i|we) (?:didn't|hadn't|did not|had not) (?:know|realiz\\w*|realis\\w*)|shivers? (?:ran |went |crept )?(?:up|down) (?:his|her|their|my) spine|palpable|ministrations|the weight of (?:it all|the world|his words|her words|their words)|something shifted|time seemed to (?:stop|slow)|eyes (?:sparkl|glint|twinkl)\\w*|a smile (?:tugged|played) at|let out a (?:long |slow |shaky |deep )?breath|unspoken (?:understanding|promise)|the air (?:was )?thick with|(?:scent|smell|smelled|smelling|tang|whiff|stink) of [^.]{0,25}ozone|barely above a whisper|echoes? of (?:the |a )?past|whispers? of (?:the |a )?(?:past|wind|memor\\w*|secrets?|forgotten)|a pang of|knuckles (?:turned )?white|would change everything|nothing would ever be the same|forgotten memories|the silence was deafening|deafening silence|a wave of (?:relief|panic|nausea|calm|dread|guilt) (?:washed|swept) over|(?:fear|dread|panic|terror) gripped|heart (?:pounded|hammered|raced|thundered) in (?:his|her|their|my) chest|(?:some|certain) (?:doors|things|secrets) are (?:meant|better) (?:to|left)"
    ),
    'Stock fiction phrase. Use a specific, observed detail.',
  ],
  [
    'fiction-names',
    'WARN',
    'creative',
    W(
      'Elara|Kael|Lyra|Seraphina|Aria Blackwood|Elias Thorne|Eldoria|Thorne|Mara Chen|Kira Voss|Voss|Sable|Zephyr'
    ),
    'Default model-generated name. Choose a name with a reason.',
  ],
  [
    'as-if-simile',
    'WARN',
    'creative',
    W("it was as if|as though the (?:world|universe|room)|couldn't help but"),
    'Stock simile or reflex phrase.',
  ],
  [
    'moral-ending',
    'WARN',
    'creative',
    P(
      '(?:^|[.!?]\\s+)(?:and (?:in that moment|somehow)|in the end|perhaps,? (?:that|this) was|and (?:that|this) was enough)\\b'
    ),
    'Summarising/moral beat. End on an image or action.',
  ],
];

const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const opt = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode = opt('mode') || 'marketing';
const targets = args.filter(
  (a, i) => !a.startsWith('--') && args[i - 1] !== '--mode'
);
const USAGE =
  'usage: node scan.mjs <file|dir|-> [...] [--mode marketing|creative|docs] [--json] [--strict]';
if (!targets.length || !['marketing', 'creative', 'docs'].includes(mode)) {
  console.error(USAGE);
  process.exit(2);
}
const active = RULES.filter(
  r => r[2] === '*' || r[2].split(',').includes(mode)
);

function files(t) {
  if (t === '-') return ['-'];
  if (!fs.existsSync(t)) {
    console.error(`not found: ${t}`);
    process.exit(2);
  }
  if (fs.statSync(t).isFile()) return [t];
  return fs
    .readdirSync(t, { withFileTypes: true })
    .flatMap(e =>
      e.name === 'node_modules' || e.name.startsWith('.')
        ? []
        : e.isDirectory()
          ? files(path.join(t, e.name))
          : /\.(md|mdx|txt|html|json)$/i.test(e.name) &&
              !/(^|[-_.])(OFL|LICENSE|NOTICE|COPYING)([-_.]|$)/i.test(e.name)
            ? [path.join(t, e.name)]
            : []
    );
}

// Normalize typography so curly quotes don't hide patterns, and drop text that is not prose.
const SHELL =
  /\b(?:npm|npx|pnpm|yarn|node|git|gh|bash|sh|python3?|pip|docker|kubectl|curl|brew|cargo|go) (?:run |exec |install |add )?[\w:./@=-]+(?: [\w:./@=-]+)*/g;
const clean = s =>
  s
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/`[^`]*`/g, '``')
    .replace(SHELL, ' ');

// Lines of prose to check: [lineNumber, text, jsonKey]
function prose(file) {
  const raw =
    file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) {
    const out = [];
    const skip =
      /^(src|file|path|url|from|until|at|style|format|type|layout|icon|rect|module|pattern|name|family|mono|display|body)$/i;
    const short = /^(eyebrow|cta|caption|label|title|heading|text|sub)$/i;
    const walk = (v, key) => {
      if (typeof v === 'string') {
        if (
          !skip.test(key || '') &&
          (/[a-z]{2,}\s/i.test(v) || short.test(key || ''))
        )
          out.push([0, clean(v.replace(/\*/g, '')), key]);
      } else if (Array.isArray(v)) v.forEach(x => walk(x, key));
      else if (v && typeof v === 'object')
        for (const k of Object.keys(v)) walk(v[k], k);
    };
    walk(JSON.parse(raw));
    return out;
  }
  let fence = false;
  return raw
    .split('\n')
    .map((l, i) => {
      if (/^\s*(```|~~~)/.test(l)) {
        fence = !fence;
        return null;
      }
      if (
        fence ||
        (/^\s*(<!--|\||---$)/.test(l) && !/[a-z]{3,} [a-z]{3,}/i.test(l))
      )
        return null;
      return [
        i + 1,
        clean(l.replace(/\]\([^)]*\)/g, ']').replace(/<[^>]+>/g, ' ')),
      ];
    })
    .filter(Boolean);
}

const findings = [];
for (const t of targets)
  for (const f of files(t))
    for (const [line, text, key] of prose(f))
      for (const [id, severity, , re, message] of active) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          if (!m[0]) {
            re.lastIndex++;
            continue;
          }
          findings.push({
            file: f,
            line,
            key,
            rule: id,
            severity,
            match: m[0].trim(),
            message,
            text: text.trim().slice(0, 140),
          });
        }
      }

const ban = findings.filter(x => x.severity === 'BAN').length;
const summary = `${mode}: ${ban} BAN, ${findings.length - ban} WARN`;
if (flag('json'))
  console.log(JSON.stringify({ mode, summary, findings }, null, 2));
else {
  for (const x of findings)
    console.log(
      `${x.severity} ${x.file}${x.line ? ':' + x.line : x.key ? ' [' + x.key + ']' : ''}  ${x.rule}  "${x.match}"  ${x.message}`
    );
  console.log(`\n${summary}`);
}
const failed = ban > 0 || (flag('strict') && findings.length > 0);
// exitCode, not exit(): exit() truncates large piped output
process.exitCode = failed ? 1 : 0;
