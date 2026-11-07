#!/usr/bin/env node
// Deterministic AI-slop scanner for prose, product marketing, social posts and fiction.
//
//   node scan.mjs <file|dir|-> [...] [--mode marketing|social|creative|docs]
//                            [--max-dashes N] [--json] [--strict]
//
// Scans .md/.mdx/.txt/.html files, and the string values of .json files
// (storyboards, copy decks). Markdown code fences and inline code are skipped.
// Curly apostrophes and quotes are folded to straight ones before matching, so a
// paste from LinkedIn, Docs or macOS hits the same rules as typed ASCII.
// `social` runs every marketing rule, then post-structure checks. A social rule
// with the same id replaces the marketing one (stricter or looser on purpose).
// Exit 1 when any BAN finding exists. `--strict` also exits 1 when a WARN exists.
// A clean scan exits 0 with or without `--strict`. `--max-dashes N` allows N
// dash-punctuation marks per file (LinkedIn 1, Reddit 2); omit it and any dash
// is a BAN. Rule sources are recorded per rule in references/rules.md.
import fs from 'node:fs';
import path from 'node:path';

const W = s => new RegExp(`\\b(?:${s})\\b`, 'giu');
const P = s => new RegExp(s, 'giu');
// Start of a sentence: line start, optional quote / list marker, or after .!?
const SENT = String.raw`(?:^[\s>"'\u2022\u00B7]*(?:(?:[-*+\u2022\u00B7]|\d+[.)])\s+)?|[.!?]['"]?\s+)`;

const RE_NOT_JUST = P(
  String.raw`\bnot (?:just|only|merely)\s+[^.,;]{1,40}[,;]?\s+but\b|\bit(?:'s| is) not\s+(?:about\s+)?.{1,60}?\s*(?:[,;.]|\u2014|\u2013|--)\s*(?:it(?:'s| is)|but)\b|\bmore than just\b`
);
const RE_BAIT = P(
  String.raw`\b(?:here(?:'s| is) the thing|let that sink in|the reality is|buckle up|here(?:'s| is) why that matters)\b|\bspoiler\s*:`
);
const RE_ANNOUNCE = P(
  String.raw`\b(?:(?:i(?:'m| am)|we(?:'re| are)|so)\s+)?(?:humbled|thrilled|excited)\s+to\s+(?:share|announce)\b`
);
const RE_STOCK = P(
  String.raw`\btapestry\b|\btestament to\b|\brealm of\b|\bembark(?:s|ed|ing)?\s+on\b`
);
const RE_METAPHOR = P(
  String.raw`\b(?:landscape of|(?:competitive|digital|tech|technology|ai|software|startup|business|industry|market|media|content|regulatory|security|threat|vendor|tool|solution|innovation|data|cloud|saas|developer|dev|current|modern|evolving|changing|complex|broader|wider|entire|whole|new|today'?s|political|economic|cultural|online|mobile|enterprise|product|platform|cyber)\s+landscape|the landscape is an? (?!(?:desert|mountain|valley|plain|painting|photo|photograph|canvas|park|garden|river|forest|beach|field|lake|hill|plateau)\b))\b|\bnavigat(?:e|es|ed|ing)\s+(?:the\s+|a\s+|an\s+|your\s+|our\s+|this\s+|these\s+)?(?:complex(?:ity|ities)?|landscape|trade-?offs?|challenges?|uncertainty|ecosystem|nuances?|intricacies)\b|\bfoster(?:s|ed|ing)?\s+(?:a\s+|the\s+)?(?:growth|innovation|collaboration|community|communities|culture|success|creativity|engagement|learning|development|relationships|trust|excellence|synergy)\b`
);
const EMOJI = String.raw`(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}`;

