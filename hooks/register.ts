import type { EngineInterface, PluginOptions, Register, Timer, TurnUsage } from 'claude-code'

// Defaults for the settings `plugin.json` declares under `userConfig`.
const DEFAULTS = { longSeconds: 90, agents: 2, workTokens: 75_000 }

// Rough price weights, relative to uncached input of the same model.
const CACHE_WRITE_WEIGHT = 1.25
const OUTPUT_WEIGHT = 5
// Steps answered by a cheaper model tier count for less; any other model counts in full.
const MODEL_WEIGHTS: ReadonlyArray<readonly [RegExp, number]> = [
  [/haiku/i, 0.25],
  [/sonnet/i, 0.6],
]

// Tools whose whole run is spent waiting on the person.
const WAITS_ON_PERSON = new Set(['AskUserQuestion', 'ExitPlanMode'])

const SOUND = 'sounds/computing.wav'

type Settings = { longMs: number; agents: number; workTokens: number; sound: boolean; gain: number }

type Turn = {
  id: string
  startedAt: number
  // Time spent waiting on the person so far, and since when if waiting right now.
  pausedMs: number
  pausedSince?: number
  // The tools the person is being asked about right now, by name.
  waits: Set<string>
  timer?: Timer
  agents: number
  work: number
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
    workTokens: number('workTokens'),
    sound: options.sound !== false,
    gain: Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 400) / 100 : 1,
  }
}

function beep($: EngineInterface, why: string) {
  if (turn === undefined || turn.hasBeeped) return
  turn.hasBeeped = true
  turn.timer?.cancel()
  $.ui.toast(`🤖 Computing... ${why}`, { timeoutMs: 8000 })
  if (settings.sound) {
    $.audio.play({ asset: SOUND }, { gain: settings.gain }).catch(() => {})
  }
}

// Arms the "taking a while" timer for what is left of the limit, counting only
// the time not spent waiting on the person.
function arm($: EngineInterface, now: number) {
  const t = turn
  if (t === undefined || t.hasBeeped || t.pausedSince !== undefined) return
  t.timer?.cancel()
  const remaining = settings.longMs - (now - t.startedAt - t.pausedMs)
  t.timer = $.clock.after(Math.max(remaining, 0), () => beep($, 'taking a while'))
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

// What a model step cost in new work: what it read for the first time, wrote
// to the cache and answered. Cache re-reads are left out on purpose: they grow
// with the session, not with the request.
function workOf(usage: TurnUsage) {
  const weight = MODEL_WEIGHTS.find(([model]) => model.test(usage.model))?.[1] ?? 1

  return weight * (usage.input_tokens + CACHE_WRITE_WEIGHT * usage.cache_creation_input_tokens + OUTPUT_WEIGHT * usage.output_tokens)
}

export const register: Register = (on, options) => {
  settings = readSettings(options)

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      // A subagent's loop started: it works for the request running now.
      if (turn !== undefined) agentTurn.set(e.agentId, turn.id)

      return next(e)
    }

    turn?.timer?.cancel()
    const now = await $.clock.now()
    turn = { id: e.turnId, startedAt: now, pausedMs: 0, waits: new Set(), agents: 0, work: 0, hasBeeped: false }
    arm($, now)

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId !== undefined) {
      agentTurn.delete(e.agentId)
    } else if (turn?.id === e.turnId) {
      turn.timer?.cancel()
      turn = undefined
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    if (turn !== undefined) {
      turn.agents += 1
      if (e.workflow !== undefined || turn.agents >= settings.agents) {
        beep($, 'agents at work')
      }
    }

    const spawned = await next(e)
    if (spawned.agentId !== undefined && turn !== undefined) agentTurn.set(spawned.agentId, turn.id)

    return spawned
  })

  // Every model request, the main loop's or a subagent's, adds its new work to the request it works for.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const t = turn
    const isOwned = e.agentId === undefined || agentTurn.get(e.agentId) === t?.id
    if (t !== undefined && result.usage !== null && isOwned) {
      t.work += workOf(result.usage)
      if (t.work >= settings.workTokens) {
        beep($, 'so many tokens')
      }
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
