import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type TavilyResult = {
	title?: string;
	url?: string;
	content?: string;
	score?: number;
	raw_content?: string;
};

type TavilyResponse = {
	query?: string;
	answer?: string;
	results?: TavilyResult[];
};

const searchParameters = {
	type: "object",
	properties: {
		project: { type: "string", description: "Project slug or topic, e.g. llm" },
		query: { type: "string", description: "Search query" },
		maxResults: { type: "number", description: "Maximum number of search results, default 5" },
		searchDepth: { type: "string", description: "Tavily search_depth: basic or advanced" },
	},
	required: ["project", "query"],
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

function isReservedProjectInput(input: string): boolean {
	return input.trim().startsWith("_");
}

function escapeMd(value: string | undefined): string {
	return (value || "").replace(/\r\n/g, "\n").trim();
}

function projectDir(project: string): string {
	return join(homedir(), ".pi", "feynman-projects", slugify(project));
}

function nowStamp(): string {
	return new Date().toISOString();
}

function filenameStamp(): string {
	return nowStamp().replace(/[:.]/g, "-");
}

function renderMarkdown(project: string, query: string, response: TavilyResponse): string {
	const lines: string[] = [
		`# Web Search: ${query}`,
		"",
		`- Project: ${project}`,
		"- Provider: Tavily",
		`- Retrieved At: ${nowStamp()}`,
		`- Query: ${query}`,
		"",
	];

	if (response.answer) {
		lines.push("## Tavily Answer", "", escapeMd(response.answer), "");
	}

	lines.push("## Sources", "");

	for (const [index, result] of (response.results || []).entries()) {
		lines.push(`### ${index + 1}. ${escapeMd(result.title) || "Untitled"}`);
		lines.push("");
		if (result.url) lines.push(`- URL: ${result.url}`);
		if (typeof result.score === "number") lines.push(`- Score: ${result.score}`);
		lines.push("");
		if (result.content) {
			lines.push(escapeMd(result.content), "");
		}
		if (result.raw_content) {
			lines.push("<details>", "<summary>Raw content</summary>", "", escapeMd(result.raw_content), "", "</details>", "");
		}
	}

	lines.push("## Knowledge Points To Index", "", "- TODO: Extract concepts during `/ingest-docs`.", "");
	lines.push("## Open Questions", "", "- TODO: Mark claims that need cross-checking during `/ingest-docs`.", "");

	return lines.join("\n");
}

export default function feynmanTavily(pi: ExtensionAPI) {
	pi.registerTool({
		name: "feynman_tavily_search",
		label: "Feynman Tavily Search",
		description:
			"Search Tavily for a Feynman learning project and save the results as Markdown under ~/.pi/feynman-projects/<project>/sources/web/.",
		promptSnippet: "feynman_tavily_search: search Tavily and persist web knowledge as Markdown for a Feynman project.",
		promptGuidelines: [
			"Use feynman_tavily_search whenever web search is required for a Feynman learning project.",
			"After using feynman_tavily_search, ingest the generated Markdown before building or revising the outline.",
		],
		parameters: searchParameters,
		async execute(_toolCallId, params, signal) {
			if (isReservedProjectInput(params.project)) {
				return {
					content: [
						{
							type: "text",
							text: `Project name "${params.project}" is reserved. Feynman system directories use leading underscores; choose a learner project name that does not start with "_".`,
						},
					],
					details: { ok: false, reason: "reserved_project_slug" },
				};
			}

			const apiKey = process.env.TAVILY_API_KEY;
			if (!apiKey) {
				return {
					content: [
						{
							type: "text",
							text: "TAVILY_API_KEY is not set. Set it before using Feynman web search.",
						},
					],
					details: { ok: false, reason: "missing_api_key" },
				};
			}

			const project = slugify(params.project);
			const query = params.query.trim();
			const maxResults = Math.max(1, Math.min(Number(params.maxResults || 5), 10));
			const searchDepth = params.searchDepth === "advanced" ? "advanced" : "basic";

			const response = await fetch("https://api.tavily.com/search", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					query,
					search_depth: searchDepth,
					max_results: maxResults,
					include_answer: true,
					include_raw_content: false,
				}),
				signal,
			});

			if (!response.ok) {
				const body = await response.text();
				return {
					content: [{ type: "text", text: `Tavily search failed: ${response.status} ${body}` }],
					details: { ok: false, status: response.status, body },
				};
			}

			const data = (await response.json()) as TavilyResponse;
			const webDir = join(projectDir(project), "sources", "web");
			await mkdir(webDir, { recursive: true });

			const file = join(webDir, `${filenameStamp()}-${slugify(query) || "search"}.md`);
			const markdown = renderMarkdown(project, query, data);
			await writeFile(file, markdown, "utf8");

			return {
				content: [
					{
						type: "text",
						text: `Saved Tavily search results to ${file}`,
					},
				],
				details: {
					ok: true,
					project,
					query,
					file,
					resultCount: data.results?.length || 0,
				},
			};
		},
	});

	pi.registerCommand("feynman-search", {
		description: "Search Tavily for a Feynman project and ask the agent to save results as Markdown",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				ctx.ui.notify("Usage: /feynman-search <project> <query>", "warning");
				return;
			}

			const [project, ...queryParts] = trimmed.split(/\s+/);
			const query = queryParts.join(" ");
			if (!project || !query) {
				ctx.ui.notify("Usage: /feynman-search <project> <query>", "warning");
				return;
			}
			if (isReservedProjectInput(project)) {
				ctx.ui.notify("Project names starting with '_' are reserved for Feynman system directories.", "warning");
				return;
			}

			const message = `Run feynman_tavily_search for project "${project}" with query "${query}", then tell the learner to run /ingest-docs ${project}.`;
			if (ctx.isIdle()) {
				pi.sendUserMessage(message);
			} else {
				pi.sendUserMessage(message, { deliverAs: "followUp" });
				ctx.ui.notify("Feynman search queued", "info");
			}
		},
	});
}
