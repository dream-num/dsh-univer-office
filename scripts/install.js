#!/usr/bin/env node
/**
 * One-command installer for the DSH × Univer plugin.
 *
 * Usage:  npx @univer-cli/dsh-univer-plugin install
 *         univer-dsh install
 *
 * What it does on the target machine:
 *   1. Copies this package into ~/.dsh/profiles/node_modules/@univer-cli/dsh-univer-plugin
 *      (the DSH web profile module scope the loader resolves from).
 *   2. Appends the loader entry to ~/.dsh/profiles/web/cordis.patch.yml
 *      (idempotent — never duplicates).
 *   3. Detects the univer CLI (global install) and reports daemon state.
 *   4. Prints what to do next (refresh the app).
 *
 * Also supports: univer-dsh uninstall  (removes package + loader entry)
 */
import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // <pkg>/scripts
const PKG_ROOT = join(HERE, ".."); // <pkg>
const PROFILES = join(homedir(), ".dsh", "profiles");
const TARGET = join(PROFILES, "node_modules", "@univer-cli", "dsh-univer-plugin");
const PATCH = join(PROFILES, "web", "cordis.patch.yml");
const ENTRY_ID = "univer";
const ENTRY_NAME = "@univer-cli/dsh-univer-plugin";
const ROW = `    - id: ${ENTRY_ID}\n      name: '${ENTRY_NAME}'`;

const PATCH_BLOCK = `# DSH × Univer integration: CLI/daemon management (node half) + preview UI (client half).
- insert:
${ROW}
`;

/** Run a command, never throwing. */
function run(cmd, args, timeoutMs = 15000) {
	return new Promise((resolve) => {
		execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
			resolve({ ok: !error, stdout: String(stdout), stderr: String(stderr) });
		});
	});
}

/** Detect a usable univer CLI and report its version. */
async function detectCli() {
	const probe = await run("univer", ["--version"]);
	if (probe.ok) {
		return { found: true, version: probe.stdout.trim().split(/\s+/)[1] ?? probe.stdout.trim() };
	}
	const candidates = [
		join(homedir(), ".hermes/node/bin/node"),
		join(homedir(), ".local/bin/node")
	];
	const scripts = [
		join(homedir(), ".hermes/node/lib/node_modules/univer-cli/bin/univer.js"),
		join(homedir(), ".local/bin/univer")
	];
	for (const node of candidates) {
		for (const script of scripts) {
			const probe2 = await run(node, [script, "--version"]);
			if (probe2.ok) {
				return { found: true, version: probe2.stdout.trim().split(/\s+/)[1] ?? probe2.stdout.trim(), via: "global install" };
			}
		}
	}
	return { found: false };
}

/** Copy this package into the profile module scope (fresh copy each time). */
function deploy() {
	rmSync(TARGET, { recursive: true, force: true });
	mkdirSync(TARGET, { recursive: true });
	// Explicit copies — never a recursive copy of the whole package: the npx
	// cache path itself contains node_modules, which path filters can't see.
	cpSync(join(PKG_ROOT, "lib"), join(TARGET, "lib"), { recursive: true });
	cpSync(join(PKG_ROOT, "package.json"), join(TARGET, "package.json"));
	const readme = join(PKG_ROOT, "README.md");
	if (existsSync(readme)) cpSync(readme, join(TARGET, "README.md"));
}

/** Append the loader entry idempotently. */
function patchLoader() {
	if (!existsSync(PATCH)) {
		mkdirSync(dirname(PATCH), { recursive: true });
		writeFileSync(PATCH, "# DSH web profile patch layer.\n" + PATCH_BLOCK);
		return "created";
	}
	const content = readFileSync(PATCH, "utf8");
	if (content.includes(ROW)) return "already-present";
	// The profile template ships as a lone `[]` empty array; appending an
	// `- insert:` entry after it would be invalid YAML. Drop that template
	// line first so the file stays a valid top-level array.
	const base = content
		.replace(/^\s*\[\]\s*$/m, "")
		.replace(/\s*$/, "\n");
	writeFileSync(PATCH, base + "\n" + PATCH_BLOCK);
	return "appended";
}

/** Remove the package and loader entry (uninstall). */
function uninstall() {
	rmSync(TARGET, { recursive: true, force: true });
	if (existsSync(PATCH)) {
		const content = readFileSync(PATCH, "utf8");
		const block = content.includes(ROW) ? content.replace(new RegExp(`\\n?#[^\n]*\\n- insert:\\n${ROW}\\n?`), "") : content;
		writeFileSync(PATCH, block.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
	}
}

const action = process.argv[2] ?? "install";
if (action === "uninstall") {
	uninstall();
	console.log("✅ univer-dsh plugin removed. Restart/refresh the app (Cmd+R).");
	process.exit(0);
}
if (action !== "install") {
	console.error(`Unknown command "${action}". Usage: univer-dsh install | uninstall`);
	process.exit(1);
}

deploy();
const patchResult = patchLoader();
const cli = await detectCli();
const gateway = await probeGateway();

console.log("");
console.log("✅ DSH × Univer plugin installed");
console.log("────────────────────────────────────────────");
console.log(`  Plugin location: ${TARGET}`);
console.log(`  Loader entry:    ${patchResult === "already-present" ? "already present (not duplicated)" : "written to cordis.patch.yml"}`);
if (cli.found) {
	console.log(`  univer CLI: ✅ found (version ${cli.version})`);
} else {
	console.log("  univer CLI: ⚠️ not found — required for preview. Install with: npm i -g univer-cli");
}
console.log(`  daemon: ${gateway !== null ? `✅ running (${gateway})` : "not running (auto-starts when a preview opens)"}`);
console.log("");
console.log("👉 Next: refresh the DeepSeek Harness window (Cmd+R) to use the plugin");
console.log("   (turns that run univer commands show a preview card; click to expand full-screen)");
console.log("   Uninstall: univer-dsh uninstall");

/** Probe the univer gateway on known ports. */
async function probeGateway() {
	for (const port of [8000, 9123]) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1200) });
			if (res.ok) return `http://127.0.0.1:${port}`;
		} catch {
			/* try next */
		}
	}
	return null;
}
