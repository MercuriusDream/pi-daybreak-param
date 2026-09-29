import { expect, test } from "bun:test";
import { createFooter, modelLabel } from "../src/footer.ts";
import { registerDaybreak } from "../src/controller.ts";
import { visibleWidth } from "@earendil-works/pi-tui";

const model = { id: "gpt-6-sol", provider: "openai", api: "openai-responses", baseUrl: "https://api.openai.com/v1", reasoning: true, contextWindow: 100000 };
const theme = { fg: (_color: string, text: string) => text } as any;
const data = {
	getGitBranch: () => "main",
	getAvailableProviderCount: () => 2,
	getExtensionStatuses: () => new Map([["some-other-extension", "other status"], ["daybreak-param", "old unwanted status"]]),
} as any;
const ctx = {
	mode: "tui", hasUI: true, model, thinkingLevel: "max",
	getContextUsage: () => ({ percent: 12.5, contextWindow: 100000 }),
	sessionManager: { getCwd: () => "/tmp", getSessionName: () => undefined, getEntries: () => [] },
} as any;

test("model • program • reasoning ordering is exact and does not claim verification", () => {
	expect(modelLabel(model as any, "max", "daybreak_blue")).toBe("gpt-6-sol • daybreak blue • max");
	expect(modelLabel(model as any, "high", "daybreak_red")).toBe("gpt-6-sol • daybreak red • high");
	expect(modelLabel(model as any, "max", "standard")).toBe("gpt-6-sol • standard • max");
	expect(modelLabel(model as any, "max", "default")).toBe("gpt-6-sol • max");
	expect(modelLabel(model as any, "max", "daybreak_blue", new Error("broken"))).toBe("gpt-6-sol • daybreak config error • max");
	expect(modelLabel({ ...model, provider: "anthropic" } as any, "max", "daybreak_blue")).toBe("gpt-6-sol • max");
});

test("custom footer keeps other statuses but removes old Daybreak status row", () => {
	const lines = createFooter(ctx, theme, data, () => "daybreak_blue", () => undefined).render(120);
	expect(lines[1]).toContain("(openai) gpt-6-sol • daybreak blue • max");
	expect(lines[2]).toBe("other status");
	expect(lines.join("\n")).not.toContain("not verified");
	expect(lines.join("\n")).not.toContain("old unwanted status");
});

test("narrow footer lines fit width", () => {
	for (const width of [1, 10, 40, 80]) {
		const lines = createFooter(ctx, theme, data, () => "daybreak_red", () => undefined).render(width);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
	}
});

test("configuration error appears inline without an extra extension row", () => {
	const lines = createFooter(ctx, theme, { ...data, getExtensionStatuses: () => new Map() }, () => "daybreak_blue", () => new Error("broken")).render(120);
	expect(lines.length).toBe(2);
	expect(lines[1]).toContain("gpt-6-sol • daybreak config error • max");
});

test("TUI registers inline footer, not separate Daybreak status; non-TUI does neither", () => {
	const handlers = new Map<string, Function>();
	let setFooter = 0;
	const statuses: unknown[] = [];
	const extCtx = { ...ctx, ui: { setFooter: () => setFooter++, setStatus: (...args: unknown[]) => statuses.push(args) } };
	registerDaybreak({
		registerFlag: () => {}, getFlag: () => "daybreak_blue", registerCommand: () => {}, registerProvider: () => {},
		on: (name: string, cb: Function) => handlers.set(name, cb),
	} as any, (() => {}) as any, { read: () => "default", write: () => {} });
	handlers.get("session_start")!({}, extCtx);
	expect(setFooter).toBe(1);
	expect(statuses).toEqual([["daybreak-param", undefined]]);
	handlers.get("session_start")!({}, { ...extCtx, mode: "rpc" });
	expect(setFooter).toBe(1);
});
