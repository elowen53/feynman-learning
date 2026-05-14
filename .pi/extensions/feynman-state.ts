import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
};

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
				details: { ok: true, project, notePath, progress },
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
				details: { ok: true, project, passed, average, minScore, scores, progress, reviews },
			};
		},
	});
}
