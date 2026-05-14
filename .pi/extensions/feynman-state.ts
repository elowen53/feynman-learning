import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type JsonObject = Record<string, any>;
type MutationQueue = <T>(path: string, mutation: () => Promise<T>) => Promise<T>;

const localMutationQueues = new Map<string, Promise<unknown>>();
let piMutationQueue: MutationQueue | undefined | null;

type ConceptNoteParams = {
	project: string;
	outlineNode: string;
	concept: string;
	state?: string;
	learningGoal?: string;
	intuitiveExplanation?: string;
	preciseDefinition?: string;
	mechanismSteps?: string[];
	minimalExample?: string;
	misconceptions?: string[];
	relationToNeighborConcepts?: string;
	restatementTask?: string;
	checkQuestions?: string[];
	learnerOutputAndCorrections?: string;
	force?: boolean;
};

const MIN_RESTATEMENT_CHARS = 20;

type ScoreParams = {
	project: string;
	outlineNode: string;
	concept: string;
	currentConceptNote?: string;
	learnerSummary?: string;
	misconceptions?: string[];
	nextState?: string;
	nextAction?: string;
	scores: {
		accuracy: number;
		simplicity: number;
		completeness: number;
		exampleAbility: number;
		transferAbility: number;
	};
};

const conceptNoteParameters = {
	type: "object",
	properties: {
		project: { type: "string" },
		outlineNode: { type: "string" },
		concept: { type: "string" },
		state: { type: "string" },
		learningGoal: { type: "string" },
		intuitiveExplanation: { type: "string" },
		preciseDefinition: { type: "string" },
		mechanismSteps: { type: "array", items: { type: "string" } },
		minimalExample: { type: "string" },
		misconceptions: { type: "array", items: { type: "string" } },
		relationToNeighborConcepts: { type: "string" },
		restatementTask: { type: "string" },
		checkQuestions: { type: "array", items: { type: "string" } },
		learnerOutputAndCorrections: { type: "string" },
		force: {
			type: "boolean",
			description:
				"Set to true to bypass the same-node remediating-blocker check. Use only when the learner explicitly asks to skip the unfinished concept.",
		},
	},
	required: ["project", "outlineNode", "concept"],
	additionalProperties: false,
} as any;

const updateProgressParameters = {
	type: "object",
	properties: {
		project: { type: "string" },
		progress: { type: "object", additionalProperties: true },
	},
	required: ["project", "progress"],
	additionalProperties: false,
} as any;

const recordScoreParameters = {
	type: "object",
	properties: {
		project: { type: "string" },
		outlineNode: { type: "string" },
		concept: { type: "string" },
		currentConceptNote: { type: "string" },
		learnerSummary: { type: "string" },
		misconceptions: { type: "array", items: { type: "string" } },
		nextState: { type: "string" },
		nextAction: { type: "string" },
		scores: {
			type: "object",
			properties: {
				accuracy: { type: "number" },
				simplicity: { type: "number" },
				completeness: { type: "number" },
				exampleAbility: { type: "number" },
				transferAbility: { type: "number" },
			},
			required: ["accuracy", "simplicity", "completeness", "exampleAbility", "transferAbility"],
			additionalProperties: false,
		},
	},
	required: ["project", "outlineNode", "concept", "scores"],
	additionalProperties: false,
} as any;

