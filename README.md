# bip-bup 🤖

A Claude Code mod that goes "beep bop boop", like a cartoon computer thinking, when a request turns out bigger than it looked: long, agent-heavy or token-heavy. So you're not caught off guard when something you thought was quick ends up taking half an hour or burning a lot of tokens.

## When it plays

Once per request, the first time any of these happens:

| Rule | Default | What counts |
| --- | --- | --- |
| Taking a while | 90 s | Time the request has been running. Time spent waiting on you (a question, a plan to approve, a permission dialog) is not counted. |
| Agents at work | 2 | Subagents started by the request. A workflow counts at once, since it always runs several. |
| So many tokens | 75,000 | Weighted tokens of *new work* done by the request: uncached input, cache writes (×1.25) and output (×5). Steps run by a cheaper model weigh less (Haiku ×0.25, Sonnet ×0.6). |

The toast says which rule fired: "🤖 Computing... taking a while", "agents at work" or "so many tokens".

The thresholds, and whether the sound plays at all, are settings: Claude Code asks for them when you install the mod, and they're rows in its config menu (`/config` in a terminal session) afterwards.

## How it measures

- **Cache re-reads are left out on purpose.** Every model step re-reads the whole conversation from cache. That cost grows with the *session*, not with the *request*, so counting it makes the alert fire on almost every request once a session is long, and an alert that always fires says nothing. The token rule only counts what the request itself added.
- **Background subagents left over from an earlier request** keep running after it ends. Their tokens are not charged to the next request.
- **Waiting on you doesn't count as time**, with one limit: once a permission dialog opens for a tool, the clock stays paused until that tool call ends, because the engine gives no signal for the moment you answer. So a long command that first needed your permission is not counted against the time rule.
- The weights are rough. They stand for price ratios, and real prices differ by model and change over time.

The mod itself uses no tokens: it never calls the model and only reads the usage numbers every response already carries.

The sound plays on macOS. On Linux and Windows the toast still shows, but there is no sound.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install bip-bup --marketplace PabloManzoni/bip-bup
```

Answer `y` to add the marketplace, pick a scope with Enter, then accept or change the settings.

From a shell:

```bash
claude plugin install bip-bup --marketplace PabloManzoni/bip-bup
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `PabloManzoni/bip-bup`, then **Add plugin**.

## Development

- `hooks/register.ts` is the whole mod. Validate it with `claude plugin validate .` from the repo root.
- `scripts/make_sound.py` synthesizes the sound. Tweak the notes, then run `python3 scripts/make_sound.py sounds/computing.wav`.
- Once the mod has loaded in a session, Claude Code writes its type declarations to `.claude-plugin/types/` and a `tsconfig.json` beside them (both git-ignored). From then on `tsc -p .` type-checks it.

## License

MIT, see [LICENSE](LICENSE).
