import { expect, test } from 'claude-code/testing'

test('/bip-bup turns PM Mode off, keeps it, and reads it back next session', async ($, on) => {
  // Nothing sits beneath the plugin: these hooks stand for the engine.
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await $.command.run({ command: 'bip-bup' })).text).toContain('PM Mode on · Sounds on')

  const off = await $.command.run({ command: 'bip-bup', args: 'pm off' })
  expect(off.text).toContain('PM Mode off · Sounds on')
  expect(store.get('pmMode')).toBe(false)

  await $.command.run({ command: 'bip-bup', args: 'sounds off' })
  expect(store.get('sound')).toBe(false)

  // A new session reads the switches back from the store.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await $.command.run({ command: 'bip-bup' })).text).toContain('PM Mode off · Sounds off')

  expect((await $.command.run({ command: 'bip-bup', args: 'pm maybe' })).text).toContain('Try /bip-bup')
})