function slugify(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function projectDir(project: string): string {
	return join(homedir(), ".pi", "feynman-projects", slugify(project));
}

function progressPath(project: string): string {
	return join(projectDir(project), "progress.json");
}

function reviewsPath(project: string): string {
	return join(projectDir(project), "reviews.json");
}

function conceptIndexPath(project: string): string {
	return join(projectDir(project), "concept-notes", "index.json");
}

type ConceptOutcome = "new" | "learning" | "remediating" | "passed";

type ConceptScoreSummary = {
	average: number;
	min_dimension: number;
	passed: boolean;
	recorded_at: string;
};

type ConceptIndexEntry = {
	outline_node: string;
	concept: string;
	outline_node_slug: string;
	concept_slug: string;
	path: string;
	last_outcome: ConceptOutcome;
	first_written_at?: string;
	last_updated_at?: string;
	last_touched_at?: string;
	last_score?: ConceptScoreSummary;
	active_misconceptions: string[];
};

type ConceptIndexUpdate = {
	outline_node: string;
	concept: string;
	path: string;
	last_outcome?: ConceptOutcome;
	last_score?: ConceptScoreSummary;
	active_misconceptions?: string[];
};

function entryNodeSlug(entry: ConceptIndexEntry): string {
	return entry.outline_node_slug || slugify(entry.outline_node || "") || "outline-node";
}

function entryConceptSlug(entry: ConceptIndexEntry): string {
	return entry.concept_slug || slugify(entry.concept || "") || "concept";
}

async function upsertConceptIndex(
	project: string,
	update: ConceptIndexUpdate,
): Promise<{ index: JsonObject; entry: ConceptIndexEntry; total: number }> {
	const file = conceptIndexPath(project);
	const slug = slugify(project);
	const nodeSlug = slugify(update.outline_node) || "outline-node";
	const conceptSlug = slugify(update.concept) || "concept";
	return withQueuedFileMutation(file, async () => {
		const current = await readJson(file, { project: slug, concepts: [] });
		const concepts: ConceptIndexEntry[] = Array.isArray(current.concepts) ? current.concepts : [];
		const now = nowStamp();
		const idx = concepts.findIndex((c) => entryNodeSlug(c) === nodeSlug && entryConceptSlug(c) === conceptSlug);
		let entry: ConceptIndexEntry;
		if (idx === -1) {
			entry = {
				outline_node: update.outline_node,
				concept: update.concept,
				outline_node_slug: nodeSlug,
				concept_slug: conceptSlug,
				path: update.path,
				last_outcome: update.last_outcome || "new",
				first_written_at: now,
				last_updated_at: now,
				last_touched_at: now,
				last_score: update.last_score,
				active_misconceptions: update.active_misconceptions || [],
			};
			concepts.push(entry);
		} else {
			const prev = concepts[idx];
			entry = {
				...prev,
				outline_node: update.outline_node,
				concept: update.concept,
				outline_node_slug: nodeSlug,
				concept_slug: conceptSlug,
				path: update.path,
				last_outcome: update.last_outcome || prev.last_outcome || "learning",
				first_written_at: prev.first_written_at || now,
				last_updated_at: now,
				last_touched_at: now,
				last_score: update.last_score !== undefined ? update.last_score : prev.last_score,
				active_misconceptions:
					update.active_misconceptions !== undefined
						? update.active_misconceptions
						: prev.active_misconceptions || [],
			};
			concepts[idx] = entry;
		}
		const next = { project: slug, updated_at: now, concepts };
		await writeJson(file, next);
		return { index: next, entry, total: concepts.length };
	});
}

async function walkConceptNoteFiles(dir: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error: any) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
	const out: string[] = [];
	for (const dirent of entries) {
		if (dirent.name === "index.json") continue;
		const full = join(dir, dirent.name);
		if (dirent.isDirectory()) {
			out.push(...(await walkConceptNoteFiles(full)));
		} else if (dirent.isFile() && dirent.name.endsWith(".md")) {
			out.push(full);
		}
	}
	return out;
}

function parseConceptHeader(markdown: string): { concept?: string; outline_node?: string } {
	const lines = markdown.split("\n").slice(0, 30);
	const result: { concept?: string; outline_node?: string } = {};
	for (const line of lines) {
		if (!result.concept && line.startsWith("# ")) {
			result.concept = line.slice(2).trim();
		}
		const m = line.match(/^-\s*Outline node:\s*(.+)$/i);
		if (m && !result.outline_node) {
			result.outline_node = m[1].trim();
		}
		if (result.concept && result.outline_node) break;
	}
	return result;
}

function deriveSlugsFromPath(filePath: string, baseDir: string): { nodeSlug: string; conceptSlug: string } {
	const rel = relative(baseDir, filePath);
	const parts = rel.split(/[\\/]/);
	const last = parts[parts.length - 1] || "concept.md";
	const conceptSlug = basename(last, ".md") || "concept";
	const nodeSlug = parts.length >= 2 ? parts[parts.length - 2] : "outline-node";
	return { nodeSlug, conceptSlug };
}

