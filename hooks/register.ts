import type { EngineInterface, PluginOptions, Register, Timer } from 'claude-code'

// Defaults for the settings `plugin.json` declares under `userConfig`.
const DEFAULTS = { longSeconds: 120, agents: 3, outputTokens: 20_000, steps: 40 }

// Nothing plays before a request has run this long: a quick answer never beeps,
// whatever its first steps looked like.
const QUIET_MS = 20_000

// Output from a cheaper model tier counts for less; any other model counts in full.
const MODEL_WEIGHTS: ReadonlyArray<readonly [RegExp, number]> = [
  [/haiku/i, 0.25],
  [/sonnet/i, 0.6],
]

// Tools whose whole run is spent waiting on the person.
const WAITS_ON_PERSON = new Set(['AskUserQuestion', 'ExitPlanMode'])

const SOUND = 'sounds/computing.wav'

type Settings = { longMs: number; agents: number; outputTokens: number; steps: number; sound: boolean; gain: number }

type Turn = {
  id: string
  startedAt: number
  // Time spent waiting on the person so far, and since when if waiting right now.
  pausedMs: number
  pausedSince?: number
  // The tools the person is being asked about right now, by name.
  waits: Set<string>
  timer?: Timer
  // A rule that fired inside the quiet window, held until the window ends.
  held?: string
  holdTimer?: Timer
  agents: number
  steps: number
  output: number
  hasBeeped: boolean
}

let settings: Settings = readSettings({})
let turn: Turn | undefined
// Which request each running subagent works for, so one left running in the
// background by an earlier request is not charged to the current one.
const agentTurn = new Map<string, string>()

function readSettings(options: PluginOptions): Settings {
  const number = (key: keyof typeof DEFAULTS) => {
    const value = Number(options[key])
    return Number.isFinite(value) && value > 0 ? value : DEFAULTS[key]
  }

  // Volume is a percent of the recorded level, 0 to 400; the player takes a linear gain of 0 to 4.
  const volume = Number(options.volume)

  return {
    longMs: number('longSeconds') * 1000,
    agents: number('agents'),
    outputTokens: number('outputTokens'),
    steps: number('steps'),
    sound: options.sound !== false,
    gain: Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 400) / 100 : 1,
  }
}

// How long the request has run, not counting time spent waiting on the person.
function activeMs(t: Turn, now: number) {
  return now - t.startedAt - t.pausedMs - (t.pausedSince === undefined ? 0 : now - t.pausedSince)
}

function stop(t: Turn) {
  t.timer?.cancel()
  t.holdTimer?.cancel()
}

function beep($: EngineInterface, t: Turn, why: string) {
  t.hasBeeped = true
  stop(t)
  $.ui.toast(`🤖 Computing... ${why}`, { timeoutMs: 8000 })
  if (settings.sound) {
    $.audio.play({ asset: SOUND }, { gain: settings.gain }).catch(() => {})
  }
}

// A rule fired: beep, or, inside the quiet window, hold it until the window
// ends and beep then only if the request is still running.
async function signal($: EngineInterface, why: string) {
  const t = turn
  if (t === undefined || t.hasBeeped) return
  const now = await $.clock.now()
  if (turn !== t || t.hasBeeped) return
  const wait = QUIET_MS - activeMs(t, now)
  if (wait <= 0) {
    beep($, t, why)
    return
  }
  t.held ??= why
  t.holdTimer ??= $.clock.after(wait, () => {
    t.holdTimer = undefined
    if (turn === t && t.held !== undefined) void signal($, t.held)
  })
}

// Arms the "taking a while" timer for what is left of the limit, counting only
// the time not spent waiting on the person.
function arm($: EngineInterface, now: number) {
  const t = turn
  if (t === undefined || t.hasBeeped || t.pausedSince !== undefined) return
  t.timer?.cancel()
  t.timer = $.clock.after(Math.max(settings.longMs - activeMs(t, now), 0), () => void signal($, 'taking a while'))
}

async function pause($: EngineInterface, tool: string) {
  const t = turn
  if (t === undefined || t.waits.has(tool)) return
  t.waits.add(tool)
  if (t.pausedSince !== undefined) return
  const now = await $.clock.now()
  // The wait may have ended, or another begun, while the clock was read.
  if (turn !== t || t.waits.size === 0 || t.pausedSince !== undefined) return
  t.pausedSince = now
  t.timer?.cancel()
}

async function resume($: EngineInterface, tool: string) {
  const t = turn
  if (t === undefined || !t.waits.delete(tool) || t.waits.size > 0 || t.pausedSince === undefined) return
  const now = await $.clock.now()
  if (turn !== t || t.pausedSince === undefined) return
  t.pausedMs += now - t.pausedSince
  t.pausedSince = undefined
  arm($, now)
}

export const register: Register = (on, options) => {
  settings = readSettings(options)

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      // A subagent's loop started: it works for the request running now.
      if (turn !== undefined) agentTurn.set(e.agentId, turn.id)

      return next(e)
    }

    if (turn !== undefined) stop(turn)
    const now = await $.clock.now()
    turn = { id: e.turnId, startedAt: now, pausedMs: 0, waits: new Set(), agents: 0, steps: 0, output: 0, hasBeeped: false }
    arm($, now)

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId !== undefined) {
      agentTurn.delete(e.agentId)
    } else if (turn?.id === e.turnId) {
      stop(turn)
      turn = undefined
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    if (turn !== undefined) {
      turn.agents += 1
      if (e.workflow !== undefined || turn.agents >= settings.agents) {
        void signal($, 'agents at work')
      }
    }

    const spawned = await next(e)
    if (spawned.agentId !== undefined && turn !== undefined) agentTurn.set(spawned.agentId, turn.id)

    return spawned
  })

  // Each model request adds to the request it works for: the main loop's count
  // as steps, and every one's output counts as tokens. Input and cache writes
  // are left out: a new session's first answer writes all of Claude's
  // instructions to the cache, and a session resumed after a pause writes its
  // whole conversation again, so they grow with the session, not the request.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const t = turn
    const isOwned = e.agentId === undefined || agentTurn.get(e.agentId) === t?.id
    if (t === undefined || !isOwned) return result

    if (e.agentId === undefined) {
      t.steps += 1
      if (t.steps >= settings.steps) void signal($, 'big job')
    }
    if (result.usage !== null) {
      const weight = MODEL_WEIGHTS.find(([model]) => model.test(result.usage?.model ?? ''))?.[1] ?? 1
      t.output += weight * result.usage.output_tokens
      if (t.output >= settings.outputTokens) void signal($, 'so many tokens')
    }

    return result
  })

  // A permission dialog opened: the person is deciding, so the clock stops until that tool call ends.
  on('classic.PermissionRequest', async ($, e, next) => {
    await pause($, e.tool_name)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (WAITS_ON_PERSON.has(e.tool)) await pause($, e.tool)
    try {
      return await next(e)
    } finally {
      await resume($, e.tool)
    }
  })
}
