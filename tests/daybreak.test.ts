import { describe, expect, test } from "bun:test";
import { registerDaybreak } from "../src/controller.ts";
import { MODES, parseMode, selectCyberProgram } from "../src/payload.ts";

const model = { provider: "openai", api: "openai-responses", id: "test-model", baseUrl: "https://api.openai.com/v1" };
const body = { model: model.id, input: [{ role: "user", content: "Hello" }], stream: true };

function harness(flag?: string) {
	const handlers = new Map<string, Function>();
	const commands = new Map<string, any>();
	const statuses: unknown[] = [];
	const notices: unknown[] = [];
	let provider: any;
	let saved = "default";
	let readError: Error | undefined;
	let writeError: Error | undefined;
	let selection: string | undefined;
	const store = {
		read: () => { if (readError) throw readError; return saved as any; },
		write: (mode: string) => { if (writeError) throw writeError; saved = mode; },
	};
	const ctx = {
		model, hasUI: true, waitForIdle: async () => {},
		ui: { setStatus: (...args: unknown[]) => statuses.push(args), notify: (...args: unknown[]) => notices.push(args), select: async () => selection },
	};
	registerDaybreak({
		registerFlag: () => {}, getFlag: () => flag,
		on: (event: string, handler: Function) => handlers.set(event, handler),
		registerCommand: (name: string, command: any) => commands.set(name, command),
		registerProvider: (_id: string, config: any) => { provider = config; },
	} as any, ((_model: any, _context: any, options: any) => options) as any, store);
	const request = (payload: unknown = body, requestModel = model, options?: any) =>
		provider.streamSimple(requestModel, {}, options).onPayload(payload, requestModel);
	return { handlers, commands, statuses, notices, ctx, request,
		getSaved: () => saved,
		setReadError: (error: Error) => { readError = error; },
		setWriteError: (error: Error) => { writeError = error; },
		setSelection: (value: string | undefined) => { selection = value; },
	};
}

describe("payload selection", () => {
	test("accepts only exact values", () => {
		for (const mode of MODES) expect(parseMode(mode)).toBe(mode);
		for (const bad of [undefined, null, "blue", "DAYBREAK_BLUE", "", {}, "daybreak_blue "]) expect(parseMode(bad)).toBeUndefined();
	});
	test("explicit default does not modify existing choices", () => {
		expect(selectCyberProgram(body, model, "default")).toBeUndefined();
		expect(selectCyberProgram({ ...body, access_programs: { cyber: "daybreak_blue" } }, model, "default")).toBeUndefined();
	});
	for (const mode of MODES.filter(m => m !== "default")) {
		test(`sets ${mode} immutably`, () => {
			const original = Object.freeze({ ...body, access_programs: Object.freeze({ other_program: "unchanged", cyber: "old" }) });
			const result = selectCyberProgram(original, model, mode)!;
			expect(result.access_programs).toEqual({ other_program: "unchanged", cyber: mode });
			expect(result.input).toBe(original.input);
			expect(original.access_programs.cyber).toBe("old");
		});
	}
	test("explicit selection errors for unsupported endpoint, API or model mismatch", () => {
		for (const different of [undefined, { ...model, provider: "openai-codex" }, { ...model, api: "openai-completions" }, { ...model, baseUrl: "https://example.com/v1" }, { ...model, baseUrl: "invalid" }, { ...model, id: "different" }]) {
			expect(() => selectCyberProgram(body, different, "daybreak_blue")).toThrow();
		}
	});
	test("rejects endpoint variants that bypass Pi's exact SIWC detection", () => {
		for (const baseUrl of [`${model.baseUrl}/`, `${model.baseUrl}?x=1`, `${model.baseUrl}#fragment`, "https://user@api.openai.com/v1", "https://api.openai.com:443/v1"]) {
			expect(() => selectCyberProgram(body, { ...model, baseUrl }, "daybreak_blue")).toThrow("direct OpenAI");
		}
	});
	test("malformed bodies and access_programs are errors", () => {
		for (const bad of [null, [], "body", {}, { ...body, access_programs: null }, { ...body, access_programs: [] }, { ...body, access_programs: "bad" }]) {
			expect(() => selectCyberProgram(bad, model, "daybreak_blue")).toThrow();
		}
	});
});