type ReviewItem = {
	outline_node?: string;
	concept?: string;
	scores?: Record<string, number>;
	average?: number;
	passed?: boolean;
	misconceptions?: string[];
	recorded_at?: string;
};

async function loadLatestScoresBySlug(project: string): Promise<Map<string, ReviewItem>> {
	const file = reviewsPath(project);
	const data = await readJson(file, { items: [] });
	const items: ReviewItem[] = Array.isArray(data.items) ? data.items : [];
	const map = new Map<string, ReviewItem>();
	for (const item of items) {
		const key = `${slugify(item.outline_node || "")}::${slugify(item.concept || "")}`;
		const prev = map.get(key);
		if (!prev || (item.recorded_at || "") > (prev.recorded_at || "")) {
			map.set(key, item);
		}
	}
	return map;
}

function nowStamp(): string {
	return new Date().toISOString();
}

async function getPiMutationQueue(): Promise<MutationQueue | undefined> {
	if (piMutationQueue !== undefined) return piMutationQueue || undefined;

	try {
		const mod = await import("@earendil-works/pi-coding-agent");
		piMutationQueue = typeof mod.withFileMutationQueue === "function" ? mod.withFileMutationQueue : null;
	} catch {
		piMutationQueue = null;
	}

	return piMutationQueue || undefined;
}

async function localWithFileMutationQueue<T>(path: string, mutation: () => Promise<T>): Promise<T> {
	const previous = localMutationQueues.get(path) || Promise.resolve();
	let release: () => void;
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	const tail = previous.then(() => current);
	localMutationQueues.set(path, tail);

	await previous;
	try {
		return await mutation();
	} finally {
		release!();
		if (localMutationQueues.get(path) === tail) {
			localMutationQueues.delete(path);
		}
	}
}

async function withQueuedFileMutation<T>(path: string, mutation: () => Promise<T>): Promise<T> {
	const queue = await getPiMutationQueue();
	if (queue) return queue(path, mutation);
	return localWithFileMutationQueue(path, mutation);
}

function clampScore(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(10, value));
}

function listLines(values: string[] | undefined): string {
	const clean = (values || []).map((value) => value.trim()).filter(Boolean);
	if (clean.length === 0) return "- TODO";
	return clean.map((value) => `- ${value}`).join("\n");
}

function text(value: string | undefined): string {
	return value?.trim() || "TODO";
}

function renderConceptNote(params: ConceptNoteParams, notePath: string): string {
	const state = params.state || "WAITING_RESTATEMENT";
	return [
		`# ${params.concept}`,
		"",
		`- Project: ${slugify(params.project)}`,
		`- Outline node: ${params.outlineNode}`,
		`- State: ${state}`,
		`- Date: ${nowStamp().slice(0, 10)}`,
		`- Path: ${notePath}`,
		"",
		"## Learning Goal",
		"",
		text(params.learningGoal),
		"",
		"## Intuitive Explanation",
		"",
		text(params.intuitiveExplanation),
		"",
		"## Precise Definition And Boundaries",
		"",
		text(params.preciseDefinition),
		"",
		"## Mechanism Steps",
		"",
		listLines(params.mechanismSteps),
		"",
		"## Minimal Example",
		"",
		text(params.minimalExample),
		"",
		"## Counterexamples And Misconceptions",
		"",
		listLines(params.misconceptions),
		"",
		"## Relation To Neighbor Concepts",
		"",
		text(params.relationToNeighborConcepts),
		"",
		"## Feynman Restatement Task",
		"",
		text(params.restatementTask),
		"",
		"## Check Questions",
		"",
		listLines(params.checkQuestions),
		"",
		"## Learner Output And Corrections",
		"",
		text(params.learnerOutputAndCorrections),
		"",
	].join("\n");
}

async function readText(file: string): Promise<string | undefined> {
	try {
		return await readFile(file, "utf8");
	} catch (error: any) {
		if (error?.code === "ENOENT") return undefined;
		throw error;
	}
}

function appendCorrection(existing: string, params: ConceptNoteParams): string {
	const update = params.learnerOutputAndCorrections?.trim();
	if (!update) return existing;

	return [
		existing.trimEnd(),
		"",
		`### Update ${nowStamp()}`,
		"",
		update,
		"",
	].join("\n");
}

