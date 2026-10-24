# handoff-compact

A Claude Code mod that turns every compaction into a proper handover. The main session and every
subagent get one, and the work carries on afterwards. Each handover is also saved to disk.

## Why

Long sessions get expensive because every request re-sends the whole context. Compacting
sooner fixes that, but the default summary loses things: what the user said word for word, the
exact paths, why an option was rejected. So people put compaction off, and sessions grow to
hundreds of thousands of tokens.

With a handover written for a colleague who has seen nothing, you can compact at 250K and lose
almost nothing.

## What it does

- **Every compaction** is written as a handover with fixed sections:
  - Goal, with every user instruction quoted verbatim
  - State: done, in progress, and running agents, with absolute paths
  - Decisions, and options rejected
  - Key facts: numbers, ids, errors
  - Next steps
  - Gotchas
- **A copy is saved** to `.handoffs/<session>/`, so you can read it or start a new session from it.
- **Idle big sessions compact early.** A main session over 150K that sits idle for 4.5 minutes
  compacts before the prompt cache expires. Your next prompt then writes a small context instead
  of re-writing the whole thing at full price.

## Install

```
/plugin marketplace add Production-Grade/handoff-compact
/plugin install handoff-compact@handoff-compact
```

Set where compaction happens. Add this to the `env` block of `~/.claude/settings.json`:

```json
"CLAUDE_CODE_AUTO_COMPACT_WINDOW": "250000"
```

Add `.handoffs/` to `.gitignore`.

## Settings

Constants at the top of [`hooks/register.ts`](hooks/register.ts):

| Constant | Default | What it does |
|---|---|---|
| `IDLE_COMPACT_TOKENS` | `150_000` | Context size above which an idle session compacts |
| `IDLE_MS` | 4.5 min | How long a session sits idle first (the cache lasts about 5) |
| `HANDOVER` | see file | The handover instructions; change the sections to suit your work |

## What it hooks and writes

- `session.compact`: adds the handover instructions to the compaction request, then saves the summary it produced.
- `turn.start` and `turn.complete`: stop and start the idle timer for big main sessions.
- Writes only `.handoffs/<session>/<time>-<main|agent>.md` in your project: a copy of each handover for you to read. The mod never reads these back.

## More from Production Grade

Walkthroughs of these mods and of how I run Claude Code on real work:

- YouTube: [@productiongradeai](https://www.youtube.com/@productiongradeai)
- Substack: [productiongrade.substack.com](https://productiongrade.substack.com)

Part of [Claude Lean Mods](https://github.com/Production-Grade/claude-lean-mods). MIT licence.
