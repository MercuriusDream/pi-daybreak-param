import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionContext, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { CyberMode } from "./payload.ts";

const DISPLAY: Record<Exclude<CyberMode, "default">, string> = {
	standard: "standard",
	daybreak_blue: "daybreak blue",
	daybreak_red: "daybreak red",
};

export function modelLabel(model: ExtensionContext["model"], thinking: string | undefined, mode: CyberMode, error?: Error): string {
	const slug = model?.id ?? "no-model";
	const program = model?.provider === "openai" && error ? " • daybreak config error" :
		model?.provider === "openai" && mode !== "default" ? ` • ${DISPLAY[mode]}` : "";
	const effort = model?.reasoning ? ` • ${thinking && thinking !== "off" ? thinking : "thinking off"}` : "";
	return `${slug}${program}${effort}`;
}

function tokens(value: number): string {
	if (value < 1000) return `${value}`;
	if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
	if (value < 1000000) return `${Math.round(value / 1000)}k`;
	if (value < 10000000) return `${(value / 1000000).toFixed(1)}M`;
	return `${Math.round(value / 1000000)}M`;
}

function cwdLabel(cwd: string): string {
	const home = homedir();
	const relativePath = relative(resolve(home), resolve(cwd));
	return relativePath === "" ? "~" :
		relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath)
			? `~${sep}${relativePath}` : cwd;
}

function cleanStatus(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

export function createFooter(ctx: ExtensionContext, theme: Theme, data: ReadonlyFooterDataProvider, getMode: () => CyberMode, getError: () => Error | undefined) {
	return {
		invalidate() {},
		render(width: number): string[] {
			if (width <= 0) return [];
			let path = cwdLabel(ctx.sessionManager.getCwd());
			const branch = data.getGitBranch();
			if (branch) path += ` (${branch})`;
			const name = ctx.sessionManager.getSessionName();
			if (name) path += ` • ${name}`;
			const entries = ctx.sessionManager.getEntries();
			let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, cost = 0;
			for (const entry of entries) {
				if (entry.type !== "message") continue;
				const message = entry.message;
				if (message.role !== "assistant" && message.role !== "toolResult") continue;
				const usage = message.usage;
				if (!usage) continue;
				input += usage.input;
				output += usage.output;
				cacheRead += usage.cacheRead;
				cacheWrite += usage.cacheWrite;
				cost += usage.cost.total;
			}
			const stats = [
				input ? `↑${tokens(input)}` : "",
				output ? `↓${tokens(output)}` : "",
				cacheRead ? `R${tokens(cacheRead)}` : "",
				cacheWrite ? `W${tokens(cacheWrite)}` : "",
				cost ? `$${cost.toFixed(3)}` : "",
			].filter(Boolean);
			const context = ctx.getContextUsage();
			stats.push(`${context?.percent == null ? "?" : `${context.percent.toFixed(1)}%`}/${tokens(context?.contextWindow ?? ctx.model?.contextWindow ?? 0)}`);
			const left = stats.join(" ");
			let right = modelLabel(ctx.model, ctx.thinkingLevel, getMode(), getError());
			if (data.getAvailableProviderCount() > 1 && ctx.model) right = `(${ctx.model.provider}) ${right}`;
			const available = Math.max(0, width - visibleWidth(left) - 2);
			if (visibleWidth(right) > available) right = truncateToWidth(right, available, "");
			const padding = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
			const lines = [
				truncateToWidth(theme.fg("dim", path), width, ""),
				truncateToWidth(theme.fg("dim", left + padding + right), width, ""),
			];
			const statuses = [...data.getExtensionStatuses().entries()]
				.filter(([key]) => key !== "daybreak-param")
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([, text]) => cleanStatus(text));
			if (statuses.length) lines.push(truncateToWidth(statuses.join(" "), width, ""));
			return lines;
		},
	};
}
