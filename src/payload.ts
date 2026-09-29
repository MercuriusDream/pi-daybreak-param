export const MODES = ["default", "standard", "daybreak_blue", "daybreak_red"] as const;
export type CyberMode = (typeof MODES)[number];

export function parseMode(value: unknown): CyberMode | undefined {
	return typeof value === "string" && MODES.includes(value as CyberMode)
		? (value as CyberMode)
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface RequestModel {
	provider: string;
	api: string;
	id: string;
	baseUrl: string;
}

export function isDirectOpenAI(model: RequestModel | undefined): boolean {
	// Match Pi's own SIWC detection exactly. Similar-looking URLs (including a
	// trailing slash, query, fragment, or userinfo) do not use the same code path.
	return model?.provider === "openai" && model.api === "openai-responses"
		&& model.baseUrl === "https://api.openai.com/v1";
}

/** Return the replacement body itself, not { payload: ... }. Never mutate other handlers' objects. */
export function selectCyberProgram(
	payload: unknown,
	model: RequestModel | undefined,
	mode: CyberMode,
): Record<string, unknown> | undefined {
	// Default is a no-op, preserving Pi/server defaults and other extensions' choices.
	if (mode === "default") return undefined;
	if (!isDirectOpenAI(model)) throw new Error("Daybreak selection requires the direct OpenAI Responses endpoint.");
	if (!isRecord(payload)) throw new Error("OpenAI request payload must be an object.");
	if (payload.model !== model!.id) throw new Error("OpenAI request model does not match the selected request model.");
	// Invalid values are errors, not a reason to silently send an unmodified request.
	if (payload.access_programs !== undefined && !isRecord(payload.access_programs)) {
		throw new Error("access_programs must be an object (not null).");
	}
	return {
		...payload,
		access_programs: { ...(payload.access_programs as Record<string, unknown> | undefined), cyber: mode },
	};
}
