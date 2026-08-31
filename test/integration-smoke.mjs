import { mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const { Context } = await import("@deepseek-ai/cordis");
const packageRoot = process.env.UNIVER_PLUGIN_ROOT;
if (packageRoot !== undefined && !isAbsolute(packageRoot)) throw new Error("UNIVER_PLUGIN_ROOT must be absolute");
const manifestPath = packageRoot === undefined ? new URL("../package.json", import.meta.url) : join(packageRoot, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.dependencies?.["@univerjs-pro/exchange-node"] !== undefined) {
	throw new Error("published package must bundle @univerjs-pro/exchange-node instead of installing it at runtime");
}
const gatewayArtifact = packageRoot === undefined
	? new URL("../artifacts/gateway.cjs", import.meta.url)
	: join(packageRoot, "artifacts", "gateway.cjs");
if ((await readFile(gatewayArtifact, "utf8")).includes('require("@univerjs-pro/exchange-node")')) {
	throw new Error("bundled Gateway must not require @univerjs-pro/exchange-node at runtime");
}
const entry = packageRoot === undefined
	? new URL("../lib/index.js", import.meta.url).href
	: pathToFileURL(join(packageRoot, "lib", "index.js")).href;
const { GatewayUniverService, resolveConfig } = await import(entry);
const scratch = await mkdtemp(join(tmpdir(), "dsh-univer-integration-smoke-"));
const workspace = await realpath(scratch);
const file = join(workspace, "smoke.univer");
const source = join(workspace, "import.csv");
const svgSource = join(workspace, "slide.svg");
const exported = join(workspace, "smoke.xlsx");
const screenshotOutput = join(workspace, "screenshots");
const resourceOutput = join(workspace, "resources");
await writeFile(source, "name,value\nalpha,1\nbeta,2\n");
await writeFile(svgSource, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#f7f8fb"/><text x="80" y="160" font-family="Arial" font-size="54" fill="#182230">Bundled SVG</text></svg>');

const { foreign, occupiedPort, availablePort } = await occupyPortWithFreeSuccessor();
const origin = `http://127.0.0.1:${availablePort}`;
const service = new GatewayUniverService(new Context(), resolveConfig({ gatewayPort: occupiedPort, tools: false }));
const scoped = { workspace, file };

try {
	const [started, joinedStart] = await Promise.all([service.ensureGateway(), service.ensureGateway()]);
	if (!started.ok || started.gateway !== origin || started.reused !== false) {
		throw new Error(`plugin failed to start bundled Gateway: ${JSON.stringify(started)}`);
	}
	if (!joinedStart.ok || joinedStart.gateway !== origin || joinedStart.reused !== false) {
		throw new Error(`concurrent callers did not join the same Gateway startup: ${JSON.stringify(joinedStart)}`);
	}
	const foreignResponse = await fetch(`http://127.0.0.1:${occupiedPort}`);
	if (await foreignResponse.text() !== "not a Univer Gateway") {
		throw new Error("plugin must not reuse or terminate the service occupying its initial port");
	}
	const reused = await service.ensureGateway();
	if (!reused.ok || reused.gateway !== origin || reused.reused !== true) {
		throw new Error(`plugin failed to reuse its own Gateway: ${JSON.stringify(reused)}`);
	}
	const viewer = await fetch(`${origin}/`);
	if (!viewer.ok || !(await viewer.text()).includes("<html")) {
		throw new Error("bundled Viewer index was not served");
	}

	const created = await service.newFile(scoped);
	if (!created.ok || created.operation !== "new" || created.result?.created !== true) {
		throw new Error(`new Univer file failed: ${JSON.stringify(created)}`);
	}
	const empty = await service.status(scoped);
	if (empty.result?.trunk?.units?.length !== 0) throw new Error(`new file must be empty: ${JSON.stringify(empty)}`);

	const worktreeOperation = await service.worktree({ ...scoped, action: "create", name: "integration smoke" });
	const worktree = worktreeOperation.result;
	if (worktree === null || typeof worktree !== "object" || Array.isArray(worktree)
		|| typeof worktree.worktreeId !== "string" || worktree.status !== "draft") {
		throw new Error(`create worktree failed: ${JSON.stringify(worktree)}`);
	}
	const worktreeId = worktree.worktreeId;

	const createdUnit = await service.unit({ ...scoped, action: "create", worktreeId, kind: "sheet", name: "Smoke" });
	const unitId = createdUnit.result?.unitId;
	if (typeof unitId !== "string") throw new Error(`create Unit failed: ${JSON.stringify(createdUnit)}`);

	const temporary = await service.unit({ ...scoped, action: "create", worktreeId, kind: "doc", name: "Temporary" });
	if (typeof temporary.result?.unitId !== "string") throw new Error(`temporary Unit failed: ${JSON.stringify(temporary)}`);
	const removed = await service.unit({ ...scoped, action: "remove", worktreeId, unitId: temporary.result.unitId });
	if (removed.result?.removed !== true) throw new Error(`remove Unit failed: ${JSON.stringify(removed)}`);

	const slide = await service.unit({ ...scoped, action: "create", worktreeId, kind: "slide", name: "Rendered" });
	const slideUnitId = slide.result?.unitId;
	if (typeof slideUnitId !== "string") throw new Error(`Slide Unit failed: ${JSON.stringify(slide)}`);
	const base = await service.unit({ ...scoped, action: "create", worktreeId, kind: "base", name: "Tasks" });
	const baseUnitId = base.result?.unitId;
	if (typeof baseUnitId !== "string") throw new Error(`Base Unit failed: ${JSON.stringify(base)}`);
	const board = await service.unit({ ...scoped, action: "create", worktreeId, kind: "board", name: "Planning Board" });
	const boardUnitId = board.result?.unitId;
	if (typeof boardUnitId !== "string") throw new Error(`Board Unit failed: ${JSON.stringify(board)}`);
	const compiledSvg = await service.compileSvg({
		...scoped,
		source: svgSource,
		sourceWorkspace: workspace,
		worktreeId,
		unitId: slideUnitId,
		page: 1,
	});
	if (compiledSvg.operation !== "compile-svg" || compiledSvg.result?.execution?.committed !== true) {
		throw new Error(`SVG compile/apply failed: ${JSON.stringify(compiledSvg)}`);
	}
	const layout = await service.lintUnitLayout({ ...scoped, worktreeId, unitId: slideUnitId });
	if (layout.operation !== "lint" || layout.result?.kind !== "unit-layout-lint"
		|| layout.result?.coverage?.pages?.length !== 1 || !Array.isArray(layout.result?.findings)) {
		throw new Error(`Slide layout lint failed: ${JSON.stringify(layout)}`);
	}
	const screenshot = await service.screenshotUnit({
		...scoped,
		worktreeId,
		unitId: slideUnitId,
		output: screenshotOutput,
		outputWorkspace: workspace,
		target: { kind: "paged-unit", pages: [1], contactSheet: {}, scale: 1 },
	});
	if (screenshot.operation !== "screenshot" || screenshot.result.images.length !== 2
		|| screenshot.result.images.some((image) => image.mediaType !== "image/png" || image.data.length === 0)) {
		throw new Error(`Slide screenshot failed: ${JSON.stringify(screenshot)}`);
	}
	for (const image of screenshot.result.images) {
		if ((await stat(image.path)).size === 0) throw new Error(`screenshot produced an empty file: ${image.path}`);
	}

	const executed = await service.executeUnitContent({
		...scoped,
		worktreeId,
		unitId,
		code: 'workbook.getActiveSheet().getRange("A1").setValue("bundled"); return "ok";',
	});
	if (executed.result?.committed !== true || executed.result?.value !== "ok") {
		throw new Error(`package-local execute failed: ${JSON.stringify(executed)}`);
	}
	const [leftExecution, rightExecution] = await Promise.all([
		service.executeUnitContent({
			...scoped,
			worktreeId,
			unitId,
			code: 'workbook.getActiveSheet().getRange("A2").setValue("left"); return "left";',
		}),
		service.executeUnitContent({
			...scoped,
			worktreeId,
			unitId,
			code: 'workbook.getActiveSheet().getRange("B2").setValue("right"); return "right";',
		}),
	]);
	if (leftExecution.result?.committed !== true || leftExecution.result?.value !== "left"
		|| rightExecution.result?.committed !== true || rightExecution.result?.value !== "right") {
		throw new Error(`concurrent Collaboration SDK execution failed: ${JSON.stringify({ leftExecution, rightExecution })}`);
	}
	const boardExecution = await service.executeUnitContent({
		...scoped,
		worktreeId,
		unitId: boardUnitId,
		code: 'const review = board.insertShape({ shapeType: api.Enum.ShapeTypeEnum.RoundRect, transform: { left: 80, top: 80, width: 180, height: 100 } }); const approve = board.insertShape({ shapeType: api.Enum.ShapeTypeEnum.RoundRect, transform: { left: 320, top: 80, width: 180, height: 100 } }); if (!review || !approve) throw new Error("Cannot insert Board shapes"); review.getText().setText("Review"); approve.getText().setText("Approve"); return [review.getId(), approve.getId()];',
	});
	const boardElementIds = boardExecution.result?.value;
	if (boardExecution.result?.committed !== true || !Array.isArray(boardElementIds)
		|| boardElementIds.length !== 2 || boardElementIds.some((id) => typeof id !== "string")) {
		throw new Error(`Board execution failed: ${JSON.stringify(boardExecution)}`);
	}

	const imported = await service.importUnitContent({
		...scoped,
		source,
		sourceWorkspace: workspace,
		worktreeId,
		name: "Imported",
	});
	const importedUnitId = imported.result?.unitId;
	if (typeof importedUnitId !== "string" || imported.result?.kind !== "sheet") {
		throw new Error(`import Unit failed: ${JSON.stringify(imported)}`);
	}

	const selected = await service.status({ ...scoped, worktreeId });
	if (selected.result?.selectedWorktree?.units?.length !== 5) {
		throw new Error(`worktree status did not return explicit Units: ${JSON.stringify(selected)}`);
	}
	const inspected = await service.inspectUnitContent({ ...scoped, worktreeId, unitId, range: "A1:B2" });
	const values = inspected.result?.ranges?.[0]?.displayValues;
	if (values?.[0]?.[0] !== "bundled" || values?.[1]?.[0] !== "left" || values?.[1]?.[1] !== "right") {
		throw new Error(`package-local inspect failed: ${JSON.stringify(inspected)}`);
	}
	const inspectedImport = await service.inspectUnitContent({ ...scoped, worktreeId, unitId: importedUnitId, range: "A1:B3" });
	if (inspectedImport.result?.ranges?.[0]?.displayValues?.[1]?.[0] !== "alpha") {
		throw new Error(`import readback failed: ${JSON.stringify(inspectedImport)}`);
	}
	const inspectedBase = await service.inspectUnitContent({ ...scoped, worktreeId, unitId: baseUnitId });
	if (inspectedBase.result?.kind !== "base" || inspectedBase.result?.tables?.[0]?.name !== "Table 1"
		|| inspectedBase.result?.tables?.[0]?.fields?.[0]?.name !== "Name") {
		throw new Error(`Base overview inspection failed: ${JSON.stringify(inspectedBase)}`);
	}
	const inspectedBoard = await service.inspectUnitContent({ ...scoped, worktreeId, unitId: boardUnitId });
	if (inspectedBoard.result?.kind !== "board"
		|| !inspectedBoard.result?.elements?.some((element) => element.id === boardElementIds[0] && element.text === "Review")
		|| !inspectedBoard.result?.elements?.some((element) => element.id === boardElementIds[1] && element.text === "Approve")) {
		throw new Error(`Board overview inspection failed: ${JSON.stringify(inspectedBoard)}`);
	}
	const inspectedBoardElements = await service.inspectUnitContent({
		...scoped,
		worktreeId,
		unitId: boardUnitId,
		elementIds: boardElementIds,
	});
	if (inspectedBoardElements.result?.kind !== "board-element"
		|| inspectedBoardElements.result?.elements?.length !== 2
		|| inspectedBoardElements.result?.elements?.some((element, index) => element.id !== boardElementIds[index] || element.type !== "shape")) {
		throw new Error(`Board element inspection failed: ${JSON.stringify(inspectedBoardElements)}`);
	}

	const found = await service.apiReference({ action: "find", queries: ["setValue"], unit: "sheet", limit: 3 });
	if (found.result?.[0]?.matches?.[0]?.label !== "FRange.setValue") throw new Error(`API find failed: ${JSON.stringify(found)}`);
	const boardFound = await service.apiReference({ action: "find", queries: ["insertImage"], unit: "board", limit: 3 });
	if (boardFound.result?.[0]?.matches?.[0]?.label !== "FBoard.insertImage") {
		throw new Error(`Board API find failed: ${JSON.stringify(boardFound)}`);
	}
	const baseFound = await service.apiReference({ action: "find", queries: ["getSchema"], unit: "base", limit: 3 });
	if (baseFound.result?.[0]?.matches?.[0]?.label !== "FBase.getSchema") {
		throw new Error(`Base API find failed: ${JSON.stringify(baseFound)}`);
	}
	const reference = await service.apiReference({ action: "show", queries: ["FRange.setValue"] });
	if (reference.result?.[0]?.status !== "found") throw new Error(`API reference failed: ${JSON.stringify(reference)}`);

	const registries = await service.resources({ action: "registries" });
	if (!Array.isArray(registries.result?.registries) || registries.result.registries.length === 0) {
		throw new Error(`resource registries failed: ${JSON.stringify(registries)}`);
	}
	const resources = await service.resources({ action: "find", queries: ["plausible"], limit: 1 });
	const handle = resources.result?.resources?.[0]?.handle;
	if (typeof handle !== "string") throw new Error(`resource find failed: ${JSON.stringify(resources)}`);
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (input, init) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		if (url.startsWith("https://")) {
			return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>', {
				status: 200,
				headers: { "content-type": "image/svg+xml; charset=utf-8" },
			});
		}
		return originalFetch(input, init);
	};
	try {
		const readResource = await service.resources({ action: "read", handle });
		if (typeof readResource.result?.svg !== "string" || !readResource.result.svg.includes("<svg")) {
			throw new Error(`resource read failed: ${JSON.stringify(readResource)}`);
		}
		const exportedResource = await service.resources({
			action: "export",
			handles: [handle],
			output: resourceOutput,
			outputWorkspace: workspace,
		});
		const resourcePath = exportedResource.result?.exported?.[0]?.path;
		if (typeof resourcePath !== "string" || (await stat(resourcePath)).size === 0) {
			throw new Error(`resource export failed: ${JSON.stringify(exportedResource)}`);
		}
	} finally {
		globalThis.fetch = originalFetch;
	}

	await service.exportUnitContent({ ...scoped, worktreeId, unitId, output: exported, outputWorkspace: workspace });
	if ((await stat(exported)).size === 0) throw new Error("package-local export produced an empty file");

	await expectTransition(worktreeId, "ready", "ready");
	await expectTransition(worktreeId, "reopen", "draft");
	await expectTransition(worktreeId, "ready", "ready");
	await expectTransition(worktreeId, "merge", "merged");
	const merged = await service.status(scoped);
	if (merged.result?.trunk?.units?.length !== 5) throw new Error(`merge did not publish Units: ${JSON.stringify(merged)}`);

	const gatewayKey = Buffer.from(file).toString("base64url");
	const exchangeBase = `${origin}/uf/${gatewayKey}/universer-api`;
	const history = await waitForHistory(exchangeBase, unitId);
	if (history.error?.code !== 1 || !Array.isArray(history.historyIds) || history.historyIds.length === 0) {
		throw new Error(`trunk Sheet History was not indexed: ${JSON.stringify(history)}`);
	}
	const exchangeCsv = Buffer.from("name,value\nserver,7\n", "utf8");
	const exchangeForm = new FormData();
	exchangeForm.append("file", new Blob([exchangeCsv], { type: "text/csv" }), "服务端.csv");
	const uploadedExchange = await fetch(
		`${exchangeBase}/stream/file/upload?size=${exchangeCsv.byteLength}&source=1&flate=false`,
		{ method: "POST", body: exchangeForm },
	);
	if (uploadedExchange.status !== 201) throw new Error(`exchange upload failed: ${await uploadedExchange.text()}`);
	const uploadedExchangeBody = await uploadedExchange.json();
	const importTask = await postJson(`${exchangeBase}/exchange/2/import`, {
		fileID: uploadedExchangeBody.FileId,
		outputType: 1,
		options: {},
	});
	const importedExchange = await waitForExchangeTask(exchangeBase, importTask.taskID);
	const exchangedUnitId = importedExchange.import?.unitID;
	if (typeof exchangedUnitId !== "string" || importedExchange.status !== "done") {
		throw new Error(`server exchange import failed: ${JSON.stringify(importedExchange)}`);
	}
	const exportTask = await postJson(`${exchangeBase}/exchange/2/export`, {
		unitID: exchangedUnitId,
		format: "xlsx",
		options: {},
	});
	const exportedExchange = await waitForExchangeTask(exchangeBase, exportTask.taskID);
	const exchangedFileId = exportedExchange.export?.fileID;
	if (typeof exchangedFileId !== "string") {
		throw new Error(`server exchange export failed: ${JSON.stringify(exportedExchange)}`);
	}
	const signedExchange = await (await fetch(`${exchangeBase}/file/${exchangedFileId}/sign-url`)).json();
	const exchangedDownload = await fetch(`${origin}${signedExchange.url}`);
	if (!exchangedDownload.ok || (await exchangedDownload.arrayBuffer()).byteLength === 0) {
		throw new Error("server exchange download failed");
	}

	const disposable = await service.worktree({ ...scoped, action: "create", name: "discard me" });
	const disposableId = disposable.result?.worktreeId;
	if (typeof disposableId !== "string") throw new Error(`disposable worktree failed: ${JSON.stringify(disposable)}`);
	const discarded = await service.worktreeAction({ ...scoped, action: "discard", worktreeId: disposableId });
	if (!discarded.ok || discarded.state.worktrees.find((entry) => entry.worktreeId === disposableId)?.status !== "discarded") {
		throw new Error(`discard transition failed: ${JSON.stringify(discarded)}`);
	}

	console.log("integration smoke OK (new/status/Unit/import/API/execute/Sheet/Base/Board inspect/export/lint/compile-svg/screenshot/resources/Worktree lifecycle, no global CLI)");
} finally {
	await service.dispose();
	const releasedPort = createNetServer();
	await new Promise((resolve, reject) => {
		releasedPort.once("error", reject);
		releasedPort.listen(availablePort, "127.0.0.1", resolve);
	});
	await closeServer(releasedPort);
	await new Promise((resolve, reject) => foreign.close((error) => error === undefined ? resolve() : reject(error)));
	await rm(scratch, { recursive: true, force: true });
}

