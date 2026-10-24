import { expect, test } from 'claude-code/testing'

const SUMMARY = 'This session is being continued from a previous conversation. '.repeat(10)

test('a compaction gets the handover brief and is saved', async ($, on) => {
  let told: string | undefined
  const written: { path: string; text: string }[] = []
  on('session.compact', (_, e) => {
    told = e.instructions
    return { messages: [{ role: 'user', text: SUMMARY, toolUses: [] }], tokensBefore: 251_000, tokensAfter: 18_000 }
  })
  on('session.id', () => ({ value: 'sess1' }))
  on('session.root', () => ({ value: '/proj' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 24, 3, 4, 5) }))
  on('fs.write', (_, e) => {
    written.push({ path: e.path, text: e.text })
    return { value: undefined }
  })

  // The engine hands the hook the transcript; the kit's call does not, so the test gives one.
  await $.session.compact({ instructions: 'keep the B-roll list', messages: [{ role: 'user', text: 'do the B-roll', toolUses: [] }] } as never)

  expect(told).toContain('## Next steps')
  expect(told).toContain('keep the B-roll list')
  expect(written.length).toBe(1)
  expect(written[0]?.path).toBe('/proj/.handoffs/sess1/2026-10-24T03-04-05-main.md')
  expect(written[0]?.text).toContain('251K -> 18K')
})

test('a vetoed compaction writes nothing', async ($, on) => {
  let wrote = false
  on('session.compact', () => ({ skip: 'off' }))
  on('fs.write', () => {
    wrote = true
    return { value: undefined }
  })
  await $.session.compact({ messages: [{ role: 'user', text: 'do the B-roll', toolUses: [] }] } as never)
  expect(wrote).toBe(false)
})
