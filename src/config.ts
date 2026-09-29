import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { parseMode, type CyberMode } from "./payload.ts";

export interface ModeStore {
	read(): CyberMode;
	write(mode: CyberMode): void;
}

export function fileModeStore(path: string): ModeStore {
	return {
		read() {
			let text: string;
			try {
				text = readFileSync(path, "utf8");
			} catch (error) {
				// An absent configuration is an intentional initial state, not error recovery.
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return "default";
				throw error;
			}
			const value: unknown = JSON.parse(text);
			if (typeof value !== "object" || value === null || Array.isArray(value)) {
				throw new Error(`Invalid Daybreak configuration at ${path}: expected an object.`);
			}
			const config = value as Record<string, unknown>;
			const mode = parseMode(config.cyber);
			if (config.version !== 1 || !mode) {
				throw new Error(`Invalid Daybreak configuration at ${path}: expected version 1 and a valid cyber selection.`);
			}
			return mode;
		},
		write(mode) {
			if (!parseMode(mode)) throw new Error("Invalid Daybreak selection; configuration was not saved.");
			mkdirSync(dirname(path), { recursive: true });
			const temp = `${path}.${randomUUID()}.tmp`;
			try {
				writeFileSync(temp, `${JSON.stringify({ version: 1, cyber: mode }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
				renameSync(temp, path);
			} catch (error) {
				try {
					unlinkSync(temp);
				} catch (cleanupError) {
					if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
						throw new AggregateError([error, cleanupError], "Failed to save Daybreak configuration and clean up temporary file.");
					}
				}
				throw error;
			}
		},
	};
}
