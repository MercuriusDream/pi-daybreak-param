import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Api, SimpleStreamOptions, StreamFunction } from "@earendil-works/pi-ai";
import { MODES, parseMode, selectCyberProgram, type CyberMode } from "./payload.ts";
import { createFooter } from "./footer.ts";
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
	let initialized = false;
	let configError: Error | undefined;
	const loadConfiguration = () => {
		initialized = true;
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
		}
	};
	const installFooter = (ctx: ExtensionContext) => {
		if (ctx.mode !== "tui") return;
		// Pi offers no public hook into one segment of its built-in footer. A
		// custom footer is necessary for an inline model • program • effort label.
		ctx.ui.setStatus("daybreak-param", undefined); // clear stale status from older versions
		ctx.ui.setFooter((_tui, theme, data) => createFooter(ctx, theme, data, () => mode, () => configError));
	};

	pi.on("session_start", (_event, ctx) => {
		loadConfiguration();
		if (configError && ctx.hasUI) ctx.ui.notify(configError.message, "error");
		installFooter(ctx);
	});
	pi.on("model_select", (_event, ctx) => installFooter(ctx));

	pi.registerCommand("daybreak", {
		description: `Configure persistent cyber selection, or /daybreak status: ${MODES.join(" | ")}`,
		handler: async (args, ctx) => {
			if (!initialized) loadConfiguration();
			let value = args.trim();
			if (value === "status") {
				ctx.ui.notify(configError?.message ?? `Cyber request selection: ${mode}.`, configError ? "error" : "info");
				return;
			}
			await ctx.waitForIdle();
			if (!value) {
				if (!ctx.hasUI) throw new Error("Use /daybreak <selection> or --daybreak-cyber in non-UI mode.");
				const selected = await ctx.ui.select(`Cyber request selection: ${configError ? "CONFIG ERROR" : mode}`, Object.values(LABELS));
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
				throw configError;
			}
			mode = next;
			initialized = true;
			configError = undefined;
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
			// Some hosts can invoke a registered provider before dispatching session_start.
			// Read the flag here, not in the extension factory (flags are populated later).
			if (!initialized) loadConfiguration();
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