// [id, severity, modes ('*' = all), regex or null for a structural rule, message]
const RULES = [
  // Punctuation and glyph tells
  // a dash between words is punctuation; a lone dash in an empty table cell is not
  [
    'em-dash',
    'BAN',
    '*',
    P(
      '(?<=[\\p{L}\\p{N}.,;:)"\u2019\'*])\\s?\u2014\\s?(?=[\\p{L}\\p{N}("\u2018\'*])|(?<=\\p{L})\\s\u2013\\s(?=\\p{L})|(?<=\\p{L})\\s--\\s(?=\\p{L})'
    ),
    'Dash used as punctuation. Use a period, comma, colon or parentheses.',
  ],
  [
    'emoji',
    'BAN',
    'marketing,creative',
    P(EMOJI),
    'Emoji in copy. Use words, or a real icon in the design.',
  ],
  [
    'emoji-docs',
    'WARN',
    'docs',
    P(EMOJI),
    'Emoji in prose. Fine as a status mark in a table; otherwise use words.',
  ],
  [
    'emoji-bullet',
    'BAN',
    'marketing,creative',
    P(String.raw`^\s*${EMOJI}`),
    'Emoji used as a bullet. Write the line without it.',
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

  // Sycophancy, hedging and filler transitions.
  // Standalone interjections only. "Of course, the downside is cost." is a clause.
  [
    'sycophant-opener',
    'BAN',
    '*',
    P(
      SENT +
        String.raw`(?:great question|i hope this helps|happy to help)\b|` +
        SENT +
        String.raw`(?:certainly|absolutely|of course)\s*[.!]`
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
      SENT +
        '(?:furthermore|moreover|additionally|in conclusion|ultimately|in summary|that said|notably|importantly),'
    ),
    'Filler transition at sentence start.',
  ],

  // Marketing slop (devsloka anti-slop list, extended). social inherits these.
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
    P(SENT + String.raw`(?:introducing|meet|say hello to)\b`),
    'Template label/opener. Lead with what the product does.',
  ],
  // Social posts block the contrast. Marketing and fiction keep it as a decision:
  // "It's not loaded, but the cache is warm." is ordinary scope prose.
  [
    'not-just-x',
    'BAN',
    'social',
    RE_NOT_JUST,
    '"Not X, but Y" / "It\'s not X, it\'s Y" contrast template.',
  ],
  [
    'not-just-x',
    'WARN',
    'marketing,creative',
    RE_NOT_JUST,
    '"Not X, but Y" / "It\'s not X, it\'s Y" contrast template.',
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
      SENT +
        String.raw`(?:ever wondered|what if|why settle|tired of|wouldn'?t it be|imagine)\b[^?]*\?`
    ),
    'Rhetorical-question opener.',
  ],

  // Social tells. BAN where the team blocks the phrase; WARN where a literal
  // reading is common ("landscape mode", "navigate to Settings", "foster care").
  [
    'engagement-bait',
    'BAN',
    'social',
    RE_BAIT,
    'Engagement bait. Say the point.',
  ],
  [
    'engagement-bait',
    'WARN',
    'marketing',
    RE_BAIT,
    'Engagement bait. Say the point.',
  ],
  [
    'announcement-opener',
    'BAN',
    'social',
    RE_ANNOUNCE,
    'Announcement opener. Lead with what shipped.',
  ],
  [
    'announcement-opener',
    'WARN',
    'marketing',
    RE_ANNOUNCE,
    'Announcement opener. Lead with what shipped.',
  ],
  [
    'fake-casual',
    'BAN',
    'social',
    P(String.raw`\b(?:okay|ok),?\s+real talk\b|\breal talk\s*:`),
    'Fake-casual opener. Start with the fact.',
  ],
  [
    'stock-phrase',
    'BAN',
    'social',
    RE_STOCK,
    'Stock image. Name the concrete thing.',
  ],
  [
    'stock-phrase',
    'WARN',
    'marketing',
    RE_STOCK,
    'Stock image. Name the concrete thing.',
  ],
  [
    'stock-metaphor',
    'BAN',
    'social',
    RE_METAPHOR,
    'Metaphor standing in for a market, a task or a relationship. Name it.',
  ],
  [
    'stock-metaphor',
    'WARN',
    'marketing',
    RE_METAPHOR,
    'Metaphor standing in for a market, a task or a relationship. Name it.',
  ],
  [
    'stock-verb',
    'WARN',
    'social,marketing',
    P(
      String.raw`\bshowcas(?:e|es|ed|ing)\b|\b(?:this|that|which|it)\s+underscores\b|\bunderscore(?:s|d)?\s+(?:the|how|why|our|its|their|a|an)\b`
    ),
    'Showcase / underscore verb. State the action or the result.',
  ],
  [
    'soft-adjective',
    'WARN',
    'social',
    W('(?:pivotal|crucial|intricate|meticulous)(?:ly)?'),
    'Soft adjective. Cut it, or replace it with the fact that makes it true.',
  ],

  // Fiction tells (common in model-written prose). tapestry / testament to also
  // fire as stock-phrase in social and marketing; they are not duplicated here.
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
      SENT +
        '(?:and (?:in that moment|somehow)|in the end|perhaps,? (?:that|this) was|and (?:that|this) was enough)\\b'
    ),
    'Summarising/moral beat. End on an image or action.',
  ],

  // Structural (text files, not JSON string values). Regex null.
  ['hashtag-pile', 'BAN', 'social', null, 'Hashtag pile. Keep one, or none.'],
  [
    'closer-bait',
    'BAN',
    'social',
    null,
    'Engagement closer. End on the point, not a prompt for replies.',
  ],
  [
    'broetry',
    'BAN',
    'social',
    null,
    'One sentence per line, all the way down. Join related lines into paragraphs.',
  ],
  [
    'stacked-questions',
    'BAN',
    'social',
    null,
    'Stacked questions. Ask one, or state the point.',
  ],
];

