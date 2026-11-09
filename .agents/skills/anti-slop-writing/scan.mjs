#!/usr/bin/env node
// Deterministic AI-slop scanner for product marketing, fiction and docs.
//
//   node scan.mjs <file|dir|-> [...] [--mode marketing|creative|docs]
//                 [--channel social] [--rhythm] [--json] [--strict]
//
// Scans .md/.mdx/.txt/.html files and the string values of .json files.
// Skips code fences, inline code, CLI commands (a tool name followed by
// arguments that carry a flag, path or colon) and licence files.
// Curly quotes and apostrophes are normalized before matching.
//   --channel social  also BANs Markdown, which plain-text posts show literally
//   --rhythm          prints words per sentence and WARNs on flat runs
// Exit codes: 0 clean, 1 a BAN remains (or any finding with --strict),
// 2 usage error or missing file. The last line is always
// "<mode>: N BAN, M WARN"; if it is missing, the scan did not run.
// Rule sources are in references/rules.md.
import fs from 'node:fs';
import path from 'node:path';

const W = s => new RegExp(`\\b(?:${s})\\b`, 'giu');
const Wcase = s => new RegExp(`\\b(?:${s})\\b`, 'gu'); // case-sensitive: names
const P = s => new RegExp(s, 'giu');
const MD = 'marketing,docs';
const EM_DASH =
  '(?<=[\\p{L}\\p{N}.,;:)"\'*?!])\\s?—\\s?(?=[\\p{L}\\p{N}("\'*])|^\\s*—\\s?(?=[\\p{L}"\'])|(?<=\\p{L})\\s–\\s(?=\\p{L})|(?<=\\p{L})\\s--\\s(?=\\p{L})';

