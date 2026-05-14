import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type JsonObject = Record<string, any>;
type MutationQueue = <T>(path: string, mutation: () => Promise<T>) => Promise<T>;
type ToolContext = {
	sessionManager?: {
		getBranch?: () => Array<{ id?: string; type?: string; customType?: string; data?: any }>;
		getSessionFile?: () => string | undefined;
	};
};

const localMutationQueues = new Map<string, Promise<unknown>>();
let piMutationQueue: MutationQueue | undefined | null;

type BranchMode = "strict" | "adopt";

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
	branchMode?: BranchMode;
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
	branchMode?: BranchMode;
};

type ValidateTransitionParams = {
	project: string;
	nextProgress: JsonObject;
	branchMode?: BranchMode;
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
		branchMode: {
			type: "string",
			description:
				"Branch ownership mode: strict (default) rejects writes from forked session branches; adopt transfers project ownership to the current branch.",
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
		branchMode: {
			type: "string",
			description:
				"Branch ownership mode: strict (default) rejects writes from forked session branches; adopt transfers project ownership to the current branch.",
		},
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
		branchMode: {
			type: "string",
			description:
				"Branch ownership mode: strict (default) rejects writes from forked session branches; adopt transfers project ownership to the current branch.",
		},
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

const validateTransitionParameters = {
	type: "object",
	properties: {
		project: { type: "string" },
		nextProgress: { type: "object", additionalProperties: true },
		branchMode: {
			type: "string",
			description:
				"Branch ownership mode: strict (default) rejects writes from forked session branches; adopt transfers project ownership to the current branch.",
		},
	},
	required: ["project", "nextProgress"],
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

type LearningState =
	| "COLLECTING_GOAL"
	| "INGESTING_SOURCES"
	| "BUILDING_OUTLINE"
	| "DIAGNOSING"
	| "LEARNING_CONCEPT"
	| "WAITING_RESTATEMENT"
	| "CORRECTING"
	| "SCORING"
	| "NODE_SUMMARY"
	| "REVIEWING"
	| "ENDED";

type BranchInfo = {
	session_file?: string;
	branch_entry_id?: string;
	branch_entry_ids: string[];
	branch_depth: number;
};

type ValidationResult = {
	ok: boolean;
	reason?: string;
	message?: string;
	current_state?: string;
	next_state?: string;
	branch?: BranchInfo;
	owner?: JsonObject;
};

const learningStates = new Set<string>([
	"COLLECTING_GOAL",
	"INGESTING_SOURCES",
	"BUILDING_OUTLINE",
	"DIAGNOSING",
	"LEARNING_CONCEPT",
	"WAITING_RESTATEMENT",
	"CORRECTING",
	"SCORING",
	"NODE_SUMMARY",
	"REVIEWING",
	"ENDED",
]);

const allowedStateTransitions: Record<string, string[]> = {
	NEW: ["COLLECTING_GOAL", "INGESTING_SOURCES", "BUILDING_OUTLINE", "DIAGNOSING", "LEARNING_CONCEPT", "WAITING_RESTATEMENT", "REVIEWING", "ENDED"],
	COLLECTING_GOAL: ["COLLECTING_GOAL", "INGESTING_SOURCES", "ENDED"],
	INGESTING_SOURCES: ["INGESTING_SOURCES", "BUILDING_OUTLINE", "COLLECTING_GOAL", "ENDED"],
	BUILDING_OUTLINE: ["BUILDING_OUTLINE", "DIAGNOSING", "INGESTING_SOURCES", "ENDED"],
	DIAGNOSING: ["DIAGNOSING", "LEARNING_CONCEPT", "BUILDING_OUTLINE", "ENDED"],
	LEARNING_CONCEPT: ["LEARNING_CONCEPT", "WAITING_RESTATEMENT", "CORRECTING", "ENDED"],
	WAITING_RESTATEMENT: ["WAITING_RESTATEMENT", "CORRECTING", "SCORING", "LEARNING_CONCEPT", "NODE_SUMMARY", "ENDED"],
	CORRECTING: ["CORRECTING", "WAITING_RESTATEMENT", "SCORING", "LEARNING_CONCEPT", "NODE_SUMMARY", "ENDED"],
	SCORING: ["SCORING", "CORRECTING", "LEARNING_CONCEPT", "NODE_SUMMARY", "REVIEWING", "ENDED"],
	NODE_SUMMARY: ["NODE_SUMMARY", "LEARNING_CONCEPT", "DIAGNOSING", "REVIEWING", "ENDED"],
	REVIEWING: ["REVIEWING", "WAITING_RESTATEMENT", "CORRECTING", "SCORING", "ENDED"],
	ENDED: ["ENDED", "COLLECTING_GOAL", "INGESTING_SOURCES", "BUILDING_OUTLINE", "DIAGNOSING", "LEARNING_CONCEPT", "WAITING_RESTATEMENT", "REVIEWING"],
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

function normalizeBranchMode(value: string | undefined): BranchMode {
	return value === "adopt" ? "adopt" : "strict";
}

function getBranchInfo(ctx?: ToolContext): BranchInfo | undefined {
	const manager = ctx?.sessionManager;
	if (!manager?.getBranch) return undefined;

	const branch = manager.getBranch();
	const ids = branch.map((entry) => entry.id).filter((id): id is string => typeof id === "string" && id.length > 0);
	return {
		session_file: manager.getSessionFile?.(),
		branch_entry_id: ids[ids.length - 1],
		branch_entry_ids: ids,
		branch_depth: ids.length,
	};
}

function branchStamp(branch: BranchInfo | undefined, source: string): JsonObject | undefined {
	if (!branch?.branch_entry_id && !branch?.session_file) return undefined;
	return {
		session_file: branch.session_file,
		branch_entry_id: branch.branch_entry_id,
		branch_depth: branch.branch_depth,
		source,
		updated_at: nowStamp(),
	};
}

function validateBranchOwnership(current: JsonObject, branch: BranchInfo | undefined, mode: BranchMode): ValidationResult {
	const owner = current.pi_branch;
	if (!owner || mode === "adopt" || !branch) {
		return { ok: true, branch, owner };
	}

	if (owner.session_file && branch.session_file && owner.session_file !== branch.session_file) {
		return {
			ok: false,
			reason: "branch_owner_mismatch",
			message:
				"This Feynman project is owned by a different Pi session file. Use branchMode: \"adopt\" only if the learner wants this branch to take ownership.",
			branch,
			owner,
		};
	}

	if (
		typeof owner.branch_entry_id === "string" &&
		owner.branch_entry_id.length > 0 &&
		!branch.branch_entry_ids.includes(owner.branch_entry_id)
	) {
		return {
			ok: false,
			reason: "branch_owner_not_in_current_branch",
			message:
				"This Feynman project was advanced on another Pi branch. Continue from that branch or use branchMode: \"adopt\" only after choosing this branch as the canonical learning path.",
			branch,
			owner,
		};
	}

	return { ok: true, branch, owner };
}

function isPassedScoreFor(progress: JsonObject, outlineNode?: string, concept?: string): boolean {
	const scores = Array.isArray(progress.scores) ? progress.scores : [];
	const wantNode = slugify(outlineNode || progress.current_outline_node || "");
	const wantConcept = slugify(concept || progress.current_concept || "");
	for (let i = scores.length - 1; i >= 0; i--) {
		const item = scores[i];
		if (slugify(item?.outline_node || "") !== wantNode) continue;
		if (slugify(item?.concept || "") !== wantConcept) continue;
		return item?.passed === true;
	}
	return false;
}

function validateStateTransition(
	current: JsonObject,
	updates: JsonObject,
	options: { scorePassed?: boolean; allowConceptSwitch?: boolean } = {},
): ValidationResult {
	const currentState = String(current.current_state || "NEW");
	const nextState = String(updates.current_state || current.current_state || "NEW");

	if (nextState !== "NEW" && !learningStates.has(nextState)) {
		return {
			ok: false,
			reason: "unknown_state",
			message: `Unknown Feynman state "${nextState}".`,
			current_state: currentState,
			next_state: nextState,
		};
	}

	const currentConcept = slugify(current.current_concept || "");
	const nextConcept = slugify(updates.current_concept || current.current_concept || "");
	const conceptChanged = currentConcept && nextConcept && currentConcept !== nextConcept;
	if (conceptChanged && !options.allowConceptSwitch && !isPassedScoreFor(current)) {
		return {
			ok: false,
			reason: "current_concept_not_passed",
			message:
				"Cannot switch to another concept before the current concept has a recorded passing score.",
			current_state: currentState,
			next_state: nextState,
		};
	}

	if (currentState === "WAITING_RESTATEMENT" && nextState === "LEARNING_CONCEPT" && !options.scorePassed) {
		return {
			ok: false,
			reason: "restatement_required_before_advancing",
			message:
				"Cannot advance from WAITING_RESTATEMENT to LEARNING_CONCEPT. Score the learner's restatement first.",
			current_state: currentState,
			next_state: nextState,
		};
	}

	if (currentState === "CORRECTING" && ["LEARNING_CONCEPT", "NODE_SUMMARY"].includes(nextState) && !options.scorePassed) {
		return {
			ok: false,
			reason: "remediation_not_passed",
			message:
				"Cannot leave CORRECTING for the next concept or node summary until the current concept passes the scoring gate.",
			current_state: currentState,
			next_state: nextState,
		};
	}

	const allowed = allowedStateTransitions[currentState] || allowedStateTransitions.NEW;
	if (currentState !== nextState && !allowed.includes(nextState)) {
		return {
			ok: false,
			reason: "invalid_transition",
			message: `Invalid Feynman state transition: ${currentState} -> ${nextState}.`,
			current_state: currentState,
			next_state: nextState,
		};
	}

	if (nextState === "SCORING") {
		const summary = String(updates.learner_summary || updates.learnerSummary || current.learner_summary || "").trim();
		if (summary.length < MIN_RESTATEMENT_CHARS) {
			return {
				ok: false,
				reason: "missing_or_short_restatement",
				message:
					"Cannot enter SCORING without a learner restatement of at least 20 characters.",
				current_state: currentState,
				next_state: nextState,
			};
		}
	}

	return { ok: true, current_state: currentState, next_state: nextState };
}

function validationFailureResult(validation: ValidationResult) {
	return {
		content: [
			{
				type: "text",
				text: validation.message || `Feynman state validation failed: ${validation.reason || "unknown"}.`,
			},
		],
		details: {
			ok: false,
			reason: validation.reason || "validation_failed",
			validation,
		},
	};
}

async function validateProjectMutation(
	project: string,
	updates: JsonObject,
	options: {
		ctx?: ToolContext;
		branchMode?: BranchMode;
		source: string;
		scorePassed?: boolean;
		allowConceptSwitch?: boolean;
	}): Promise<{ ok: true; current: JsonObject; next: JsonObject; branch?: BranchInfo } | { ok: false; validation: ValidationResult }> {
	const current = await readJson(progressPath(project), {
		project: slugify(project),
		scores: [],
		completed_nodes: [],
		active_misconceptions: [],
	});
	const branch = getBranchInfo(options.ctx);
	const branchValidation = validateBranchOwnership(current, branch, options.branchMode || "strict");
	if (!branchValidation.ok) return { ok: false, validation: branchValidation };

	const stateValidation = validateStateTransition(current, updates, {
		scorePassed: options.scorePassed,
		allowConceptSwitch: options.allowConceptSwitch,
	});
	if (!stateValidation.ok) return { ok: false, validation: stateValidation };

	const stamp = branchStamp(branch, options.source);
	const next = {
		...current,
		...updates,
		project: slugify(project),
		...(stamp ? { pi_branch: stamp } : {}),
		updated_at: nowStamp(),
	};
	return { ok: true, current, next, branch };
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

async function mergeProgress(
	project: string,
	updates: JsonObject,
	options: {
		ctx?: ToolContext;
		branchMode?: BranchMode;
		source: string;
		scorePassed?: boolean;
		allowConceptSwitch?: boolean;
	} = { source: "feynman_update_progress" },
): Promise<{ ok: true; progress: JsonObject } | { ok: false; validation: ValidationResult }> {
	const file = progressPath(project);
	return withQueuedFileMutation(file, async () => {
		const validation = await validateProjectMutation(project, updates, options);
		if (!validation.ok) return validation;

		await writeJson(file, validation.next);
		return { ok: true, progress: validation.next };
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
		async execute(_toolCallId, params: ConceptNoteParams, _signal, _onUpdate, ctx?: ToolContext) {
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

			const progressResult = await mergeProgress(
				project,
				{
					current_state: params.state || "WAITING_RESTATEMENT",
					current_outline_node: params.outlineNode,
					current_concept: params.concept,
					current_concept_note: notePath,
					next_action: "Ask the learner to restate this concept in their own words and provide their own example.",
				},
				{
					ctx,
					branchMode: normalizeBranchMode(params.branchMode),
					source: "feynman_write_concept_note",
					allowConceptSwitch: !!params.force,
				},
			);
			if (!progressResult.ok) {
				return validationFailureResult(progressResult.validation);
			}
			const progress = progressResult.progress;

			await withQueuedFileMutation(notePath, async () => {
				await mkdir(dirname(notePath), { recursive: true });
				const existing = await readText(notePath);
				const markdown = existing ? appendCorrection(existing, params) : renderConceptNote({ ...params, project }, notePath);
				await writeFile(notePath, markdown, "utf8");
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
		async execute(_toolCallId, params: { project: string; progress: JsonObject; branchMode?: BranchMode }, _signal, _onUpdate, ctx?: ToolContext) {
			const project = slugify(params.project);
			const progressResult = await mergeProgress(project, params.progress, {
				ctx,
				branchMode: normalizeBranchMode(params.branchMode),
				source: "feynman_update_progress",
			});
			if (!progressResult.ok) {
				return validationFailureResult(progressResult.validation);
			}
			const progress = progressResult.progress;
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
		name: "feynman_validate_transition",
		label: "Validate Feynman Transition",
		description:
			"Validate a proposed Feynman progress.json transition and Pi session branch ownership before writing it.",
		promptSnippet:
			"feynman_validate_transition: check whether a proposed Feynman state transition is legal before updating progress.",
		promptGuidelines: [
			"Use feynman_validate_transition when unsure whether a Feynman project can move to the next state.",
			"Do not bypass a feynman_validate_transition failure unless the learner explicitly chooses to adopt the current Pi branch.",
		],
		parameters: validateTransitionParameters,
		async execute(_toolCallId, params: ValidateTransitionParams, _signal, _onUpdate, ctx?: ToolContext) {
			const project = slugify(params.project);
			const validation = await validateProjectMutation(project, params.nextProgress, {
				ctx,
				branchMode: normalizeBranchMode(params.branchMode),
				source: "feynman_validate_transition",
			});
			if (!validation.ok) {
				return validationFailureResult(validation.validation);
			}

			return {
				content: [{ type: "text", text: `Transition is valid for ${project}.` }],
				details: {
					ok: true,
					project,
					current: validation.current,
					next: validation.next,
					branch: validation.branch,
				},
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
		async execute(_toolCallId, params: ScoreParams, _signal, _onUpdate, ctx?: ToolContext) {
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
				const progressUpdates = {
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
				};
				const branch = getBranchInfo(ctx);
				const branchValidation = validateBranchOwnership(current, branch, normalizeBranchMode(params.branchMode));
				if (!branchValidation.ok) return branchValidation;
				const stateValidation = validateStateTransition(current, progressUpdates, {
					scorePassed: passed,
					allowConceptSwitch: passed,
				});
				if (!stateValidation.ok) return stateValidation;
				const stamp = branchStamp(branch, "feynman_record_score");
				const next = {
					...current,
					project,
					...progressUpdates,
					...(stamp ? { pi_branch: stamp } : {}),
					updated_at: nowStamp(),
				};
				await writeJson(file, next);
				return next;
			});
			if (progress.ok === false) {
				return validationFailureResult(progress);
			}
			const progressState = progress as JsonObject;

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
				updatedAt: progressState.updated_at,
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
				details: { ok: true, project, passed, average, minScore, scores, progress: progressState, reviews, concept_entry: conceptEntry, concept_count: conceptCount },
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