const MODES = ['marketing', 'social', 'creative', 'docs'];

function applies(modes, mode, id) {
  const list = modes.split(',');
  if (list.includes('*') || list.includes(mode)) return true;
  // social includes marketing, unless a social rule with this id replaces it
  if (mode === 'social' && list.includes('marketing')) {
    const overridden = RULES.some(
      r => r[0] === id && r[2].split(',').includes('social')
    );
    return !overridden;
  }
  return false;
}

const USAGE =
  'usage: node scan.mjs <file|dir|-> [...] [--mode marketing|social|creative|docs] [--max-dashes N] [--json] [--strict]';

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const opt = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : undefined;
};
const mode = opt('mode') || 'marketing';
if (!MODES.includes(mode))
  fail(`unknown mode "${mode}" (${MODES.join(', ')})\n${USAGE}`);
let dashCap = 0;
if (args.includes('--max-dashes')) {
  const rawCap = opt('max-dashes');
  if (rawCap === undefined || !/^\d+$/.test(rawCap))
    fail(`--max-dashes expects a non-negative integer\n${USAGE}`);
  dashCap = Number(rawCap);
}
const VALUE_FLAGS = new Set(['mode', 'max-dashes']);
const targets = args.filter((a, i) => {
  if (a.startsWith('--')) return false;
  const prev = args[i - 1];
  return !(prev && prev.startsWith('--') && VALUE_FLAGS.has(prev.slice(2)));
});
if (!targets.length) fail(USAGE);
const active = RULES.filter(r => applies(r[2], mode, r[0]));
const bulletOn = active.some(r => r[0] === 'emoji-bullet');

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

// Fold pasted punctuation to ASCII so \'? and " patterns see it. Every
// replacement is one code unit, so match indexes still address `display`.
function straighten(s) {
  return s
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ');
}

function row(line, cleaned, key) {
  return { line, text: straighten(cleaned), display: cleaned, key };
}

