# bip-bup 🤖

A Claude Code mod that goes "bip bup bip", like a cartoon computer thinking, when a request turns out long or heavy. So you're not caught off guard when something you thought was quick ends up taking half an hour or burning a lot of tokens.

It plays once per request, the first time any of these happens:

- the request has been running for more than 90 seconds and is still going,
- 2 or more subagents are launched, or a workflow starts,
- token usage crosses a threshold (weighted roughly by price: cached context reads count little, and what Claude writes counts a lot).

It also shows a toast saying why it went off. The thresholds are at the top of `hooks/register.ts`.

The mod itself uses no tokens: it never calls the model and only reads the usage numbers every response already carries.

The sound plays on macOS. On Linux and Windows the toast still shows, but there is no sound.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install bip-bup --marketplace PabloManzoni/bip-bup
```

Answer `y` to add the marketplace, then pick a scope with Enter.

From a shell:

```bash
claude plugin install bip-bup --marketplace PabloManzoni/bip-bup
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `PabloManzoni/bip-bup`, then **Add plugin**.
