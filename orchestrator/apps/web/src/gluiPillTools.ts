import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import type { PillMessage } from "@t3tools/shared/gluiPill";
import { readWebSources } from "../../../packages/shared/src/webSearchSources";

function outputText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "content" in value && Array.isArray(value.content)) {
    const text = value.content.flatMap(block => block && typeof block === "object" && block.type === "text" && typeof block.text === "string" ? [block.text] : []).join("\n\n");
    if (text) return text;
  }
  return JSON.stringify(value, null, 2);
}

/** Adapt canonical tool kinds to the pill's existing tool presentations. */
export function projectPillTool(item: OrchestrationV2TurnItem): Partial<PillMessage> | undefined {
  if (!["command_execution", "dynamic_tool", "file_change", "file_search", "web_search", "subagent"].includes(item.type)) return undefined;
  let toolName: string;
  let input: unknown;
  let output: unknown;
  let sources: PillMessage["sources"];
  switch (item.type) {
    case "command_execution": toolName = "Bash"; input = { command: item.input }; output = item.output; break;
    case "file_change": toolName = "Edit"; input = { file_path: item.fileName, old_string: item.oldStr, new_string: item.newStr }; output = item.diffStr ?? item.changes; break;
    case "file_search": toolName = "Grep"; input = { pattern: item.pattern }; output = item.results?.map(result => `${result.fileName}${result.line ? `:${result.line}` : ""}${result.preview ? `\n${result.preview}` : ""}`).join("\n\n"); break;
    case "web_search": toolName = "WebSearch"; input = { query: item.patterns?.join(" · ") }; sources = readWebSources(item.results); break;
    case "subagent": toolName = "Agent"; input = { prompt: item.prompt }; output = item.result ?? item.progress; break;
    case "dynamic_tool": toolName = item.toolName ?? item.title ?? "Tool"; input = item.input; output = item.output; break;
    default: return undefined;
  }
  const failed = ["failed", "cancelled", "interrupted"].includes(item.status) || (item.type === "command_execution" && (item.outputIndicatesFailure || (item.exitCode !== undefined && item.exitCode !== 0)));
  const toolResult = outputText(output);
  return {
    toolId: item.id, toolKind: item.type, toolState: item.status, toolName,
    toolInput: typeof input === "string" ? input : JSON.stringify(input),
    ...(toolResult === undefined ? {} : { toolResult }),
    ...(sources?.length ? { sources } : {}),
    toolStatus: failed ? "error" : item.status === "completed" ? "completed" : "running",
  };
}
