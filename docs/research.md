# Research and integration notes

## Pi version inspected

Installed `@earendil-works/pi-coding-agent` **0.99.1**, including the installed JavaScript, declarations, and bundled source-map TypeScript. This is a version-specific source review, not a claim about an uninspected upstream revision.

Relevant paths under Pi's `packages/` source layout:

- `ai/src/providers/openai.ts`: the new `openai` provider offers API-key auth and **Sign in with ChatGPT**, using the public Responses API.
- `ai/src/auth/oauth/openai-chatgpt.ts`: dynamic public OAuth client, `resource=https://api.openai.com/v1`, scope `chatgpt.tokens.use.direct`. Its `toAuth` returns the access token to the existing API implementation. The extension does not change this flow.
- `ai/src/providers/openai-codex.ts`: a separate, explicitly legacy provider using `https://chatgpt.com/backend-api` and `openai-codex-responses`. Not the target of this extension.
- `ai/src/api/openai-responses.ts`: `buildParams` has no named `access_programs` field, but merges generic `samplingParams` last. `stream` invokes `options.onPayload` before calling `client.responses.create`. Its ChatGPT-specific field omissions do not strip an extension-added `access_programs` value.
- `coding-agent/src/core/sdk.ts`: the payload callback dispatches extension `before_provider_request` handlers.
- `coding-agent/src/core/extensions/runner.ts`: each handler receives the prior handler's payload; a non-undefined return replaces the whole payload. Handler exceptions are reported, not an effective way to block the request.
- `coding-agent/src/core/extensions/types.ts`: payload event contains only `payload`, not request model/auth metadata. The context exposes the selected model, which is not necessarily the routed physical request model.
- `coding-agent/examples/extensions/provider-payload.ts`: reference for returning the replacement payload directly.

There is **no explicit built-in Daybreak switch or `access_programs.cyber` option** in the inspected Pi request implementation. However, generic `samplingParams` can already carry the field. Therefore an extension is a convenient command/flag interface, not the only way to serialize the parameter.

## OpenAI documentation

- [Responses API Daybreak guide](https://developers.openai.com/api/docs/guides/daybreak): `access_programs.cyber` accepts `standard`, `daybreak_blue`, `daybreak_red`; optional omission lets the server choose its defaults. The parameter selects approved access, it does not grant approval. Model compatibility matters. `null` is not a request value.
- [Daybreak overview](https://help.openai.com/en/articles/20001258-openai-daybreak-trusted-access-for-cyber-overview) and [migration guide](https://help.openai.com/en/articles/20001532-openai-daybreak-migration-org-consolidation-guide): official Codex signed in with ChatGPT has a Daybreak toggle in its Advanced model picker, with account/workspace eligibility controls. This does not document the legacy backend wire protocol or prove third-party direct-token entitlement.

The new Pi sign-in flow reaches the documented public endpoint, so the extension can serialize the documented field. **Whether the SIWC route accepts/honors that field, and whether a particular direct ChatGPT OAuth grant is entitled to Daybreak, are not established by source inspection or offline tests.** The API-key/project examples in the guide should not be presented as proof of subscription-token approval. No real credentials were read and no authenticated requests were made during development.

Research used indexed official-page text; direct fetch of the Daybreak guide failed through the available fetch service. Treat rollout and entitlement details as something to confirm with OpenAI for your account.

## Extension contracts and boundaries

Uses `pi.on`, `registerFlag`, `registerCommand`, `ctx.ui.setStatus`, and a thin `registerProvider("openai", { api, streamSimple })` wrapper around Pi's own OpenAI Responses implementation. The initially considered payload-event approach was removed because its swallowed exceptions cannot satisfy the user's fail-closed requirement.

- `coding-agent/src/core/provider-composer.ts` confirms that a stream-only legacy registration preserves the existing models and composes both built-in authentication methods when neither models nor auth overrides are supplied.
- The wrapper composes the existing `onPayload` callback, then validates/transforms the body using the **actual request model**. Callback errors propagate through the OpenAI implementation into a terminal provider error before HTTP.
- Loading the factory only registers capabilities; no background resources, timers, credential access, or startup I/O.
- Explicit `default` is no override; `standard` is explicit opt-out. Explicit selection preserves other top-level request fields and other access-program keys.
- Invalid CLI configuration is retained as an error state that blocks OpenAI calls; it is not converted into default behavior. Invalid commands throw. Invalid payloads/endpoint/model identity throw when applying an explicit selection.
- Selection changes wait for idle. Menu/command selections persist atomically in the agent directory's `daybreak.json`. Each `session_start` validates that file, then selects the CLI override or saved value. Invalid reads/writes block OpenAI requests; only a genuinely absent config has the intentional initial inherit state.
- Pi's `setStatus` renders on a separate footer line and cannot place text between the model and thinking effort. In TUI mode the extension now uses the documented `ctx.ui.setFooter()` API to reproduce key footer content and render the requested cyber program inline between model and effort. It clears its old `daybreak-param` status, preserves other extension statuses, and shows config errors inline. It does not install a footer in print/JSON/RPC modes. Other custom-footer extensions may conflict; Pi has no supported compositional inline segment hook.
- Scope: requests through the `openai` provider and `openai-responses` API. An explicit program requires the canonical `https://api.openai.com/v1` endpoint and matching payload model ID. Both auth methods are preserved. Other providers, including legacy Codex, are outside this registration.
- Existing payload handlers run before this final transformation. `default` does not remove values configured in `samplingParams` or added elsewhere. Another provider replacement can conflict with this registration.
- No automatic retries with another program/model, permission-error masking, approval claims, or removal of safeguards.

### SIWC-specific documentation

[Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) documents direct OAuth-token use at `api.openai.com/v1/responses` and instructs callers not to use the ChatGPT backend endpoints. [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference) documents the audience and direct-token scope. [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) does not list `access_programs` among unsupported fields, but that omission is **not an explicit support guarantee**. Daybreak approval on another product surface is not documented as transferring to SIWC.

### Built-in settings limitation

A dedicated source review confirmed no supported extension API/event to append settings rows in Pi 0.99.1. `interactive-mode.ts` intercepts `/settings`, constructs the selector with explicit built-in configuration/callbacks, and `components/settings-selector.ts` builds hardcoded items and dispatches a hardcoded switch. Extension context settings are not a mutation/registration interface. The user subsequently chose `/daybreak` instead of a core change. The extension now provides a supported `/daybreak` selection dialog with persistent configuration; it does not claim native `/settings` integration or monkey-patch internals.

## Verification

Unit tests cover values, explicit default behavior, immutable merging, malformed-body errors, endpoint/model-identity errors, CLI initialization, command errors/changes/reset, and non-UI startup. Optional installed-Pi integration tests use a dummy token and intercepted HTTP to check that the real OpenAI client serializes the added field, preserves a 403 denial without retrying, and makes zero HTTP calls for invalid configuration or payload. This verifies transport, **not server entitlement**.