// [id, severity, modes ('*' = all), regex, message, options]
// options.first / options.last: only on the first / last prose line of a file; options.channel: only with --channel <x>
const RULES = [
  // ---- punctuation and glyphs ----
  [
    'em-dash',
    'BAN',
    '*',
    P(EM_DASH),
    'Dash used as punctuation. Use a period, comma, colon or parentheses. (In fiction, a dash before a closing quote marks cut-off speech and is allowed.)',
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
    MD,
    P('!{2,}|![^.!?\\n]*!'),
    'More than one exclamation mark nearby.',
  ],
  [
    'exclamation-stack',
    'WARN',
    'creative',
    P('!{2,}'),
    'Stacked exclamation marks.',
  ],
  [
    'markdown-in-plain-text',
    'BAN',
    '*',
    P(
      '\\*\\*[^*]+\\*\\*|(?<![\\w*])\\*[^*\\s][^*]*\\*(?![\\w*])|(?<!\\w)_[^_\\s][^_]*_(?!\\w)|^#{1,6}\\s|^\\s*[-*+]\\s|`'
    ),
    'Markdown in a plain-text post shows as typed characters. Remove it.',
    { channel: 'social' },
  ],

  // ---- assistant voice and hedging ----
  [
    'sycophant-opener',
    'BAN',
    MD,
    P(
      '(?:^|[.!?]\\s+)(?:great question|certainly|absolutely|of course|i hope this helps|happy to help)\\b'
    ),
    'Assistant-voice opener or closer.',
  ],
  [
    'hedge-stack',
    'BAN',
    MD,
    W(
      "it(?:'s| is) (?:worth|important to) (?:noting|note|mention(?:ing)?|consider(?:ing)?)|it should be noted|needless to say"
    ),
    'Hedging stack. State the point.',
  ],
  [
    'hedge-stack',
    'WARN',
    'creative',
    W(
      "it(?:'s| is) (?:worth|important to) (?:noting|note|mention(?:ing)?|consider(?:ing)?)|it should be noted|needless to say"
    ),
    "Hedging stack. Fine in a character's dialogue; cut it from narration.",
  ],
  [
    'hedge-phrase',
    'BAN',
    MD,
    W('at the end of the day|when it comes to'),
    'Hedging phrase. State the point.',
  ],
  [
    'filler-transition',
    'WARN',
    MD,
    P(
      '(?:^|[.!?]\\s+)(?:furthermore|moreover|additionally|in conclusion|ultimately|in summary|that said|notably|importantly),'
    ),
    'Filler transition at sentence start.',
  ],

  // ---- product marketing (devsloka list, extended); several words are literal in fiction ----
  [
    'hype-phrase',
    'BAN',
    MD,
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
      'get started|learn more|click here|find out more|discover more|discover what|sign up today'
    ),
    'Generic CTA. Name the action and its object (e.g. "Deploy data-viewer").',
  ],
  [
    'question-hook',
    'WARN',
    'marketing',
    P('\\?["\'*]*\\s*$'),
    'The post opens with a question. Open with the incident or what the thing does.',
    { first: true },
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
      "\\bnot (?:just|only|merely) [^.,;]{1,40}[,;]? but\\b|\\b(?:it|this|that)(?:'s| is| was|n't| isn't| wasn't) (?:not )?(?:just |only |about )?[^.,;]{1,40}[.,;] (?:it|this|that)(?:'s| is| was)\\b|\\bmore than just\\b"
    ),
    '"Not just X, but Y" / "It\'s not X. It\'s Y." contrast template.',
  ],
  [
    'filler-word',
    'WARN',
    MD,
    W(
      'very|really|simply|just|easy|easily|simple|quick(?:ly)?|basically|actually|literally|finally'
    ),
    'Filler or effort-judging word. Describe the concrete thing.',
  ],
  [
    'weasel-word',
    'WARN',
    MD,
    P(
      '\\b(?:significantly|(?<!how )many|various|numerous|often|typically|generally|a wide range of|a variety of|countless|near[- ]zero|lightning[- ]fast|blazing(?:ly)?[- ]fast)\\b'
    ),
    'Vague quantity. Give a number.',
  ],
  [
    'datasheet-verb',
    'WARN',
    MD,
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
    MD,
    P(
      "(?:^|[.!]\\s+)(?:ever wondered|what if|why settle|tired of|wouldn't it be|imagine)\\b[^?]*\\?"
    ),
    'Rhetorical-question opener.',
  ],

  // ---- fiction (compiled list; see references/rules.md) ----
  // BAN: multi-word stock phrasing that is almost never literal.
  [
    'fiction-cliche',
    'BAN',
    'creative',
    W(
      "testament to|a dance of|little did \\w+ know|unbeknownst to|breath (?:he|she|they|i|we) (?:didn't|hadn't|did not|had not) (?:know|realiz\\w*|realis\\w*)|(?:didn't|hadn't|did not|had not) realiz\\w* (?:he|she|they|i|we)(?:'d| had)? been holding (?:his|her|their|my|a) breath|(?:shivers?|a chill) (?:ran |went |crept |raced )?(?:up|down) (?:his|her|their|my) spine|ministrations|the weight of (?:it all|the world|his words|her words|their words)|something (?:inside|in|within) (?:her|him|them|me) shifted|time (?:seemed to )?(?:stop(?:ped)?|stood still|slow(?:ed)?)|eyes (?:sparkl|twinkl)\\w*|a smile (?:tugged|played) at|unspoken (?:understanding|promise)|the air (?:was )?thick with|barely above a whisper|barely audible|echoes? of (?:the |a )?past|whispers? of (?:the |a )?(?:past|wind|memor\\w*|secrets?|forgotten)|a pang of|knuckles (?:turned |were |went |grew )?white|would (?:change|alter) (?:everything|the course of)|nothing would ever be the same|forgotten memories|the silence was (?:deafening|a living thing)|deafening silence|silence stretched|a wave of \\w+ (?:washed|swept) over|(?:fear|dread|panic|terror) (?:gripped|pooled)|dread pooled|heart (?:was )?(?:pounding|hammering|racing|thundering)|heart (?:pounded|hammered|raced|thundered) (?:in|against)|breath hitched|a muscle (?:ticked|twitched|jumped) in (?:his|her|their) jaw|somewhere(?: in the distance)?, a dog barked|(?:some|certain) (?:doors|things|secrets) are (?:meant|better) (?:to|left)"
    ),
    'Stock fiction phrase. Use a specific, observed detail.',
  ],
  // WARN: words with ordinary literal uses (a woven tapestry, a palpable mass, the smell of ozone after lightning).
  [
    'fiction-cliche-word',
    'WARN',
    'creative',
    W(
      'tapestry|symphony of|in the heart of|palpable|something shifted|eyes glint\\w*|(?:scent|smell|smelled|smelling|tang|whiff|stink) of [^.]{0,25}ozone|let out a (?:long |slow |shaky |deep )?breath'
    ),
    'Often a model-fiction tell. Keep it only if literal (a woven tapestry, a medical exam) and say so.',
  ],
  [
    'fiction-names',
    'WARN',
    'creative',
    Wcase(
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
    'Summarising or moral closing beat. End on an image or action.',
    { last: true },
  ],
];

