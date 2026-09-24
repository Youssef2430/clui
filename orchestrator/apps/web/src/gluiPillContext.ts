import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import type { PillContextAgent, PillContextChange } from "@t3tools/shared/gluiPill";

type Handoff = Extract<OrchestrationV2TurnItem, { type: "handoff" }>;
type Compaction = Extract<OrchestrationV2TurnItem, { type: "compaction" }>;
type ContextItem =
  | Pick<Handoff, "type" | "status" | "summary" | "fromModelSelections" | "fromProviderInstanceIds" | "toProviderInstanceId" | "toModel">
  | Pick<Compaction, "type" | "status" | "summary" | "beforeTokenCount" | "afterTokenCount">;

/** Preserve the models recorded at handoff time, even after later model changes. */
export function projectPillContext(
  item: ContextItem,
  resolveAgent: (instanceId: string, model?: string) => PillContextAgent,
): PillContextChange {
  const state = ["failed", "cancelled", "interrupted"].includes(item.status)
    ? "failed"
    : item.status === "completed" ? "completed" : "running";
  const base = { kind: item.type, state, ...(item.summary === undefined ? {} : { summary: item.summary }) } as const;
  if (item.type === "compaction") {
    return {
      ...base,
      ...(item.beforeTokenCount === undefined ? {} : { beforeTokens: item.beforeTokenCount }),
      ...(item.afterTokenCount === undefined ? {} : { afterTokens: item.afterTokenCount }),
    };
  }
  const selections = item.fromModelSelections?.length
    ? item.fromModelSelections
    : item.fromProviderInstanceIds.map(instanceId => ({ instanceId, model: undefined }));
  const sources = selections.map(selection => resolveAgent(selection.instanceId, selection.model));
  return {
    ...base,
    sources: sources.filter((agent, index) => sources.findIndex(other => other.provider === agent.provider && other.label === agent.label) === index),
    target: resolveAgent(item.toProviderInstanceId, item.toModel),
  };
}