async function readJson(file: string, fallback: JsonObject): Promise<JsonObject> {
	try {
		return JSON.parse(await readFile(file, "utf8"));
	} catch (error: any) {
		if (error?.code === "ENOENT") return fallback;
		throw error;
	}
}

async function writeJson(file: string, value: JsonObject): Promise<void> {
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function mergeProgress(project: string, updates: JsonObject): Promise<JsonObject> {
	const file = progressPath(project);
	return withQueuedFileMutation(file, async () => {
		const current = await readJson(file, { project: slugify(project), scores: [], completed_nodes: [], active_misconceptions: [] });
		const next = {
			...current,
			...updates,
			project: slugify(project),
			updated_at: nowStamp(),
		};
		await writeJson(file, next);
		return next;
	});
}

export default function feynmanState(pi: ExtensionAPI) {
	pi.registerTool({
		name: "feynman_write_concept_note",
		label: "Write Feynman Concept Note",
		description: "Create or update the canonical Markdown note for one Feynman learning concept before teaching it.",
		promptSnippet:
			"feynman_write_concept_note: write the durable Markdown concept note before teaching or remediating a concept.",
		promptGuidelines: [
			"Call feynman_write_concept_note before explaining a new concept.",
			"Call feynman_write_concept_note again after the learner responds to append corrections, useful examples, and misconceptions.",
		],
		parameters: conceptNoteParameters,
		async execute(_toolCallId, params: ConceptNoteParams) {
			const project = slugify(params.project);
			const nodeSlug = slugify(params.outlineNode) || "outline-node";
			const conceptSlug = slugify(params.concept) || "concept";
			const notePath = join(projectDir(project), "concept-notes", nodeSlug, `${conceptSlug}.md`);

			if (!params.force) {
				const indexFile = conceptIndexPath(project);
				const data = await readJson(indexFile, { project, concepts: [] });
				const concepts: ConceptIndexEntry[] = Array.isArray(data.concepts) ? data.concepts : [];
				const blocker = concepts.find(
					(c) =>
						entryNodeSlug(c) === nodeSlug &&
						entryConceptSlug(c) !== conceptSlug &&
						c.last_outcome === "remediating",
				);
				if (blocker) {
					return {
						content: [
							{
								type: "text",
								text: `Cannot start "${params.concept}": "${blocker.concept}" in the same node is still remediating (avg ${blocker.last_score?.average ?? "?"}). Pass it first via feynman_record_score, or call feynman_write_concept_note again with force: true if the learner explicitly asked to skip.`,
							},
						],
						details: {
							ok: false,
							reason: "remediating_blocker",
							blocker: {
								concept: blocker.concept,
								outline_node: blocker.outline_node,
								path: blocker.path,
								last_outcome: blocker.last_outcome,
								last_score: blocker.last_score,
								active_misconceptions: blocker.active_misconceptions,
							},
						},
					};
				}
			}

			await withQueuedFileMutation(notePath, async () => {
				await mkdir(dirname(notePath), { recursive: true });
				const existing = await readText(notePath);
				const markdown = existing ? appendCorrection(existing, params) : renderConceptNote({ ...params, project }, notePath);
				await writeFile(notePath, markdown, "utf8");
			});

			const progress = await mergeProgress(project, {
				current_state: params.state || "WAITING_RESTATEMENT",
				current_outline_node: params.outlineNode,
				current_concept: params.concept,
				current_concept_note: notePath,
				next_action: "Ask the learner to restate this concept in their own words and provide their own example.",
			});

			const { entry: conceptEntry, total: conceptCount } = await upsertConceptIndex(project, {
				outline_node: params.outlineNode,
				concept: params.concept,
				path: notePath,
				last_outcome: "learning",
			});

			pi.appendEntry("feynman-progress", {
				event: "concept_note_written",
				project,
				outlineNode: params.outlineNode,
				concept: params.concept,
				notePath,
				updatedAt: progress.updated_at,
			});

			return {
				content: [{ type: "text", text: `Saved concept note to ${notePath}` }],
				details: { ok: true, project, notePath, progress, concept_entry: conceptEntry, concept_count: conceptCount },
			};
		},
	});

	pi.registerTool({
		name: "feynman_update_progress",
		label: "Update Feynman Progress",
		description: "Merge structured updates into a Feynman project's progress.json with serialized file writes.",
		promptSnippet: "feynman_update_progress: update progress.json instead of editing it ad hoc.",
		promptGuidelines: [
			"Use feynman_update_progress whenever the current learning state, node, concept, note path, or next action changes.",
		],
		parameters: updateProgressParameters,
		async execute(_toolCallId, params: { project: string; progress: JsonObject }) {
			const project = slugify(params.project);
			const progress = await mergeProgress(project, params.progress);
			pi.appendEntry("feynman-progress", {
				event: "progress_updated",
				project,
				progress,
				updatedAt: progress.updated_at,
			});

			return {
				content: [{ type: "text", text: `Updated progress for ${project}` }],
				details: { ok: true, project, progress },
			};
		},
	});

	pi.registerTool({
		name: "feynman_record_score",
		label: "Record Feynman Score",
		description: "Record a concept score, enforce the pass threshold, and update progress and review metadata.",
		promptSnippet:
			"feynman_record_score: record concept scores and enforce average >= 7 with no dimension below 6 before advancing.",
		promptGuidelines: [
			"Use feynman_record_score after evaluating the learner's restatement and example.",
			"Do not advance to the next concept unless feynman_record_score returns passed: true.",
		],
		parameters: recordScoreParameters,
		async execute(_toolCallId, params: ScoreParams) {
			const project = slugify(params.project);

			const restatement = (params.learnerSummary || "").trim();
			if (restatement.length < MIN_RESTATEMENT_CHARS) {
				return {
					content: [
						{
							type: "text",
							text: `Cannot record a score: learnerSummary is ${restatement.length} chars (minimum ${MIN_RESTATEMENT_CHARS}). Ask the learner to restate the concept in their own words first, then pass that text as learnerSummary.`,
						},
					],
					details: {
						ok: false,
						reason: "missing_or_short_restatement",
						min_length: MIN_RESTATEMENT_CHARS,
						actual_length: restatement.length,
					},
				};
			}

			const scores = {
				accuracy: clampScore(params.scores.accuracy),
				simplicity: clampScore(params.scores.simplicity),
				completeness: clampScore(params.scores.completeness),
				exampleAbility: clampScore(params.scores.exampleAbility),
				transferAbility: clampScore(params.scores.transferAbility),
			};
			const values = Object.values(scores);
			const average = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
			const minScore = Math.min(...values);
			const passed = average >= 7 && minScore >= 6;

			if (passed) {
				const guardNotePath =
					params.currentConceptNote ||
					join(
						projectDir(project),
						"concept-notes",
						slugify(params.outlineNode) || "outline-node",
						`${slugify(params.concept) || "concept"}.md`,
					);
				const noteText = (await readText(guardNotePath)) || "";
				const correctionRounds = (noteText.match(/^### Update /gm) || []).length;
				if (correctionRounds === 0) {
					return {
						content: [
							{
								type: "text",
								text: `Cannot mark "${params.concept}" as passed without at least one correction round. Call feynman_write_concept_note again with learnerOutputAndCorrections set so the agent's follow-up and the learner's response are appended to the note, then re-score.`,
							},
						],
						details: {
							ok: false,
							reason: "no_correction_round",
							correction_rounds: correctionRounds,
							concept_note: guardNotePath,
						},
					};
				}
			}
			const entry = {
				outline_node: params.outlineNode,
				concept: params.concept,
				concept_note: params.currentConceptNote,
				scores,
				average,
				passed,
				learner_summary: params.learnerSummary || "",
				misconceptions: params.misconceptions || [],
				recorded_at: nowStamp(),
			};

			const progress = await withQueuedFileMutation(progressPath(project), async () => {
				const file = progressPath(project);
				const current = await readJson(file, { project, scores: [], completed_nodes: [], active_misconceptions: [] });
				const nextScores = Array.isArray(current.scores) ? [...current.scores, entry] : [entry];
				const activeMisconceptions = passed ? current.active_misconceptions || [] : params.misconceptions || [];
				const next = {
					...current,
					project,
					current_state: passed ? params.nextState || "LEARNING_CONCEPT" : "CORRECTING",
					current_outline_node: params.outlineNode,
					current_concept: params.concept,
					current_concept_note: params.currentConceptNote || current.current_concept_note || "",
					active_misconceptions: activeMisconceptions,
					scores: nextScores,
					next_action:
						params.nextAction ||
						(passed
							? "Proceed to the next concept or summarize the node if the node is complete."
							: "Remediate the lowest scoring dimension before advancing."),
					updated_at: nowStamp(),
				};
				await writeJson(file, next);
				return next;
			});

			const reviewFile = reviewsPath(project);
			const reviews = await withQueuedFileMutation(reviewFile, async () => {
				const current = await readJson(reviewFile, { project, items: [] });
				const items = Array.isArray(current.items) ? [...current.items, entry] : [entry];
				const next = { ...current, project, items, updated_at: nowStamp() };
				await writeJson(reviewFile, next);
				return next;
			});

			const conceptNotePathForIndex =
				params.currentConceptNote ||
				join(
					projectDir(project),
					"concept-notes",
					slugify(params.outlineNode) || "outline-node",
					`${slugify(params.concept) || "concept"}.md`,
				);

			const { entry: conceptEntry, total: conceptCount } = await upsertConceptIndex(project, {
				outline_node: params.outlineNode,
				concept: params.concept,
				path: conceptNotePathForIndex,
				last_outcome: passed ? "passed" : "remediating",
				last_score: { average, min_dimension: minScore, passed, recorded_at: entry.recorded_at },
				active_misconceptions: passed ? [] : params.misconceptions || [],
			});

			pi.appendEntry("feynman-progress", {
				event: "score_recorded",
				project,
				outlineNode: params.outlineNode,
				concept: params.concept,
				average,
				passed,
				updatedAt: progress.updated_at,
			});

			return {
				content: [
					{
						type: "text",
						text: passed
							? `Recorded passing score ${average}/10 for ${params.concept}`
							: `Recorded non-passing score ${average}/10 for ${params.concept}; continue remediation before advancing.`,
					},
				],
				details: { ok: true, project, passed, average, minScore, scores, progress, reviews, concept_entry: conceptEntry, concept_count: conceptCount },
			};
		},
	});

	pi.registerTool({
		name: "feynman_rebuild_concept_index",
		label: "Rebuild Feynman Concept Index",
		description:
			"Rebuild concept-notes/index.json from concept note files and reviews.json. Use when notes were edited, renamed, or removed outside of the Feynman tools.",
		promptSnippet:
			"feynman_rebuild_concept_index: rebuild concept-notes/index.json from durable sources (filesystem + reviews.json).",
		promptGuidelines: [
			"Use feynman_rebuild_concept_index when concept notes were edited, renamed, or removed outside the Feynman tools.",
			"Use feynman_rebuild_concept_index if /status, /review, or /continue surface entries that disagree with the actual files.",
		],
		parameters: {
			type: "object",
			properties: { project: { type: "string" } },
			required: ["project"],
			additionalProperties: false,
		} as any,
		async execute(_toolCallId, params: { project: string }) {
			const project = slugify(params.project);
			const baseDir = join(projectDir(project), "concept-notes");
			const indexFile = conceptIndexPath(project);
			const files = await walkConceptNoteFiles(baseDir);
			const latest = await loadLatestScoresBySlug(project);

			return withQueuedFileMutation(indexFile, async () => {
				const concepts: ConceptIndexEntry[] = [];
				for (const file of files) {
					const text = await readText(file);
					if (!text) continue;
					const header = parseConceptHeader(text);
					const fromPath = deriveSlugsFromPath(file, baseDir);
					const conceptName = header.concept || fromPath.conceptSlug;
					const outlineNodeName = header.outline_node || fromPath.nodeSlug;
					const conceptSlug = slugify(conceptName) || fromPath.conceptSlug;
					const nodeSlug = slugify(outlineNodeName) || fromPath.nodeSlug;
					const latestScore = latest.get(`${nodeSlug}::${conceptSlug}`);

					let last_outcome: ConceptOutcome = "learning";
					let last_score: ConceptScoreSummary | undefined;
					let active_misconceptions: string[] = [];
					if (latestScore) {
						const dims = latestScore.scores ? Object.values(latestScore.scores).filter((v) => typeof v === "number") : [];
						const minDim = dims.length ? Math.min(...(dims as number[])) : 0;
						last_outcome = latestScore.passed ? "passed" : "remediating";
						last_score = {
							average: typeof latestScore.average === "number" ? latestScore.average : 0,
							min_dimension: minDim,
							passed: !!latestScore.passed,
							recorded_at: latestScore.recorded_at || "",
						};
						if (!latestScore.passed) {
							active_misconceptions = latestScore.misconceptions || [];
						}
					}

					let touchedAt: string;
					let bornAt: string;
					try {
						const fileStat = await stat(file);
						touchedAt = fileStat.mtime.toISOString();
						bornAt = fileStat.birthtime ? fileStat.birthtime.toISOString() : touchedAt;
					} catch {
						touchedAt = nowStamp();
						bornAt = touchedAt;
					}

					concepts.push({
						outline_node: outlineNodeName,
						concept: conceptName,
						outline_node_slug: nodeSlug,
						concept_slug: conceptSlug,
						path: file,
						last_outcome,
						first_written_at: bornAt,
						last_updated_at: touchedAt,
						last_touched_at: touchedAt,
						last_score,
						active_misconceptions,
					});
				}

				const next = { project, updated_at: nowStamp(), concepts };
				await mkdir(dirname(indexFile), { recursive: true });
				await writeJson(indexFile, next);

				const passedCount = concepts.filter((c) => c.last_outcome === "passed").length;
				const remediatingCount = concepts.filter((c) => c.last_outcome === "remediating").length;
				const unscoredCount = concepts.length - passedCount - remediatingCount;

				pi.appendEntry("feynman-progress", {
					event: "concept_index_rebuilt",
					project,
					concept_count: concepts.length,
					passed: passedCount,
					remediating: remediatingCount,
					unscored: unscoredCount,
					updatedAt: next.updated_at,
				});

				return {
					content: [
						{
							type: "text",
							text: `Rebuilt index for ${project}: ${concepts.length} concepts (${passedCount} passed, ${remediatingCount} remediating, ${unscoredCount} unscored).`,
						},
					],
					details: {
						ok: true,
						project,
						concept_count: concepts.length,
						passed: passedCount,
						remediating: remediatingCount,
						unscored: unscoredCount,
					},
				};
			});
		},
	});

	pi.registerTool({
		name: "feynman_list_concepts",
		label: "List Feynman Concepts",
		description:
			"Query concept-notes/index.json with filters. Prefer this over reading the full index when you only need a subset.",
		promptSnippet:
			"feynman_list_concepts: filter concept-notes/index.json by outline_node and/or last_outcome to keep context small.",
		promptGuidelines: [
			"During /review, /status, and /continue, prefer feynman_list_concepts over reading index.json wholesale.",
			"Filter by last_outcome (remediating, passed, learning, new) and/or outline_node to fetch only what you need.",
		],
		parameters: {
			type: "object",
			properties: {
				project: { type: "string" },
				outline_node: { type: "string", description: "Filter to a single outline node (matched by slug)" },
				last_outcome: {
					type: "string",
					description: "Filter to one of: new | learning | remediating | passed",
				},
				limit: { type: "number", description: "Max entries to return (default 50, max 500)" },
			},
			required: ["project"],
			additionalProperties: false,
		} as any,
		async execute(
			_toolCallId,
			params: { project: string; outline_node?: string; last_outcome?: string; limit?: number },
		) {
			const project = slugify(params.project);
			const file = conceptIndexPath(project);
			const data = await readJson(file, { project, concepts: [] });
			let concepts: ConceptIndexEntry[] = Array.isArray(data.concepts) ? data.concepts : [];

			if (params.outline_node) {
				const want = slugify(params.outline_node);
				concepts = concepts.filter((c) => entryNodeSlug(c) === want);
			}
			if (params.last_outcome) {
				concepts = concepts.filter((c) => c.last_outcome === params.last_outcome);
			}

			const total = concepts.length;
			const limit = Math.max(1, Math.min(Number(params.limit || 50), 500));
			const limited = concepts.slice(0, limit);

			return {
				content: [
					{
						type: "text",
						text: `Returned ${limited.length} of ${total} concepts for ${project}.`,
					},
				],
				details: { ok: true, project, total, returned: limited.length, concepts: limited },
			};
		},
	});
}
