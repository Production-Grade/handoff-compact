import type { Register, SessionMessage } from 'claude-code'

// The engine compacts at CLAUDE_CODE_AUTO_COMPACT_WINDOW (set in settings.json env), for the main
// session and every sub-agent, mid-turn, without stopping. This mod makes each of those compactions a
// proper handover and keeps a copy on disk.

// An idle main session above this compacts itself before the prompt cache expires (~5 min), so the
// next prompt re-writes a small context instead of the whole one.
const IDLE_COMPACT_TOKENS = 150_000
const IDLE_MS = 4.5 * 60_000

const HANDOVER = `Write this summary as a handover to a fresh colleague who must carry on the work with nothing else.
They have not seen this conversation. Be specific and complete; do not compress facts away.

## Goal
What the user asked for, in their words. Quote every instruction, correction and preference the user gave
verbatim, newest last, including ones about how to work (models, budgets, style, things never to do).

## State
- Done: each finished piece, with absolute file paths, commands that produced it and how it was verified.
- In progress: exactly where work stopped, the step being run, any background job (PID, output path, how to check).
- Agents/sessions running or reporting back: names/ids, what each was asked, what is still owed.

## Decisions
Choices made and why; options rejected and why, so they are not retried.

## Key facts
Numbers, ids, URLs, paths, error messages and findings that the next steps depend on. Keep them exact.

## Next steps
Ordered list of what to do next, the first one concrete enough to start immediately.

## Gotchas
What failed, what to avoid, open questions for the user.

Drop raw tool output, images and file dumps; keep only what they established.`

const summaryText = (messages: readonly SessionMessage[]) =>
  (messages.find(m => m.role === 'user' && m.text.length > 200) ?? messages[0])?.text ?? ''

export const register: Register = on => {
  let idleTimer: { cancel: () => void } | undefined
  let count = 0

  on('session.compact', async ($, e, next) => {
    const instructions = e.instructions?.includes('## Next steps')
      ? e.instructions
      : e.instructions ? `${HANDOVER}\n\nAlso, from the user: ${e.instructions}` : HANDOVER
    const done = await next({ ...e, instructions })
    if (done.skip !== undefined || e.trigger === 'precompute') return done

    const summary = summaryText(done.messages)
    if (!summary) return done
    try {
      const sid = await $.session.id()
      const stamp = new Date(await $.clock.now()).toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const who = e.agentId ? `agent-${e.agentId}` : 'main'
      const root = await $.session.root()
      const before = done.tokensBefore ? `${Math.round(done.tokensBefore / 1000)}K` : '?'
      const after = done.tokensAfter ? `${Math.round(done.tokensAfter / 1000)}K` : '?'
      await $.fs.write(`${root}/.handoffs/${sid}/${stamp}-${who}.md`, `<!-- ${e.trigger} compaction, ${who}, ${before} -> ${after} -->\n\n${summary}\n`)
      count++
      if (!e.agentId) $.ui.toast(`Compacted ${before} → ${after}; handover saved to .handoffs/`)
      $.ui.log(`${who} compacted ${before} → ${after} (${e.trigger}); handover: .handoffs/${sid}/${stamp}-${who}.md`)
    } catch (err) {
      $.ui.log(`handover not saved: ${String(err)}`)
    }
    return done
  }).catch(($, e, next) => next(e))

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) idleTimer?.cancel()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.isAborted) return done
    const { context } = await $.session.usage()
    const tokens = context.tokens ?? 0
    $.ui.status(`ctx ${Math.round(tokens / 1000)}K${count ? ` · ${count} handover${count > 1 ? 's' : ''}` : ''}`)
    idleTimer?.cancel()
    if (tokens > IDLE_COMPACT_TOKENS) {
      idleTimer = $.clock.after(IDLE_MS, () => {
        void $.session.compact({}).catch(() => undefined)
      })
    }
    return done
  })
}