describe("fail-closed stream wrapper", () => {
	test("first request initializes configuration even without session_start", async () => {
		const flagged = harness("daybreak_blue");
		expect((await flagged.request()).access_programs.cyber).toBe("daybreak_blue");
		const saved = harness();
		await saved.commands.get("daybreak").handler("standard", saved.ctx);
		expect((await saved.request()).access_programs.cyber).toBe("standard");
		const inherited = harness();
		expect(await inherited.request()).toBe(body);
	});
	test("lazy initialization still blocks invalid flags and broken stored config", async () => {
		const invalid = harness("blue");
		await expect(invalid.request()).rejects.toThrow("Invalid --daybreak-cyber");
		const broken = harness("standard");
		broken.setReadError(new Error("broken JSON"));
		await expect(broken.request()).rejects.toThrow("broken JSON");
	});
	test("flag selects program and wrapper uses actual request model", async () => {
		const h = harness("daybreak_blue");
		h.handlers.get("session_start")!({}, h.ctx);
		expect((await h.request()).access_programs).toEqual({ cyber: "daybreak_blue" });
		expect(h.handlers.has("before_provider_request")).toBe(false);
	});
	test("invalid command is an error, explicit default restores no override", async () => {
		const h = harness();
		h.handlers.get("session_start")!({}, h.ctx);
		const command = h.commands.get("daybreak");
		await command.handler("standard", h.ctx);
		await expect(command.handler("invalid", h.ctx)).rejects.toThrow("Invalid selection");
		expect((await h.request()).access_programs.cyber).toBe("standard");
		await command.handler("default", h.ctx);
		expect(await h.request()).toBe(body);
	});
	test("session start resets to explicit CLI/default", async () => {
		const h = harness("standard");
		h.handlers.get("session_start")!({}, h.ctx);
		await h.commands.get("daybreak").handler("daybreak_red", h.ctx);
		h.handlers.get("session_start")!({}, h.ctx);
		expect((await h.request()).access_programs.cyber).toBe("standard");
	});
	test("invalid startup flag blocks requests in non-UI mode", async () => {
		const h = harness("blue");
		h.ctx.hasUI = false;
		h.handlers.get("session_start")!({}, h.ctx);
		await expect(h.request()).rejects.toThrow("Invalid --daybreak-cyber");
		expect(h.statuses).toEqual([]);
	});
	test("valid command can explicitly correct configuration error", async () => {
		const h = harness("blue");
		h.handlers.get("session_start")!({}, h.ctx);
		await h.commands.get("daybreak").handler("standard", h.ctx);
		expect((await h.request()).access_programs.cyber).toBe("standard");
	});
	test("prior payload transform is preserved, but malformed output errors", async () => {
		const h = harness("daybreak_blue");
		h.handlers.get("session_start")!({}, h.ctx);
		const changed = await h.request(body, model, { onPayload: () => ({ ...body, custom: 1 }) });
		expect(changed.custom).toBe(1);
		await expect(h.request(body, model, { onPayload: () => null })).rejects.toThrow("payload must be an object");
	});
	test("command persists selection and reload uses saved mode", async () => {
		const h = harness();
		h.handlers.get("session_start")!({}, h.ctx);
		await h.commands.get("daybreak").handler("daybreak_blue", h.ctx);
		expect(h.getSaved()).toBe("daybreak_blue");
		h.handlers.get("session_start")!({}, h.ctx);
		expect((await h.request()).access_programs.cyber).toBe("daybreak_blue");
	});
	test("menu selection saves; user cancellation leaves choice unchanged", async () => {
		const h = harness();
		h.handlers.get("session_start")!({}, h.ctx);
		h.setSelection("Standard — explicit Daybreak opt-out");
		await h.commands.get("daybreak").handler("", h.ctx);
		expect(h.getSaved()).toBe("standard");
		h.setSelection(undefined);
		await h.commands.get("daybreak").handler("", h.ctx);
		expect(h.getSaved()).toBe("standard");
	});
	test("config read failure blocks even with a valid CLI flag", async () => {
		const h = harness("standard");
		h.setReadError(new Error("broken JSON"));
		h.handlers.get("session_start")!({}, h.ctx);
		await expect(h.request()).rejects.toThrow("broken JSON");
	});
	test("config write failure errors and blocks requests rather than retaining a usable stale mode", async () => {
		const h = harness();
		h.handlers.get("session_start")!({}, h.ctx);
		h.setWriteError(new Error("permission denied"));
		await expect(h.commands.get("daybreak").handler("standard", h.ctx)).rejects.toThrow("Failed to save");
		await expect(h.request()).rejects.toThrow("permission denied");
	});
	test("explicit unsupported endpoint errors rather than sending without program", async () => {
		const h = harness("daybreak_blue");
		h.handlers.get("session_start")!({}, h.ctx);
		await expect(h.request(body, { ...model, baseUrl: "https://example.com/v1" })).rejects.toThrow("direct OpenAI");
	});
});
