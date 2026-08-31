import { readFile } from "node:fs/promises";
import { Context } from "@deepseek-ai/cordis";
import SkillRegistry from "@deepseek-ai/dsh-skill";
import { apply } from "../lib/index.js";

const ctx = new Context();
new SkillRegistry(ctx);
apply(ctx, { tools: false, skills: true });
await new Promise((resolve) => setTimeout(resolve, 0));

const listed = await ctx.skills.list();
const names = listed.map((skill) => skill.name);
const expected = [
	"univer",
	"univer-base",
	"univer-board",
	"univer-cross-unit-formula",
	"univer-doc",
	"univer-embed",
	"univer-sheet",
	"univer-slide",
];
if (JSON.stringify(names) !== JSON.stringify(expected)) {
	throw new Error(`unexpected bundled skills: ${JSON.stringify(names)}`);
}

for (const candidate of listed) {
	const source = await readFile(
		new URL(`../skills/${candidate.name}/SKILL.md`, import.meta.url),
		"utf8",
	);
	const description = source.match(/^description: (.+)$/m)?.[1];
	if (description !== candidate.description) {
		throw new Error(`skill description drifted from frontmatter: ${candidate.name}`);
	}
}
const core = await ctx.skills.get("univer");
if (
	core === undefined ||
	!core.content.includes("univer_status") ||
	!core.content.includes("univer_screenshot") ||
	!core.content.includes("univer_resources") ||
	!core.content.includes('await import("node:fs/promises")') ||
	!core.content.includes("codeFile") ||
	!core.content.includes("- Base: `base`") ||
	!core.content.includes("Do not wait for the user to name a tool") ||
	!core.content.includes("A class is known: use `show` on the class to inspect its APIs") ||
	!core.content.includes("Each query is searched independently") ||
	!core.content.includes("Error [CODE]: message") ||
	core.content.startsWith("---")
) {
	throw new Error("bundled core skill did not load its frontmatter-free body and failure recovery guidance");
}

const slide = await ctx.skills.get("univer-slide");
if (
	slide === undefined ||
	!slide.description.includes("Use proactively") ||
	!slide.content.includes("univer_compile_svg") ||
	!slide.content.includes("univer_lint") ||
	!slide.content.includes("univer_screenshot") ||
	!slide.content.includes("univer_resources") ||
	!slide.content.includes("A new Slide Unit already contains one empty page")
) {
	throw new Error("bundled Slide skill is missing proactive generation guidance");
}

const base = await ctx.skills.get("univer-base");
if (
	base === undefined ||
	!base.content.includes("FBaseTableField") ||
	!base.content.includes("FBaseTableRecord") ||
	!base.content.includes("FBaseTableView") ||
	!base.content.includes("there is no `addFields` method") ||
	!base.content.includes("selected `FBase` as `base`") ||
	!base.content.includes("bindings are reserved and must not be redeclared") ||
	!base.content.includes("A new Base already contains `Table 1`") ||
	!base.content.includes("explicitly `return` record values") ||
	base.content.includes("const base =")
) {
	throw new Error("bundled Base skill is missing the current injected handle and authoring contracts");
}

const board = await ctx.skills.get("univer-board");
if (
	board === undefined ||
	!board.content.includes("Pass one or more exact IDs in `elementIds`") ||
	!board.content.includes("arrangeElementsInLayers") ||
	!board.content.includes('start: { elementId: source.getId() }') ||
	!board.content.includes("connector-terminal-direction-reversed") ||
	!board.content.includes("connector-excessive-detour") ||
	!board.content.includes("## Connector animation") ||
	board.content.includes("fromElementId")
) {
	throw new Error("bundled Board skill is missing current inspection and connector guidance");
}

for (const unit of ["univer-base", "univer-board", "univer-doc", "univer-sheet", "univer-slide"]) {
	const skill = await ctx.skills.get(unit);
	if (
		skill === undefined ||
		!skill.content.includes("univer_screenshot") ||
		skill.content.includes("Screenshot evidence is unavailable") ||
		skill.content.includes("Screenshot generation and pixel comparison are unavailable")
	) {
		throw new Error(`bundled Unit skill is missing current screenshot verification guidance: ${unit}`);
	}
}

const chartContracts = [
	{
		name: "univer-board",
		owner: "FBoard.newChart",
		insert: "await board.insertChart(info)",
		read: "board.getCharts()",
		stale: ["board.charts", "FBoardCharts", "setData(values).commit()"],
	},
	{
		name: "univer-doc",
		owner: "FDocument.newChart",
		insert: "await doc.insertChart(info)",
		read: "doc.getCharts()",
		stale: [
			"doc.charts",
			"FDocumentCharts",
			"univerAPI.Enum.DocChartInsertAnchorKind",
			"setData(values).commit()",
		],
	},
	{
		name: "univer-slide",
		owner: "FSlide",
		insert: "await slide.insertChart(info)",
		read: "slide.getCharts()",
		stale: ["slide.charts", "FSlideCharts", "setData(values).commit()"],
	},
];
for (const contract of chartContracts) {
	const skill = await ctx.skills.get(contract.name);
	if (
		skill === undefined ||
		contract.stale.some((api) => skill.content.includes(api)) ||
		!skill.content.includes(contract.owner) ||
		!skill.content.includes(contract.insert) ||
		!skill.content.includes(contract.read) ||
		!skill.content.includes("chart.setDataSource(values)") ||
		!skill.content.includes("await chart.remove()")
	) {
		throw new Error(`bundled Chart skill uses a stale Facade contract: ${contract.name}`);
	}
}

for (const topic of ["univer-embed", "univer-cross-unit-formula"]) {
	const skill = await ctx.skills.get(topic);
	if (skill === undefined || !skill.content.includes("univer_execute")) {
		throw new Error(`bundled topic skill did not load: ${topic}`);
	}
}

console.log("skills smoke OK (eight lazy bundled Univer skills)");
