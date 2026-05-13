import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const baseDir = dirname(fileURLToPath(import.meta.url));
const protocolPath = join(baseDir, "..", "..", "AGENTS.md");

let cachedProtocol: string | undefined;

async function loadProtocol(): Promise<string> {
	if (cachedProtocol) return cachedProtocol;
	cachedProtocol = await readFile(protocolPath, "utf8");
	return cachedProtocol;
}

export default function feynmanProtocol(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		if (event.systemPrompt.includes("# Feynman Learning Agent")) {
			return undefined;
		}

		const protocol = await loadProtocol();
		return {
			systemPrompt: `${event.systemPrompt}\n\n${protocol}`,
		};
	});
}
