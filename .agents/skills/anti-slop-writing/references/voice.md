# Voice reference

This describes how the user writes about their own projects, taken from the READMEs and CLAUDE.md files across their repositories. It is drawn from documentation, not social posts, so when rewriting one of the owner's posts, their draft's voice wins where the two differ. Most of those repositories are private, so this file describes traits instead of quoting them. The one quoted example is from the public [dja0086/netsuite-agent](https://github.com/dja0086/netsuite-agent) README.

> An agent builder that turns a NetSuite use case written in plain language into a Claude Managed Agent on Oracle's NetSuite AI Connector, with fixed safety rules; plus the SuiteCloud (SDF) project that holds every change to the NetSuite account.

## Traits

- **Opens with what the thing does** (in READMEs), as a noun phrase plus a mechanism: what goes in, what comes out, and the constraint that matters. No label and no greeting. Posts follow the same rule: open with what happened or what the tool does, never with a question.
- **Names real objects.** Products, record types, file paths, dates, ticket and ADR numbers. A reader can check every noun.
- **States limits and status plainly.** What is done, what was retired and when, what is synthetic or test-only, what cannot be regenerated.
- **Uses negatives to define scope**, not to dramatize: what is not installed, not allowed, not in scope.
- **Numbers carry units and dates**: `2026-10-31`, `Phases 1 to 3`, `at most 8`.
- **Short declarative sentences; semicolons over dashes** to join closely related clauses.

## Where the user's own drafts slip

Run on the user's repositories, the scanner's most common findings were em dashes used as heading separators and `— owner:` tags (about 115 in docs), effort words (`just`, `simple`, `quick`), and vague quantities (`many`, `often`, `typically`). One planning note quoted an owner mandate for `game-changing user experience`. Status emoji in tables are functional and are only a WARN in `docs` mode.

## Applying it to marketing

Marketing copy in this voice keeps the same moves: the mechanism first, a real number with its unit, the constraint stated honestly, and a CTA that names the action. Example rewrite:

- Slop: `Unlock seamless NetSuite insights with our all-in-one data experience!`
- Voice: `Query customers, transactions and employees in one grid, then export the rows on screen.`
