import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Api, SimpleStreamOptions, StreamFunction } from "@earendil-works/pi-ai";
import { isDirectOpenAI, MODES, parseMode, selectCyberProgram, type CyberMode } from "./payload.ts";
import type { ModeStore } from "./config.ts";

const LABELS: Record<CyberMode, string> = {
	standard: "Standard — explicit Daybreak opt-out",
	daybreak_blue: "Daybreak Blue — requires approved access",
	daybreak_red: "Daybreak Red — requires approved access",
	default: "Inherit — no override (not an opt-out)",
};

export function registerDaybreak(pi: ExtensionAPI, streamOpenAI: StreamFunction<Api, SimpleStreamOptions>, store: ModeStore) {
	pi.registerFlag("daybreak-cyber", {
		type: "string",
		description: `OpenAI access_programs.cyber request selection: ${MODES.join(", ")}. Requires approved access.`,
	});

	let mode: CyberMode = "default";
	let configError: Error | undefined = new Error("Daybreak configuration has not been initialized. OpenAI request blocked.");
	const refreshStatus = (ctx: ExtensionContext) => {
		if (ctx.hasUI) {
			ctx.ui.setStatus("daybreak-param", configError ? "Cyber config: ERROR" :
				mode !== "default" && isDirectOpenAI(ctx.model) ? `Cyber request: ${mode} (not verified)` : undefined);
		}
	};

	pi.on("session_start", (_event, ctx) => {
		const flag = pi.getFlag("daybreak-cyber");
		try {
			// Always validate stored configuration: a flag must not hide a broken config file.
			const saved = store.read();
			if (flag === undefined) {
				mode = saved;
			} else {
				const parsed = parseMode(flag);
				if (!parsed) throw new Error(`Invalid --daybreak-cyber value: ${String(flag)}. Expected ${MODES.join(", ")}.`);
				mode = parsed;
			}
			configError = undefined;
		} catch (error) {
			configError = new Error(`Daybreak configuration error: ${error instanceof Error ? error.message : String(error)} OpenAI requests are blocked until corrected.`);
			if (ctx.hasUI) ctx.ui.notify(configError.message, "error");
		}
		refreshStatus(ctx);
	});
	pi.on("model_select", (_event, ctx) => refreshStatus(ctx));

	pi.registerCommand("daybreak", {
		description: `Configure persistent cyber selection, or /daybreak status: ${MODES.join(" | ")}`,
		handler: async (args, ctx) => {
			let value = args.trim();
			if (value === "status") {
				ctx.ui.notify(configError?.message ?? `Cyber request selection: ${mode}. This is not confirmation of Daybreak access.`, configError ? "error" : "info");
				return;
			}
			await ctx.waitForIdle();
			if (!value) {
				if (!ctx.hasUI) throw new Error("Use /daybreak <selection> or --daybreak-cyber in non-UI mode.");
				const selected = await ctx.ui.select(`Cyber request selection: ${configError ? "CONFIG ERROR" : mode} (access not verified)`, Object.values(LABELS));
				if (selected === undefined) return; // Explicit user cancellation changes nothing.
				const entry = Object.entries(LABELS).find(([, label]) => label === selected);
				if (!entry) throw new Error("Invalid Daybreak menu selection.");
				value = entry[0];
			}
			const next = parseMode(value);
			if (!next) throw new Error(`Usage: /daybreak ${MODES.join(" | ")}. Invalid selection: ${value}`);
			try {
				store.write(next);
			} catch (error) {
				configError = new Error(`Failed to save Daybreak configuration: ${error instanceof Error ? error.message : String(error)} OpenAI requests are blocked until corrected.`);
				refreshStatus(ctx);
				throw configError;
			}
			mode = next;
			configError = undefined;
			refreshStatus(ctx);
			ctx.ui.notify(next === "default"
				? "Saved: inherit. Extension override disabled; existing payload and server defaults are unchanged."
				: `Saved: request ${next} on OpenAI Responses calls. OpenAI still checks model compatibility and your approved access.`, "info");
		},
	});

	// Preserve built-in models and BOTH authentication methods. Only delegate streaming.
	// Unlike extension event handlers, exceptions in this onPayload callback terminate
	// the provider stream before client.responses.create sends the HTTP request.
	pi.registerProvider("openai", {
		api: "openai-responses",
		streamSimple(model, context, options) {
			const requestMode = mode;
			const requestError = configError;
			return streamOpenAI(model, context, {
				...options,
				onPayload: async (payload, requestModel) => {
					if (requestError) throw requestError;
					const prior = await options?.onPayload?.(payload, requestModel);
					const current = prior === undefined ? payload : prior;
					const replacement = selectCyberProgram(current, requestModel, requestMode);
					return replacement === undefined ? current : replacement;
				},
			});
		},
	});
}
