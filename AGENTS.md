# AGENTS.md — discord-claude-bot

> Conventions for AI coding agents (Codex, Claude, Cursor, Aider, Gemini, Copilot, others).
> Natural-language rules, no required frontmatter. Claude Code reads `CLAUDE.md` directly
> if present; this file is the cross-vendor base.
>
> **Before starting work, also read:**
> - `~/.claude/CLAUDE.md` — org-wide rules across weautomatehq1 projects
> - `~/.claude/skills/CANONICAL-PATTERN.md` — the cross-implementation spec
>
> If those files don't exist in your environment, the rules below are authoritative.

## What this is

A long-running Discord bot that's part of the IFleet control surface. PM2-managed on a
Hostinger VPS. Listens to `#ifleet` (channel id `1504120127791042631`) for `@ifleet`
mentions and `!ifleet …` commands, parses them into plans or GitHub Issues against
weautomatehq1 repos, and posts status back. Single-tenant: weautomatehq1 only.

Repo lives at `weautomatehq1/discord-claude-bot` on GitHub; local working copy at
`/Users/Seb/dev/coordination/discord-claude-bot/`.

## Stack

- Language: JavaScript (CommonJS — `require`, not `import`)
- Runtime: Node 20+
- Package manager: npm (`package-lock.json` present; do NOT introduce pnpm or yarn)
- Dependencies: `discord.js` ^14.26.4, `dotenv` ^17.4.2 — keep this minimal; new deps
  require justification
- Tests: **none yet** (placeholder script only). Add `node:test` or `vitest`
  before any substantial behavioral change.
- Typecheck: n/a (plain JS, no TypeScript in this repo today)
- Lint: **none yet**. Consider adding `eslint` if any feature work expands the codebase
  past 3 files.

## Verify before claiming done

Until tests exist, verification = focused live repro:
1. `node bot.js` starts without throwing
2. `node bot.js` logs `Logged in as <user>#<discrim>` against a test token in a sandbox
   (use a separate test bot, never the prod token)
3. For new commands: post the trigger message in a test channel, confirm the expected
   response appears

"Should work" is not done. Demonstrated behavior is done.

**When you fix a bug:** before opening a PR, post the test-channel evidence (log output
or screenshot) in the PR description. The 2026-06-02 audit closed a token-guard bug
(AUDIT-IFleet-c75a203e) where the lack of repro evidence let a regression slip past
review for weeks.

## Don't touch without explicit instruction

- `.env` — contains `DISCORD_BOT_TOKEN` and possibly more. Never edit, never commit,
  never echo to logs. File mode MUST stay `0600` (chmod 600) per closed audit
  AUDIT-IFleet-1105518f. Verify with `ls -l .env`.
- `.env.example` — keep keys in sync with `.env`, NEVER include real values.
- `package-lock.json` — regenerate via `npm install`, never hand-edit.
- The PM2 entry for `discord-claude-bot` in IFleet's `ecosystem.config.cjs`
  (different repo) — managed by IFleet's deploy. Don't propose changes here; open
  an issue in IFleet.
- `bot.js` line ~86 (`client.login(...)`) — must remain guarded by an explicit
  check on `process.env.DISCORD_BOT_TOKEN` per closed audit AUDIT-IFleet-c75a203e.
  If the token is missing, process MUST `process.exit(2)` (not 0, not 1) so PM2
  treats it as a fatal config error rather than a normal exit. Do NOT remove
  this guard.
- Git history rewrites — no `--force`, no `--no-verify`, no `git reset --hard`,
  no `git add -A`.

## Commit style

- Format: `<type>(<scope>): <imperative summary>` — e.g., `fix(bot): guard missing token before login`
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Stage specific files by name. Never commit `.env` or any secret.

## Deeper context

- `~/.claude/skills/CANONICAL-PATTERN.md` — cross-impl spec
- IFleet repo at `weautomatehq1/IFleet` — owns the queue + PM2 deploy + routing for
  this bot. See `IFleet/docs/ARCHITECTURE.md` for system-of-systems view.
- `.audits/index.json` (if present) — open findings against this repo

## Project-specific notes

- Process `exit(2)` on missing critical env vars (not 0 or 1) so PM2 logs the
  difference between "clean shutdown," "uncaught error," and "fatal config gap."
- The bot subscribes to `messageCreate` events; messages prefixed with `!!` are
  intentionally ignored (see commit b9a645c). Don't remove that filter without
  understanding the use case (operator escape hatch).
- All tokens, IDs, and channel snowflakes belong in `.env` — never inline them in
  source. The `#ifleet` channel id is documented in this file as a non-secret
  reference because it's not authentication material.
- This repo is in early-feature state. Conventions WILL evolve; if you find this
  doc out of date with the code, that's a bug to file — open an issue or PR
  updating AGENTS.md alongside your change.
