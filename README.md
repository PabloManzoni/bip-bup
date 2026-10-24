# bip-bup 🤖

A Claude Code mod that goes "beep bop boop", like a cartoon computer thinking, when a request turns out bigger than it looked: long, agent-heavy or token-heavy. So you're not caught off guard when something you thought was quick ends up taking half an hour or burning a lot of tokens.

## When it plays

Once per request, and only for requests that are really big. Nothing plays in the first 20 seconds: a quick answer never beeps. A rule that fires earlier is held, and plays at 20 s only if the request is still running.

| Rule | Default | What counts |
| --- | --- | --- |
| Taking a while | 120 s | Time the request has been running. Time spent waiting on you (a question, a plan to approve) is not counted. |
| Agents at work | 3 | Subagents started by the request. A workflow counts at once, since it always runs several. |
| So many tokens | 20,000 | Tokens Claude *writes* during the request, its subagents included. Output from a cheaper model weighs less (Haiku ×0.25, Sonnet ×0.6). |
| Big job | 40 | Model steps in the request, roughly one per tool call. |

A request still running after **25 minutes** plays it once more, "🤖 Computing... still going (25 min)", even if it already played for another rule. Time spent waiting on you doesn't count here either, and 0 turns it off.

The toast says which rule fired: "🤖 Computing... taking a while", "agents at work", "so many tokens" or "big job".

The thresholds, the volume and whether the sound plays at all are settings: Claude Code asks for them when you install the mod, and they're rows in its config menu (`/config` in a terminal session) afterwards. **Volume** goes from 0 to 400 % of the recorded level.

## How it measures

- **Only what Claude writes counts as tokens.** Input and cache tokens grow with the *session*, not with the request: a new session's first answer writes all of Claude's instructions to the cache, and a long session resumed after a pause writes its whole conversation again. Counting them made the alert fire on simple answers.
- **Background subagents left over from an earlier request** keep running after it ends. Their tokens are not charged to the next request.
- **Waiting on you doesn't count as time** when Claude asks you a question or a plan to approve. In a terminal session a permission dialog pauses the clock too, until that tool call ends. In the desktop app a built-in security plugin answers permission events before any mod sees them, so there only questions and plans pause it.

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
- `scripts/make_sound.py` synthesizes the sound: three soft tones, about 0.75 s. Tweak it, then run `python3 scripts/make_sound.py sounds/computing.wav`.
- Once the mod has loaded in a session, Claude Code writes its type declarations to `.claude-plugin/types/` and a `tsconfig.json` beside them (both git-ignored). From then on `tsc -p .` type-checks it.

## License

MIT, see [LICENSE](LICENSE).