const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const opt = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode = opt('mode') || 'marketing';
const channel = opt('channel');
const targets = args.filter(
  (a, i) =>
    !a.startsWith('--') && !['--mode', '--channel'].includes(args[i - 1])
);
const USAGE =
  'usage: node scan.mjs <file|dir|-> [...] [--mode marketing|creative|docs] [--channel social] [--rhythm] [--json] [--strict]';
if (
  !targets.length ||
  !['marketing', 'creative', 'docs'].includes(mode) ||
  (channel !== undefined && channel !== 'social')
) {
  console.error(USAGE);
  process.exit(2);
}
const active = RULES.filter(
  r =>
    (r[2] === '*' || r[2].split(',').includes(mode)) &&
    (!r[5]?.channel || r[5].channel === channel)
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

// A CLI command: a tool name, then arguments that each carry a flag, path or colon character.
// "npm run deploy:app -- data-viewer" is skipped; "go and unlock" is prose.
const ARG = '[\\w:./@=-]*[:./@=-][\\w:./@=-]*';
const SHELL = new RegExp(
  `\\b(?:npm|npx|pnpm|yarn|node|git|gh|bash|sh|python3?|pip|docker|kubectl|curl|brew|cargo|go) (?:run |exec |install |add )?${ARG}(?: ${ARG})*`,
  'g'
);
const clean = (s, { keepMarkdown = false } = {}) => {
  let t = s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
  // cut-off speech in fiction: a dash right before a closing quote is a convention, not punctuation slop
  if (mode === 'creative') t = t.replace(/—(?="(?:\s|$|[,.;:]))/g, '');
  if (!keepMarkdown) t = t.replace(/`[^`]*`/g, '``');
  return t.replace(SHELL, ' ');
};

// Prose units to check: { line, text, raw, key }
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
          out.push({ line: 0, text: clean(v.replace(/\*/g, '')), raw: v, key });
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
      const stripped = l.replace(/\]\([^)]*\)/g, ']').replace(/<[^>]+>/g, ' ');
      return {
        line: i + 1,
        text: clean(stripped),
        raw: channel === 'social' ? l : stripped,
        key: undefined,
      };
    })
    .filter(Boolean);
}

// Sentences with word counts, grouped by paragraph. A command-only or link-only line is not a sentence.
function sentences(units) {
  const paras = [[]];
  for (const u of units) {
    const t = u.text.trim();
    if (!t) {
      if (paras.at(-1).length) paras.push([]);
      continue;
    }
    if (/^(?:https?:\/\/\S+|\[LINK[^\]]*\])$/i.test(t) || !/[a-z]{2,}/i.test(t))
      continue;
    const body = t.replace(/^#{1,6}\s+|^\s*[-*+]\s+|\*\*/g, '');
    // split after . ! ? (and a closing quote) when the next sentence starts with a capital, digit or quote
    for (const s of body.split(/(?<=[.!?]["']?)\s+(?=["'(\p{Lu}\d])/u)) {
      const words = s.match(/[\p{L}\p{N}][\p{L}\p{N}'’:.\/-]*/gu) || [];
      if (words.length)
        paras
          .at(-1)
          .push({ line: u.line, words: words.length, text: s.trim() });
    }
  }
  return paras.filter(p => p.length);
}

const findings = [];
const rhythm = [];
for (const t of targets)
  for (const f of files(t)) {
    const units = prose(f);
    const firstLine = Math.min(
      ...units.filter(u => u.text.trim() && u.line > 0).map(u => u.line),
      Infinity
    );
    const lastLine = Math.max(
      0,
      ...units.filter(u => u.text.trim()).map(u => u.line)
    );
    for (const { line, text, raw, key } of units)
      for (const [id, severity, , re, message, o = {}] of active) {
        if (o.last && line && line !== lastLine) continue;
        if (o.first && (!line || line !== firstLine)) continue;
        const subject = o.channel ? raw : text;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(subject))) {
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
            at: m.index,
            match: m[0].trim(),
            message,
            text: text.trim().slice(0, 140),
          });
        }
      }
    // structural checks over sentences
    for (const para of sentences(units)) {
      if (flag('rhythm'))
        rhythm.push({ file: f, counts: para.map(s => s.words) });
      for (let i = 0; i + 2 < para.length; i++) {
        const run = para.slice(i, i + 3).map(s => s.words);
        if (flag('rhythm') && Math.max(...run) - Math.min(...run) <= 2)
          findings.push({
            file: f,
            line: para[i].line,
            rule: 'rhythm-run',
            severity: 'WARN',
            match: run.join('/'),
            message:
              'Three sentences in a row within two words of the same length. Vary one, unless that would push a sentence past 20 words or change its meaning; then report it.',
            text: para[i].text.slice(0, 140),
          });
        if (mode === 'marketing' && run.every(n => n <= 2))
          findings.push({
            file: f,
            line: para[i].line,
            rule: 'fragment-run',
            severity: 'WARN',
            match: para
              .slice(i, i + 3)
              .map(s => s.text)
              .join(' '),
            message:
              'Three fragments in a row ("Fast. Simple. Yours."). Write one sentence that says the thing.',
            text: para[i].text.slice(0, 140),
          });
      }
      if (mode !== 'creative')
        for (const s of para)
          if (s.words > 25)
            findings.push({
              file: f,
              line: s.line,
              rule: 'long-sentence',
              severity: 'WARN',
              match: `${s.words} words`,
              message: 'Sentence over 25 words. Split it.',
              text: s.text.slice(0, 140),
            });
    }
  }

// a "just" inside a "not just X" contrast is one finding, not two
const contrast = findings.filter(x => x.rule === 'not-just-x');
const deduped = findings.filter(
  x =>
    !(
      x.rule === 'filler-word' &&
      contrast.some(
        c =>
          c.file === x.file &&
          c.line === x.line &&
          c.key === x.key &&
          x.at >= c.at &&
          x.at < c.at + c.match.length
      )
    )
);

const ban = deduped.filter(x => x.severity === 'BAN').length;
const summary = `${mode}: ${ban} BAN, ${deduped.length - ban} WARN`;
const clean_out = ({ at, ...x }) => x;
if (flag('json'))
  console.log(
    JSON.stringify(
      {
        mode,
        channel,
        summary,
        findings: deduped.map(clean_out),
        ...(flag('rhythm') ? { rhythm } : {}),
      },
      null,
      2
    )
  );
else {
  for (const x of deduped)
    console.log(
      `${x.severity} ${x.file}${x.line ? ':' + x.line : x.key ? ' [' + x.key + ']' : ''}  ${x.rule}  "${x.match}"  ${x.message}`
    );
  if (flag('rhythm'))
    for (const r of rhythm)
      console.log(`rhythm ${r.file}: ${r.counts.join(' ')}`);
  console.log(`\n${summary}`);
}
const failed = ban > 0 || (flag('strict') && deduped.length > 0);
// exitCode, not exit(): exit() truncates large piped output
process.exitCode = failed ? 1 : 0;
