import { expect, test } from "bun:test";
import { registerDaybreak } from "../src/controller.ts";

// Optional installed-Pi integration tests. All HTTP is intercepted; no credentials or live API calls.
const dist = process.env.PI_AI_TEST_DIST;
const model = {
	provider: "openai", api: "openai-responses", id: "test-model", name: "Test",
	baseUrl: "https://api.openai.com/v1", reasoning: false, input: ["text"],
	contextWindow: 10000, maxTokens: 1000,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
async function provider(flag: string) {
	const { streamSimple } = await import(`${dist}/api/openai-responses.js`);
	let implementation: any;
	let start: any;
	registerDaybreak({
		registerFlag: () => {}, getFlag: () => flag, registerCommand: () => {},
		on: (event: string, handler: any) => { if (event === "session_start") start = handler; },
		registerProvider: (_id: string, config: any) => { implementation = config; },
	} as any, streamSimple, { read: () => "default", write: () => {} });
	start({}, { model, hasUI: false });
	return implementation;
}
const context = { messages: [{ role: "user", content: "Hello", timestamp: 0 }] };

test.skipIf(!dist)("installed OpenAI client serializes program and preserves denial without downgrade", async () => {
	const impl = await provider("daybreak_blue");
	let sent: any;
	let requestCount = 0;
	const result = await impl.streamSimple(model, context, {
		apiKey: "dummy-offline-token", maxRetries: 0,
		fetch: async (_url: unknown, init: RequestInit) => {
			requestCount++;
			sent = JSON.parse(init.body as string);
			return new Response(JSON.stringify({ error: { message: "access_program_not_enabled", code: "access_program_not_enabled", type: "invalid_request_error" } }), {
				status: 403, headers: { "content-type": "application/json" },
			});
		},
	}).result();
	expect(sent.access_programs).toEqual({ cyber: "daybreak_blue" });
	expect(sent.model).toBe(model.id);
	expect(requestCount).toBe(1);
	expect(result.stopReason).toBe("error");
	expect(result.errorMessage).toContain("access_program_not_enabled");
});

for (const flag of ["invalid", "daybreak_blue"]) {
	test.skipIf(!dist)(`invalid configuration/payload fails before HTTP (${flag})`, async () => {
		const impl = await provider(flag);
		let requestCount = 0;
		const result = await impl.streamSimple(model, context, {
			apiKey: "dummy-offline-token", maxRetries: 0,
			onPayload: () => ({ model: model.id, access_programs: null }),
			fetch: async () => { requestCount++; throw new Error("HTTP must not be reached"); },
		}).result();
		expect(requestCount).toBe(0);
		expect(result.stopReason).toBe("error");
		expect(result.errorMessage).toContain(flag === "invalid" ? "Invalid --daybreak-cyber" : "access_programs must be an object");
	});
}
