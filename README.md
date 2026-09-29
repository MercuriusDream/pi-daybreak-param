# pi-daybreak-param

Persistent `/daybreak` configuration and explicit `access_programs.cyber` request selection for Pi's **new OpenAI → Sign in with ChatGPT** integration. Tested against Pi **0.99.1**.

**Experimental for ChatGPT direct-token authentication:** OpenAI documents the public Responses endpoint and the Daybreak request field separately, but does not explicitly confirm Daybreak support/entitlement for Sign in with ChatGPT direct-token grants. This extension sends the field; it does not grant access or prove that the server applied it. See [research](docs/research.md).

## Try it

```sh
pi -e ./src/index.ts --daybreak-cyber daybreak_blue
```

Install from npm:

```sh
pi install npm:pi-daybreak-param
```

Or install from GitHub (choose one source, not both):

```sh
pi install git:github.com/MercuriusDream/pi-daybreak-param
```

For local development: `pi install /absolute/path/to/pi-daybreak-param`. Reload an active Pi session with `/reload` after installation.

Use your existing **OpenAI / Sign in with ChatGPT** login. Authentication and token refresh remain Pi's responsibility. The wrapper also applies to API-key authentication on the same OpenAI provider. It does not modify the legacy `openai-codex` provider.

### Commands

```text
/daybreak                 Open the configuration picker
/daybreak status          Show requested selection or configuration error
/daybreak daybreak_blue    Explicitly request Blue
/daybreak daybreak_red     Explicitly request Red
/daybreak standard        Explicit opt-out: request standard safeguards
/daybreak default         Remove this extension's override (inherit existing/server behavior)
```

`standard` and `default` are **not the same**. Inheriting defaults may still enable Daybreak for an eligible account, and does not remove a field configured elsewhere. Use `standard` for explicit opt-out. The model must support the chosen program; errors are not retried with another tier or model.

Menu and command selections are saved atomically to `~/.pi/agent/daybreak.json` (or the directory specified by `PI_CODING_AGENT_DIR`). They apply immediately and survive reloads/new sessions. The CLI flag is a startup override and is not saved; at the next session start it takes precedence over the saved choice. A command changes the current choice and saves it, but does not modify the CLI flag.

An absent config intentionally means inherit/default. A malformed or unreadable config is an error that blocks OpenAI requests—even with a valid CLI flag. Correct it explicitly using `/daybreak <selection>` or repair the file. Other providers are outside the wrapper's scope.

## Footer display

When Pi runs in its interactive TUI, the extension uses Pi's supported `setFooter()` API to render **model • requested program • reasoning effort** on one line (for example `gpt-6-sol • daybreak blue • max`). No separate Daybreak extension-status line is added. `standard` appears when explicitly selected; `default` adds no label. Configuration errors appear inline as `daybreak config error`, with their full reason available from `/daybreak status` and the startup notification. The label is the **requested** selection, not proof the server granted Daybreak.

Pi does not expose an API to insert one segment into its built-in footer, so the extension replaces that footer in TUI mode and reproduces its basic path, usage, context, model, and other extensions' status lines. Other extensions replacing the footer can override this display (or vice versa). Non-interactive modes do not install a custom footer. `/reload` may be needed in an already-running session after updating the package.

## Why `/daybreak`, not `/settings`?

Pi 0.99.1's built-in `/settings` has hardcoded rows and callbacks, with no supported extension setting registration API. `/daybreak` therefore provides its own supported selection dialog and persistent configuration, without monkey-patching Pi or replacing the built-in settings screen.

## Errors, not silent fallback

The extension uses a thin provider-stream wrapper rather than the extension payload event: Pi catches payload-event handler exceptions and continues, which cannot enforce fail-closed validation.

- Invalid CLI selection blocks OpenAI calls and becomes a provider error, including in non-UI modes. Correct it explicitly via `/daybreak` or restart with a valid flag.
- Invalid command input is an error, leaving the prior selection unchanged.
- Invalid/unreadable stored configuration blocks requests. Save failures also block requests rather than silently continuing with stale settings.
- With an explicit selection, malformed payloads/access-program objects, mismatched request model IDs, and noncanonical endpoints fail **before HTTP**.
- API permission, unsupported-program, and model-compatibility errors are preserved. No downgrade, field omission retry, or alternate-model retry is added.
- The status displays **requested, not verified** access. No credential or payload logging.

The provider registration preserves built-in models/authentication and delegates to Pi's own OpenAI Responses implementation, including tools, cancellation, streaming, usage, and instrumentation. It uses the actual request model, not the selected-model approximation from `before_provider_request`.

## Tests

```sh
bun test
```

Optional offline wire tests against an installed Pi AI distribution:

```sh
PI_AI_TEST_DIST=/path/to/@earendil-works/pi-ai/dist \
PI_CODING_AGENT_TEST_DIST=/path/to/@earendil-works/pi-coding-agent/dist \
bun test
```

All wire-test HTTP is intercepted with a dummy token. Tests cover serialization and denied requests with no downgrade, plus validation failures that make **zero HTTP calls**. The optional provider-composition test also verifies that Pi's real composer retains the built-in OpenAI models, API-key authentication, and ChatGPT subscription authentication. Tests do not test real account approval or live Daybreak behavior.
