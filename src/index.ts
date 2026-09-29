import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openAIResponsesApi } from "@earendil-works/pi-ai/compat";
import { registerDaybreak } from "./controller.ts";
import { fileModeStore } from "./config.ts";

export default function daybreak(pi: ExtensionAPI) {
	registerDaybreak(pi, openAIResponsesApi().streamSimple, fileModeStore(join(getAgentDir(), "daybreak.json")));
}
