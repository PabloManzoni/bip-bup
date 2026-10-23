import type { EngineInterface, Register } from 'claude-code'

// When a request counts as "this is going to be big". Tweak to taste.
const LONG_TURN_MS = 90_000
const MANY_AGENTS = 2
// Tokens weighted roughly by price, so cheap cache reads count little and output counts a lot.
const HEAVY_TOKENS = 250_000

const SOUND = 'sounds/computing.wav'

type Turn = {
  id: string
  startedAt: number
  agents: number
  tokens: number
  hasBeeped: boolean
}

let turn: Turn | undefined

function beep($: EngineInterface, why: string) {
  if (turn === undefined || turn.hasBeeped) return
  turn.hasBeeped = true
  $.ui.toast(`🤖 bip bup bip… ${why}`, { timeoutMs: 8000 })
  $.audio.play({ asset: SOUND }).catch(() => {})
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(5000, async () => {
      if (turn === undefined || turn.hasBeeped) return
      const elapsed = (await $.clock.now()) - turn.startedAt
      if (elapsed >= LONG_TURN_MS) {
        beep($, `still going after ${Math.round(elapsed / 1000)}s`)
      }
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      turn = { id: e.turnId, startedAt: await $.clock.now(), agents: 0, tokens: 0, hasBeeped: false }
    }

    return next(e)
  })

  on('agent.spawn', ($, e, next) => {
    if (turn !== undefined) {
      turn.agents += 1
      if (e.workflow !== undefined) {
        beep($, 'a multi-agent workflow started')
      } else if (turn.agents >= MANY_AGENTS) {
        beep($, `${turn.agents} subagents at work`)
      }
    }

    return next(e)
  })

  // Every model request, the main loop's and each subagent's, adds its cost to the running turn.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (turn !== undefined && result.usage) {
      const u = result.usage
      turn.tokens +=
        u.input_tokens + u.cache_creation_input_tokens * 1.25 + u.cache_read_input_tokens * 0.1 + u.output_tokens * 5
      if (turn.tokens >= HEAVY_TOKENS) {
        beep($, 'this is burning through a lot of tokens')
      }
    }

    return result
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined && turn?.id === e.turnId) {
      turn = undefined
    }

    return next(e)
  })
}