// Lines of prose to check.
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
          out.push(row(0, v.replace(/\*/g, ''), key));
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
      return row(
        i + 1,
        l
          .replace(/`[^`]*`/g, '``')
          .replace(/\]\([^)]*\)/g, ']')
          .replace(/<[^>]+>/g, ' ')
      );
    })
    .filter(Boolean);
}

function hashtagsOf(text) {
  return text.match(/(?<![\p{L}\p{N}_])#\p{L}[\p{L}\p{N}_]*/gu) || [];
}
function isHashtagOnly(text) {
  if (!hashtagsOf(text).length) return false;
  return (
    text.replace(/(?<![\p{L}\p{N}_])#\p{L}[\p{L}\p{N}_]*/gu, '').trim() === ''
  );
}
function isCloser(text) {
  return /^["']?(?:your\s+)?(?:thoughts|agree)\s*\?+["']?$/i.test(text.trim());
}
function isOneSentence(text) {
  const t = text.trim();
  if (/^(?:#{1,6}\s|[-*+\u2022\u00B7]\s|\d+[.)]\s|>\s)/.test(t)) return false;
  if (t.split(/\s+/).length > 30) return false;
  const body = t.replace(/["')\]]+$/u, '');
  if (!/[.!?]$/.test(body)) return false;
  return !/[.!?]/.test(body.slice(0, -1));
}

function structure(file, rows) {
  const out = [];
  const add = (line, id, match, display) => {
    const rule = active.find(r => r[0] === id);
    if (!rule) return;
    out.push({
      file,
      line,
      rule: id,
      severity: rule[1],
      match: String(match).trim().slice(0, 80),
      message: rule[4],
      text: (display || match).trim().slice(0, 140),
    });
  };
  const nonempty = rows.filter(r => r.text.trim());

  if (active.some(r => r[0] === 'fake-casual')) {
    const first = nonempty[0];
    if (
      first &&
      /^["']?so,\s/i.test(first.text.trim()) &&
      !/real talk/i.test(first.text)
    )
      add(first.line, 'fake-casual', first.text.trim(), first.display);
  }

  if (active.some(r => r[0] === 'hashtag-pile')) {
    const tagged = nonempty
      .map(r => ({ r, tags: hashtagsOf(r.text) }))
      .filter(t => t.tags.length);
    const piles = tagged.filter(t => t.tags.length >= 3);
    if (piles.length) {
      for (const t of piles)
        add(t.r.line, 'hashtag-pile', t.tags.join(' '), t.r.display);
    } else if (tagged.reduce((n, t) => n + t.tags.length, 0) >= 4) {
      add(
        tagged[0].r.line,
        'hashtag-pile',
        tagged.flatMap(t => t.tags).join(' '),
        tagged[0].r.display
      );
    }
  }

  if (active.some(r => r[0] === 'closer-bait')) {
    for (const r of nonempty)
      if (isCloser(r.text))
        add(r.line, 'closer-bait', r.text.trim(), r.display);
  }

  if (active.some(r => r[0] === 'broetry')) {
    const content = nonempty.filter(
      r => !isHashtagOnly(r.text) && !isCloser(r.text)
    );
    if (content.length >= 4 && content.every(r => isOneSentence(r.text)))
      add(
        content[0].line,
        'broetry',
        `${content.length} one-sentence lines`,
        content[0].display
      );
  }

  if (active.some(r => r[0] === 'stacked-questions')) {
    let run = [];
    const flush = () => {
      if (run.length >= 3)
        add(
          run[0].line,
          'stacked-questions',
          `${run.length} questions`,
          run[0].display
        );
      run = [];
    };
    for (const r of rows) {
      if (!r.text.trim()) continue;
      if (isCloser(r.text)) {
        flush();
        continue;
      }
      if (r.text.trim().endsWith('?') && !isHashtagOnly(r.text)) run.push(r);
      else flush();
    }
    flush();
    for (const r of nonempty) {
      const n = (r.text.match(/\?/g) || []).length;
      if (n >= 3 && !isCloser(r.text))
        add(r.line, 'stacked-questions', `${n} question marks`, r.display);
    }
  }

  // "It's not a tool.\nIt's a teammate." is the same template across a line break.
  const contrast = active.find(r => r[0] === 'not-just-x');
  if (contrast) {
    for (let i = 1; i < nonempty.length; i++) {
      const a = nonempty[i - 1].text.trim();
      const b = nonempty[i].text.trim();
      if (
        /^it(?:'s| is) not\b/i.test(a) &&
        /^it(?:'s| is)\s+(?!not\b)/i.test(b)
      )
        out.push({
          file,
          line: nonempty[i - 1].line,
          rule: 'not-just-x',
          severity: contrast[1],
          match: `${a} / ${b}`.slice(0, 80),
          message: contrast[4],
          text: nonempty[i - 1].display.trim().slice(0, 140),
        });
    }
  }
  return out;
}

function applyDashCap(found, file) {
  const dashes = found.filter(f => f.rule === 'em-dash' && f.file === file);
  if (dashes.length <= dashCap)
    return found.filter(f => f.rule !== 'em-dash' || f.file !== file);
  if (dashCap > 0) {
    for (const f of dashes)
      f.message = `Dash used as punctuation (${dashes.length} in this text, cap ${dashCap}). Use a period, comma, colon or parentheses.`;
  }
  return found;
}

const findings = [];
for (const t of targets)
  for (const f of files(t)) {
    const rows = prose(f);
    const found = [];
    const structural = !/\.json$/i.test(f);
    for (const { line, text, display, key } of rows) {
      if (!text.trim()) continue;
      const lead = text.match(/^\s*/u)[0].length;
      for (const [id, sev, , re, msg] of active) {
        if (!re) continue;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
          if (
            (id === 'emoji' || id === 'emoji-docs') &&
            bulletOn &&
            m.index === lead
          )
            continue;
          const shown = display.slice(m.index, m.index + m[0].length);
          found.push({
            file: f,
            line,
            key,
            rule: id,
            severity: sev,
            match: shown.trim(),
            message: msg,
            text: display.trim().slice(0, 140),
          });
          if (!re.global) break;
        }
      }
    }
    if (structural) found.push(...structure(f, rows));
    findings.push(...applyDashCap(found, f));
  }

findings.sort(
  (a, b) =>
    String(a.file).localeCompare(String(b.file)) ||
    (a.line || 0) - (b.line || 0) ||
    a.rule.localeCompare(b.rule)
);

const capNote = args.includes('--max-dashes') ? ` (max-dashes ${dashCap})` : '';
if (flag('json'))
  console.log(JSON.stringify({ mode, maxDashes: dashCap, findings }, null, 2));
else {
  for (const x of findings)
    console.log(
      `${x.severity} ${x.file}${x.line ? ':' + x.line : x.key ? ' [' + x.key + ']' : ''}  ${x.rule}  "${x.match}"  ${x.message}`
    );
  const ban = findings.filter(x => x.severity === 'BAN').length;
  console.log(`\n${mode}${capNote}: ${ban} BAN, ${findings.length - ban} WARN`);
}
// exitCode, not exit(): exit() truncates large piped output.
// --strict fails on any finding. No findings → 0, with or without --strict.
const bans = findings.some(x => x.severity === 'BAN');
process.exitCode = bans || (flag('strict') && findings.length > 0) ? 1 : 0;