async function occupyPortWithFreeSuccessor() {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const foreign = createHttpServer((_request, response) => response.end("not a Univer Gateway"));
		await new Promise((resolve, reject) => {
			foreign.once("error", reject);
			foreign.listen(0, "127.0.0.1", resolve);
		});
		const address = foreign.address();
		if (address === null || typeof address === "string") throw new Error("foreign server did not receive a TCP port");
		if (address.port === 65_535) {
			await closeServer(foreign);
			continue;
		}

		const successor = createNetServer();
		try {
			await new Promise((resolve, reject) => {
				successor.once("error", reject);
				successor.listen(address.port + 1, "127.0.0.1", resolve);
			});
			await closeServer(successor);
			return { foreign, occupiedPort: address.port, availablePort: address.port + 1 };
		} catch {
			// Another process owns the immediate successor; retry with a fresh dynamic pair.
			await closeServer(foreign);
		}
	}
	throw new Error("failed to reserve adjacent dynamic Gateway ports");
}

async function closeServer(server) {
	if (!server.listening) return;
	await new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
}

async function postJson(url, body) {
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(`POST ${url} failed: ${await response.text()}`);
	return response.json();
}

async function waitForExchangeTask(exchangeBase, taskId) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const response = await fetch(`${exchangeBase}/exchange/task/${encodeURIComponent(taskId)}`);
		if (!response.ok) throw new Error(`exchange task polling failed: ${await response.text()}`);
		const task = await response.json();
		if (task.status !== "pending") return task;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`exchange task ${taskId} did not settle`);
}

async function waitForHistory(exchangeBase, unitId) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const response = await fetch(`${exchangeBase}/history/${encodeURIComponent(unitId)}/list?length=20`);
		if (!response.ok) throw new Error(`History request failed: ${await response.text()}`);
		const history = await response.json();
		if (Array.isArray(history.historyIds) && history.historyIds.length > 0) return history;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`History for ${unitId} was not indexed`);
}

async function expectTransition(worktreeId, action, expectedStatus) {
	const result = await service.worktree({ ...scoped, action, worktreeId });
	const status = await service.status({ ...scoped, worktreeId });
	if (!result.ok || status.result?.selectedWorktree?.status !== expectedStatus) {
		throw new Error(`${action} transition failed: ${JSON.stringify({ result, status })}`);
	}
}
