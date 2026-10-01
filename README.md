# pi-daybreak-param

A Pi extension that adds persistent selection of the `access_programs.cyber` request parameter to Pi's OpenAI Responses provider. It gives you a `/daybreak` command and a `--daybreak-cyber` startup flag.

It targets the `openai` provider (`openai-responses` API) and works with both API-key auth and Sign in with ChatGPT. It does not touch the legacy `openai-codex` provider or any other provider.

Tested with Pi 0.99.1; other versions are unverified.

## Modes

| Mode | Meaning |
|---|---|
| `default` | Don't override anything. The request's existing value (or the service's default behavior) stands. This is *not* an explicit opt-out. |
| `standard` | Explicitly request standard safeguards. Distinct from `default`. |
| `daybreak_blue` | Request the `daybreak_blue` program. |
| `daybreak_red` | Request the `daybreak_red` program. |

A requested program is just that — a request. The service decides account eligibility and model compatibility; selecting a mode here is not evidence that the service approved or applied it.

## Installation

Try it from source without installing:

```sh
pi -e ./src/index.ts --daybreak-cyber daybreak_blue
```

Or install it:

```sh
# from npm
pi install npm:pi-daybreak-param

# from Git
pi install git:github.com/MercuriusDream/pi-daybreak-param

# from a local checkout
pi install /absolute/path/to/pi-daybreak-param
```

Run `/reload` in an active Pi session after installing or updating.

The published npm package declares `./src/index.ts` in its `pi.extensions` field and carries the `pi-package` keyword. Pi host APIs are peer dependencies and are not bundled.

## Usage

### Startup flag

```sh
pi --daybreak-cyber daybreak_blue
```

The flag overrides the saved mode for that session only. It is never written to disk.

### Command

| Command | What it does |
|---|---|
| `/daybreak` | Open the selection menu. |
| `/daybreak status` | Show the selected mode, or the configuration error if there is one. |
| `/daybreak daybreak_blue` | Request `daybreak_blue`. |
| `/daybreak daybreak_red` | Request `daybreak_red`. |
| `/daybreak standard` | Explicitly request standard safeguards. |
| `/daybreak default` | Remove this extension's override. |

Menu and mode commands save immediately and persist across sessions and reloads. A command changes the saved and current selection but not the startup flag — if you started Pi with `--daybreak-cyber`, the flag wins again at the next session start.

### Config file

The selection lives in `~/.pi/agent/daybreak.json` (or in the agent directory set by `PI_CODING_AGENT_DIR`).

- **No file** → `default`.
- **Malformed or unreadable file** → an error that *blocks* OpenAI requests, even if you passed a valid startup flag. Fix the file, or save a valid selection with `/daybreak <mode>`. A failed save also blocks requests rather than continuing with stale configuration.

## How requests are handled

With any mode other than `default`, the extension adds or replaces `access_programs.cyber` while preserving every other request field and any other access-program keys. Before sending an explicitly selected program, it validates the actual request model and the canonical OpenAI API endpoint.

Requests are delegated to Pi's own OpenAI Responses implementation: built-in models and both auth methods are preserved, and tools, cancellation, streaming, usage reporting, and instrumentation are all delegated.

The extension fails closed. Invalid startup selections, configuration errors, invalid command input, and invalid explicit-mode payloads never silently fall back to something else. API permission errors, unsupported-program errors, and model-compatibility errors are passed through as-is. It will not retry with a different program or model, drop the field after an error, or claim the service granted access.

`default` leaves existing request values alone — it won't strip a value set via `samplingParams` or by another extension.

## Footer display

In the interactive TUI, the extension uses Pi's `setFooter()` API to show the model, the requested program, and the reasoning effort on one line:

```text
gpt-6-sol • daybreak blue • max
```

The label shows what you *requested*, not a verified service decision. `standard` is labeled when explicitly selected; `default` adds no label. Configuration errors appear as `daybreak config error` — check `/daybreak status` or the startup notification for the full reason.

Pi has no public API for inserting a segment into its built-in footer, so in TUI mode this extension replaces the footer and reproduces its basic path, usage, context, model, and other-extension status information. Another extension that replaces the footer can conflict with this display. No custom footer is installed in non-interactive (print/JSON/RPC) modes.

## Limitations and security

Whether Daybreak is supported or entitled through Sign in with ChatGPT direct-token auth is **not established** by the available documentation — OpenAI documents the public Responses endpoint and the Daybreak request field separately. This extension sends the field; it does not grant access or prove the service applied it. See [docs/research.md](docs/research.md) for the full notes, including the SIWC references and the version-specific Pi source review.

A selected program still requires service approval and a compatible model. The extension never reads or logs credentials or request payloads. As with any Pi extension, review the source before installing.

## Development

Run the unit tests:

```sh
bun test
```

Optional offline integration tests run against installed Pi distributions:

```sh
PI_AI_TEST_DIST=/path/to/@earendil-works/pi-ai/dist \
PI_CODING_AGENT_TEST_DIST=/path/to/@earendil-works/pi-coding-agent/dist \
bun test
```

Wire-test HTTP requests are intercepted and use a dummy token. The tests cover request serialization, preservation of denied responses without downgrade, and validation failures that make no HTTP calls at all. The optional provider-composition test checks that Pi's built-in OpenAI models and both auth methods survive wrapping. None of this verifies real account approval or live Daybreak behavior.

## References

- [Pi Packages](https://pi.dev/docs/latest/packages)
- [OpenAI Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak)
