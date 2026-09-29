import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileModeStore } from "../src/config.ts";

const dirs: string[] = [];
function fixture() {
	const dir = mkdtempSync(join(tmpdir(), "pi-daybreak-test-"));
	dirs.push(dir);
	const path = join(dir, "daybreak.json");
	return { dir, path, store: fileModeStore(path) };
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("absent config intentionally inherits", () => {
	expect(fixture().store.read()).toBe("default");
});
test("saved choice persists and atomic writes leave no temp files", () => {
	const f = fixture();
	f.store.write("daybreak_blue");
	expect(fileModeStore(f.path).read()).toBe("daybreak_blue");
	f.store.write("standard");
	expect(JSON.parse(readFileSync(f.path, "utf8"))).toEqual({ version: 1, cyber: "standard" });
	expect(readdirSync(f.dir)).toEqual(["daybreak.json"]);
});
test("malformed JSON and invalid schema throw, not default", () => {
	const f = fixture();
	for (const text of ["{", "null", "[]", "{}", '{"version":2,"cyber":"standard"}', '{"version":1,"cyber":"blue"}']) {
		writeFileSync(f.path, text);
		expect(() => f.store.read()).toThrow();
	}
});
test("explicit valid save repairs broken config", () => {
	const f = fixture();
	writeFileSync(f.path, "bad json");
	expect(() => f.store.read()).toThrow();
	f.store.write("standard");
	expect(f.store.read()).toBe("standard");
});
test("invalid save does not overwrite valid config", () => {
	const f = fixture();
	f.store.write("standard");
	expect(() => f.store.write("invalid" as any)).toThrow();
	expect(f.store.read()).toBe("standard");
});
test("filesystem errors propagate", () => {
	const f = fixture();
	const store = fileModeStore(join(f.dir, "blocking-file", "daybreak.json"));
	writeFileSync(join(f.dir, "blocking-file"), "not a directory");
	expect(() => store.read()).toThrow();
	expect(() => store.write("standard")).toThrow();
});
