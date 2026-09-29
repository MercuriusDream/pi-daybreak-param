import { expect, test } from "bun:test";
import { registerDaybreak } from "../src/controller.ts";

const aiDist = process.env.PI_AI_TEST_DIST;
const codingDist = process.env.PI_CODING_AGENT_TEST_DIST;
test.skipIf(!aiDist || !codingDist)("Pi's real provider composer preserves OpenAI models and both auth methods", async () => {
	const { openaiProvider } = await import(`${aiDist}/providers/openai.js`);
	const { streamSimple } = await import(`${aiDist}/api/openai-responses.js`);
	const { composeModelProvider } = await import(`${codingDist}/core/provider-composer.js`);
	const base = openaiProvider();
	let extension: any;
	registerDaybreak({
		registerFlag: () => {}, on: () => {}, registerCommand: () => {},
		registerProvider: (_id: string, config: any) => { extension = config; },
	} as any, streamSimple, { read: () => "default", write: () => {} });
	const composed = composeModelProvider("openai", base, { getProvider: () => undefined }, extension);
	expect(composed.getModels()).toEqual(base.getModels());
	expect(composed.auth.apiKey).toBeDefined();
	expect(composed.auth.oauth).toBeDefined();
	expect(composed.auth.oauth.loginLabel).toBe("Sign in with ChatGPT");
	expect(composed.auth.oauth.isSubscription).toBe(true);
});
