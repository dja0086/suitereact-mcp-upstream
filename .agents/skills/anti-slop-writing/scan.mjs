#!/usr/bin/env node
// Deterministic AI-slop scanner for prose, product marketing and fiction.
//
//   node scan.mjs <file|dir|-> [...] [--mode marketing|creative|docs] [--json] [--strict]
//
// Scans .md/.mdx/.txt/.html files, and the string values of .json files
// (storyboards, copy decks). Markdown code fences and inline code are skipped.
// Exit 1 when any BAN finding exists (with --strict, WARN findings fail too).
// Rule sources are recorded per rule in references/rules.md.
import fs from 'node:fs';
import path from 'node:path';

const W = s => new RegExp(`\\b(?:${s})\\b`, 'giu');
const P = s => new RegExp(s, 'giu');

// [id, severity, modes ('*' = all), regex, message]
const RULES = [
  // Punctuation and glyph tells
  // a dash between words is punctuation; a lone dash in an empty table cell is not
  [
    'em-dash',
    'BAN',
    '*',
    P(
      '(?<=[\\p{L}\\p{N}.,;:)"\u2019*])\\s?\u2014\\s?(?=[\\p{L}\\p{N}("\u2018*])|(?<=\\p{L})\\s\u2013\\s(?=\\p{L})|(?<=\\p{L})\\s--\\s(?=\\p{L})'
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
    P('[\u2192\u2197\u279C\u27A1]|->(?=\\s|$)'),
    'Arrow glyph appended to copy or CTA.',
  ],
  [
    'middle-dot-meta',
    'WARN',
    'marketing',
    P('\\S+ [\u00B7\u2022] \\S+ [\u00B7\u2022] \\S+'),
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
    'marketing,docs',
    P('!{2,}|![^.!?\\n]*!'),
    'More than one exclamation mark nearby.',
  ],

  // Sycophancy, hedging and filler transitions
  [
    'sycophant-opener',
    'BAN',
    '*',
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
      "it(?:'s| is) (?:worth|important to) (?:noting|note|mention(?:ing)?|consider(?:ing)?)|it should be noted|needless to say|at the end of the day|when it comes to"
    ),
    'Hedging stack. State the point.',
  ],
  [
    'filler-transition',
    'WARN',
    '*',
    P(
      '(?:^|[.!?]\\s+)(?:furthermore|moreover|additionally|in conclusion|ultimately|in summary|that said|notably|importantly),'
    ),
    'Filler transition at sentence start.',
  ],

  // Marketing slop (devsloka anti-slop list, extended)
  [
    'hype-phrase',
    'BAN',
    '*',
    W(
      "unlock(?:s|ed|ing)?|unleash(?:es|ed|ing)?|supercharg\\w*|revolutioni[sz]\\w*|seamless(?:ly)?|effortless(?:ly)?|elevat(?:e|es|ed|ing)|empower\\w*|game[- ]chang\\w*|cutting[- ]edge|next[- ]level|leverag\\w*|harness the power|in today'?s fast[- ]paced|to the next level|transform your|all[- ]in[- ]one|streamlin\\w*|boost your productivity|world[- ]class|best[- ]in[- ]class|robust|powerful yet simple|built for the future|your journey|say goodbye to|look no further|like never before|at your fingertips|reimagin\\w*|lorem ipsum|john doe|delve|delving|utili[sz]e|synerg\\w*|paradigm shift|state[- ]of[- ]the[- ]art|future[- ]proof|one[- ]stop shop|mission[- ]critical|take it to the next|dive (?:deep|into)|deep dive|unparalleled|groundbreaking|innovative solution|holistic"
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
      "\\bnot (?:just|only|merely) [^.,;]{1,40}[,;]? but\\b|\\bit'?s not (?:about )?[^.]{1,40}\\. it'?s\\b|\\bmore than just\\b"
    ),
    '"Not just X, but Y" contrast template.',
  ],
  [
    'filler-word',
    'WARN',
    'marketing,docs',
    W(
      'very|really|simply|just|easy|easily|simple|quick(?:ly)?|basically|actually|literally'
    ),
    'Filler or effort-judging word. Describe the concrete thing.',
  ],
  [
    'weasel-word',
    'WARN',
    'marketing,docs',
    W(
      'significantly|many|various|numerous|often|typically|generally|a wide range of|a variety of|countless|near[- ]zero|lightning[- ]fast|blazing(?:ly)?[- ]fast'
    ),
    'Vague quantity. Give a number.',
  ],
  [
    'datasheet-verb',
    'WARN',
    'docs,marketing',
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
    'marketing,docs',
    P(
      "(?:^|[.!]\\s+)(?:ever wondered|what if|why settle|tired of|wouldn'?t it be|imagine)\\b[^?]*\\?"
    ),
    'Rhetorical-question opener.',
  ],

  // Fiction tells (common in model-written prose)
  [
    'fiction-cliche',
    'BAN',
    'creative',
    W(
      "tapestry|testament to|symphony of|a dance of|in the heart of|little did (?:he|she|they|i|we) know|breath (?:he|she|they|i) didn'?t know (?:he|she|they|i) (?:was|were) holding|shivers? (?:ran |went )?down (?:his|her|their|my) spine|palpable|a mix(?:ture)? of [a-z]+ and [a-z]+|ministrations|the weight of (?:it all|the world|his words|her words|their words)|something shifted|time seemed to (?:stop|slow)|eyes (?:sparkl|glint|twinkl)\\w*|a smile (?:tugged|played) at|let out a breath|unspoken (?:understanding|promise)|the air (?:was )?thick with|smelled of ozone|barely above a whisper|echoes? of (?:the )?past|whispers? of|a pang of|knuckles (?:turned )?white"
    ),
    'Stock fiction phrase. Use a specific, observed detail.',
  ],
  [
    'fiction-names',
    'WARN',
    'creative',
    W('Elara|Kael|Lyra|Seraphina|Aria Blackwood|Elias Thorne|Eldoria|Thorne'),
    'Default model-generated name. Choose a name with a reason.',
  ],
  [
    'as-if-simile',
    'WARN',
    'creative',
    W("it was as if|as though the (?:world|universe|room)|couldn'?t help but"),
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
if (!targets.length) {
  console.error(
    'usage: node scan.mjs <file|dir|-> [...] [--mode marketing|creative|docs] [--json] [--strict]'
  );
  process.exit(2);
}
const active = RULES.filter(
  r => r[2] === '*' || r[2].split(',').includes(mode)
);

function files(t) {
  if (t === '-') return ['-'];
  const st = fs.statSync(t);
  if (st.isFile()) return [t];
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
// Lines of prose to check: [lineNumber, text]
function prose(file) {
  const raw =
    file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  if (/\.json$/i.test(file)) {
    const out = [];
    const walk = (v, key) => {
      if (typeof v === 'string') {
        if (
          !/^(src|file|path|url|from|until|at|style|format|type|layout|icon|rect|module|pattern|name|family|mono|display|body)$/i.test(
            key || ''
          ) &&
          (/[a-z]{2,}\s/i.test(v) ||
            /^(eyebrow|cta|caption|label|title|heading|text|sub)$/i.test(
              key || ''
            ))
        )
          out.push([0, v.replace(/\*/g, ''), key]);
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
        l
          .replace(/`[^`]*`/g, '``')
          .replace(/\]\([^)]*\)/g, ']')
          .replace(/<[^>]+>/g, ' '),
      ];
    })
    .filter(Boolean);
}

const findings = [];
for (const t of targets)
  for (const f of files(t)) {
    for (const [line, text, key] of prose(f))
      for (const [id, sev, , re, msg] of active) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          findings.push({
            file: f,
            line,
            key,
            rule: id,
            severity: sev,
            match: m[0].trim(),
            message: msg,
            text: text.trim().slice(0, 140),
          });
          if (!re.global) break;
        }
      }
  }
if (flag('json')) console.log(JSON.stringify({ mode, findings }, null, 2));
else {
  for (const x of findings)
    console.log(
      `${x.severity} ${x.file}${x.line ? ':' + x.line : x.key ? ' [' + x.key + ']' : ''}  ${x.rule}  "${x.match}"  ${x.message}`
    );
  const ban = findings.filter(x => x.severity === 'BAN').length;
  console.log(`\n${mode}: ${ban} BAN, ${findings.length - ban} WARN`);
}
// exitCode, not exit(): exit() truncates large piped output
process.exitCode = findings.some(x => x.severity === 'BAN' || flag('strict'))
  ? 1
  : 0;
