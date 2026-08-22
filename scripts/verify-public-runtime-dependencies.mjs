#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const publicRegistry = "https://registry.npmjs.org/";
const script = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(script), "..");

function isolatedNpmEnvironment() {
	const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => {
		return !/^npm_config_/i.test(name) && !/^(?:node_auth_token|npm_token)$/i.test(name);
	}));
	environment.NPM_CONFIG_REGISTRY = publicRegistry;
	return environment;
}

function assertRegistrySpecifier(name, specifier) {
	if (typeof specifier !== "string" || specifier.length === 0) {
		throw new Error(`dependency ${name} has an invalid version specifier`);
	}
	if (
		/^(?:file|link|workspace|portal|patch|git|git\+|https?|ssh):/i.test(specifier)
		|| /^git@/i.test(specifier)
		|| /^(?:\.{0,2}\/|[A-Za-z]:[\\/])/.test(specifier)
		|| /^[^/\s]+\/[^/\s]+(?:#.*)?$/.test(specifier)
	) {
		throw new Error(`dependency ${name}@${specifier} is not an npm registry dependency`);
	}
}

async function packDependency(name, specifier, paths) {
	assertRegistrySpecifier(name, specifier);
	const target = `${name}@${specifier}`;
	console.log(`Checking ${target}`);
	let stdout;
	try {
		({ stdout } = await execFileAsync(process.platform === "win32" ? "npm.cmd" : "npm", [
			"pack",
			target,
			"--json",
			"--ignore-scripts",
			`--registry=${publicRegistry}`,
			`--userconfig=${paths.userConfig}`,
			`--globalconfig=${paths.globalConfig}`,
			`--cache=${paths.cache}`,
			`--pack-destination=${paths.downloads}`,
			"--prefer-online",
		], {
			cwd: paths.root,
			env: isolatedNpmEnvironment(),
			maxBuffer: 10 * 1024 * 1024,
		}));
	} catch (error) {
		const details = [error.stderr, error.stdout].filter(Boolean).join("\n").trim();
		throw new Error(`cannot download ${target} from ${publicRegistry}${details === "" ? "" : `\n${details}`}`);
	}

	let result;
	try {
		const parsed = JSON.parse(stdout);
		result = Array.isArray(parsed) ? parsed[0] : parsed;
	} catch {
		throw new Error(`npm returned invalid JSON while checking ${target}`);
	}
	if (result?.name !== name || typeof result.version !== "string" || typeof result.filename !== "string") {
		throw new Error(`npm resolved ${target} to an unexpected package`);
	}
	const archive = resolve(paths.downloads, basename(result.filename));
	if (!archive.startsWith(`${resolve(paths.downloads)}${sep}`) || !(await stat(archive)).isFile()) {
		throw new Error(`npm did not download an archive for ${target}`);
	}
	console.log(`Downloaded ${result.name}@${result.version}`);
}

export async function verifyPublicRuntimeDependencies(manifestPath = join(packageRoot, "package.json")) {
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const dependencies = manifest.dependencies;
	if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies)) {
		throw new Error("package.json dependencies must be an object");
	}
	const entries = Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right));
	const temporaryRoot = await mkdtemp(join(tmpdir(), "dsh-public-dependencies-"));
	const paths = {
		root: temporaryRoot,
		cache: join(temporaryRoot, "cache"),
		downloads: join(temporaryRoot, "downloads"),
		userConfig: join(temporaryRoot, "empty-user.npmrc"),
		globalConfig: join(temporaryRoot, "empty-global.npmrc"),
	};
	try {
		await Promise.all([
			mkdir(paths.downloads),
			writeFile(paths.userConfig, "registry=https://registry.npmjs.org/\n"),
			writeFile(paths.globalConfig, "registry=https://registry.npmjs.org/\n"),
		]);
		for (const [name, specifier] of entries) {
			await packDependency(name, specifier, paths);
		}
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
	console.log(`Verified ${entries.length} runtime dependencies on ${publicRegistry}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === script) {
	await verifyPublicRuntimeDependencies();
}
