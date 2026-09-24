import { CommandId, ThreadId, ProjectId, MessageId, RunId, RuntimeRequestId, OrchestrationV2Command, ProviderApprovalDecision, DEFAULT_MODEL_BY_PROVIDER, type EnvironmentId, type OrchestrationV2ThreadProjection, type ServerProvider } from "@t3tools/contracts";
import type { PillAction, PillRequest, PillReply, PillThread, PillMessage, PillContextAgent } from "@t3tools/shared/gluiPill";
import { projectPillContext } from "./gluiPillContext";
import { projectPillTool } from "./gluiPillTools";
import { readWebSources } from "@t3tools/shared/webSearchSources";
import { runAtomCommand, type AtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentThreadState } from "@t3tools/client-runtime/state/threads";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Atom } from "effect/unstable/reactivity";
import { appAtomRegistry as registry } from "./rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "./state/primaryEnvironment";
import { primaryServerConfigAtom } from "./state/server";
import { environmentShell } from "./state/shell";
import { environmentThreadDetails, threadEnvironment } from "./state/threads";
import { projectEnvironment } from "./state/projects";
import { orchestrationEnvironment } from "./state/orchestration";

declare global {
  interface Window {
    gluiPillHost?: { onRequest(listener: (request: PillRequest) => void): () => void; reply(reply: PillReply): void };
  }
}

const busy = (status: string) => ["preparing", "starting", "running", "waiting"].includes(status);
const driver = (provider: string) => provider === "claude" ? "claudeAgent" : provider;
const providerFor = (instanceId: string): PillThread["provider"] => {
  const kind = registry.get(primaryServerConfigAtom)?.providers.find(p => p.instanceId === instanceId)?.driver;
  return kind === "claudeAgent" ? "claude" : kind === "opencode" ? "opencode" : "codex";
};
const contextAgentFor = (instanceId: string, model?: string): PillContextAgent => {
  const instance = registry.get(primaryServerConfigAtom)?.providers.find(p => p.instanceId === instanceId);
  const provider = instance?.driver === "claudeAgent" ? "claude" : instance?.driver === "codex" ? "codex" : instance?.driver === "opencode" ? "opencode" : undefined;
  const providerLabel = provider === "claude" ? "Claude Code" : provider === "codex" ? "Codex" : provider === "opencode" ? "OpenCode" : "Agent";
  return { ...(provider ? { provider } : {}), label: (model && instance?.models.find(m => m.slug === model)?.name) || model || providerLabel };
};

export function projectPillThread(projection: OrchestrationV2ThreadProjection, workspaceRoot: string, hasMoreHistory: boolean): PillThread {
  const active = projection.runs.findLast(run => busy(run.status));
  const latest = projection.runs.at(-1);
  const queued = new Set(projection.runs.filter(run => run.status === "queued").map(run => run.userMessageId));
  const pending = new Set(projection.runtimeRequests.filter(r => r.status === "pending").map(r => r.id));
  const messages: PillMessage[] = [];
  const permissions: PillThread["permissions"] = [];
  const questions: PillThread["questions"] = [];
  const sourcesByRun = new Map<string, NonNullable<PillMessage["sources"]>>();
  for (const { item, sourceThreadId } of projection.visibleTurnItems) {
    if (item.type !== "web_search" || !item.runId) continue;
    const key = `${sourceThreadId}:${item.runId}`;
    sourcesByRun.set(key, [...(sourcesByRun.get(key) ?? []), ...readWebSources(item.results)]);
  }
  for (const { item, sourceThreadId } of projection.visibleTurnItems) {
    const base = { id: `${sourceThreadId}:${item.id}`, timestamp: DateTime.toEpochMillis(item.startedAt ?? item.updatedAt) };
    if (item.type === "user_message" || item.type === "assistant_message") {
      if (item.type === "user_message" && queued.has(item.messageId)) continue;
      messages.push({ ...base, id: item.messageId, role: item.type === "user_message" ? "user" : "assistant", content: item.text,
        ...(item.type === "assistant_message" && item.runId ? { sources: sourcesByRun.get(`${sourceThreadId}:${item.runId}`) ?? [] } : {}),
        ...(item.type === "user_message" && item.attachments.length ? { attachments: item.attachments.filter(a => a.type === "image" || a.type === "file").map(a => ({ id: a.id, type: a.type as "image" | "file", name: a.name, mimeType: a.mimeType, size: a.sizeBytes, path: "" })) } : {}),
      });
    } else if (item.type === "approval_request" && pending.has(item.requestId)) {
      permissions.push({ questionId: item.requestId, toolTitle: item.title ?? item.requestKind, ...(item.prompt ? { toolDescription: item.prompt } : {}), options: (item.options ?? [{ decision: "accept", label: "Allow" }, { decision: "decline", label: "Deny" }]).map(o => ({ optionId: o.decision, label: o.label })) });
    } else if (item.type === "user_input_request" && pending.has(item.requestId)) {
      questions.push({ type: "user_input", questionId: item.requestId, questions: item.questions.map(q => ({ id: q.id, question: q.question, options: [...q.options], ...(q.multiSelect === undefined ? {} : { multiple: q.multiSelect }) })) });
    } else if (item.type === "error") {
      messages.push({ ...base, role: "system", content: `Error: ${item.failure.message}` });
    } else if (item.type === "system_notice" || item.type === "run_interrupt_result") {
      messages.push({ ...base, role: "system", content: item.message });
    } else if (item.type === "proposed_plan") {
      messages.push({ ...base, role: "assistant", content: item.markdown });
    } else if (item.type === "handoff" || item.type === "compaction") {
      messages.push({ ...base, role: "system", content: item.summary ?? "", contextChange: projectPillContext(item, contextAgentFor) });
    } else if (["command_execution", "dynamic_tool", "file_change", "file_search", "web_search", "subagent"].includes(item.type)) {
      messages.push({ ...base, role: "tool", content: item.title ?? item.type.replaceAll("_", " "), ...projectPillTool(item) });
    }
  }
  const native = projection.providerThreads.find(t => t.id === projection.thread.activeProviderThreadId)?.nativeThreadRef?.nativeId ?? null;
  return {
    threadId: projection.thread.id, title: projection.thread.title, provider: providerFor(projection.thread.modelSelection.instanceId), model: projection.thread.modelSelection.model, modelOptions: [...(projection.thread.modelSelection.options ?? [])], runtimeMode: providerFor(projection.thread.modelSelection.instanceId) === "opencode" && projection.thread.runtimeMode === "auto-accept-edits" ? "auto" : projection.thread.runtimeMode,
    workspaceRoot: projection.thread.worktreePath ?? workspaceRoot, nativeSessionId: native,
    status: active ? active.status === "preparing" || active.status === "starting" ? "connecting" : "running" : latest?.status === "failed" ? "failed" : latest?.status === "completed" ? "completed" : "idle",
    activeRequestId: active?.userMessageId ?? null, lastRunId: latest?.id ?? null, messages, permissions, questions, hasMoreHistory,
    queuedPrompts: projection.messages.filter(m => queued.has(m.id)).map(m => ({ prompt: m.text })),
  };
}

export function installGluiPillBridge(): () => void {
  const host = window.gluiPillHost;
  if (!host) return () => {};
  const watches = new Map<string, { dispose: () => void; ready: Promise<void> }>();
  const readyAtom = Atom.make(get => {
    const id = get(primaryEnvironmentIdAtom);
    if (!id || !get(primaryServerConfigAtom)) return null;
    return get(environmentShell.stateValueAtom(id)).status === "live" ? id : null;
  });
  const awaitReady = () => new Promise<EnvironmentId>((resolve, reject) => {
    let dispose = () => {};
    const timer = setTimeout(() => { dispose(); reject(new Error("GLUI workspace is not connected.")); }, 60_000);
    const check = (id: EnvironmentId | null) => { if (id) { clearTimeout(timer); dispose(); resolve(id); } };
    dispose = registry.subscribe(readyAtom, check);
    check(registry.get(readyAtom));
  });
  const run = async <W, A, E>(command: AtomCommand<W, A, E>, input: W) => {
    const result = await runAtomCommand(registry, command, input);
    if (result._tag === "Failure") throw Cause.squash(result.cause);
    return result.value;
  };
  const selection = (provider: string, model?: string) => {
    const instance = registry.get(primaryServerConfigAtom)?.providers.find(p => p.driver === driver(provider) && p.enabled && p.availability !== "unavailable");
    if (!instance) throw new Error(`${provider} is unavailable. Check the agent CLI installation and sign-in, then restart GLUI.`);
    const chosen = model || instance.models.find(m => m.isDefault)?.slug || instance.models[0]?.slug || DEFAULT_MODEL_BY_PROVIDER[instance.driver];
    if (!chosen) throw new Error(`No models are available for ${provider}.`);
    return { instanceId: instance.instanceId, model: chosen };
  };
  // The shell connects before CLI discovery finishes on a fresh profile.
  // Keep the picker loading until the live catalog arrives, with a retryable
  // error if discovery fails instead of displaying an empty model menu.
  const catalog = (provider: string) => new Promise<ServerProvider>((resolve, reject) => {
    let dispose = () => {};
    let last: ServerProvider | undefined;
    const finish = (error?: string) => {
      clearTimeout(timer); dispose();
      if (error) reject(new Error(error));
      else resolve(last!);
    };
    const timer = setTimeout(() => finish(last?.message ?? `No models were discovered for ${provider}. Check the agent setup and retry.`), 30_000);
    const check = () => {
      last = registry.get(primaryServerConfigAtom)?.providers.find(p => p.driver === driver(provider));
      if (!last?.enabled) finish(`${provider} is unavailable. Check the agent CLI installation and sign-in, then restart GLUI.`);
      else if (last.models.length) finish();
      else if (last.availability === "unavailable") finish(last.unavailableReason ?? `${provider} is unavailable.`);
    };
    dispose = registry.subscribe(primaryServerConfigAtom, check);
    check();
  });
  const watch = (environmentId: EnvironmentId, threadId: string): Promise<void> => {
    const existing = watches.get(threadId);
    if (existing) return existing.ready;
    const atom = environmentThreadDetails.stateAtom({ environmentId, threadId: ThreadId.make(threadId) });
    let dispose = () => {};
    let timer: ReturnType<typeof setTimeout>;
    let initialized = false;
    let emitTimer: ReturnType<typeof setTimeout> | undefined;
    let nextState: EnvironmentThreadState | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      const send = (state: EnvironmentThreadState) => {
        if (state.status === "deleted" || Option.isSome(state.error)) {
          if (!initialized) { clearTimeout(timer); reject(new Error(Option.getOrElse(state.error, () => "This conversation no longer exists."))); }
          return;
        }
        if (Option.isNone(state.data)) return;
        const emit = () => {
          emitTimer = undefined;
          const current = nextState;
          if (!current || Option.isNone(current.data)) return;
          const projection = current.data.value;
          const shell = registry.get(environmentShell.stateValueAtom(environmentId));
          const root = Option.getOrNull(shell.snapshot)?.projects.find(p => p.id === projection.thread.projectId)?.workspaceRoot ?? "";
          host.reply({ kind: "thread", thread: projectPillThread(projection, root, current.history.hasMoreHistory) });
        };
        nextState = state;
        const immediate = !initialized || !state.data.value.runs.some(run => busy(run.status)) || state.data.value.runtimeRequests.some(request => request.status === "pending");
        if (immediate) { if (emitTimer) clearTimeout(emitTimer); emit(); }
        else if (!emitTimer) emitTimer = setTimeout(emit, 32);
        initialized = true; clearTimeout(timer); resolve();
      };
      timer = setTimeout(() => reject(new Error("The conversation could not be loaded. Reopen it to try again.")), 20_000);
      dispose = registry.subscribe(atom, send);
      send(registry.get(atom));
    });
    watches.set(threadId, { dispose: () => { clearTimeout(timer); if (emitTimer) clearTimeout(emitTimer); dispose(); }, ready });
    void ready.catch(() => { dispose(); watches.delete(threadId); });
    return ready;
  };
  const handle = async (action: PillAction): Promise<unknown> => {
    const environmentId = await awaitReady();
    const dispatch = (command: unknown) => run(orchestrationEnvironment.v2.dispatchCommand, { environmentId, input: Schema.decodeUnknownSync(OrchestrationV2Command)(command) });
    // @effect-diagnostics-next-line cryptoRandomUUID:off -- imperative Electron command boundary
    const commandId = () => CommandId.make(crypto.randomUUID());
    if (action.type === "dispatch") return dispatch(action.command);
    if (action.type === "catalog") {
      const instance = await catalog(action.provider);
      return {
        options: instance.models.map(m => ({ id: m.slug, label: m.name, descriptors: m.capabilities?.optionDescriptors ?? [] })),
        defaultModel: instance.models.find(m => m.isDefault)?.slug ?? instance.models[0]?.slug ?? null,
        runtimeModes: instance.supportedRuntimeModes ?? (action.provider === "claude" ? ["approval-required", "auto-accept-edits", "auto", "full-access"] : ["approval-required", "auto", "full-access"]),
      };
    }
    if (action.type === "history") {
      const snapshot = Option.getOrNull(registry.get(environmentShell.stateValueAtom(environmentId)).snapshot);
      return snapshot?.threads.map(t => ({ sessionId: t.id, provider: providerFor(t.modelSelection.instanceId), slug: t.title, firstMessage: t.title, lastTimestamp: DateTime.formatIso(t.updatedAt), size: 0, projectPath: snapshot.projects.find(p => p.id === t.projectId)?.workspaceRoot })) ?? [];
    }
    if (!action.threadId) throw new Error("A thread is required.");
    const threadId = ThreadId.make(action.threadId);
    if (action.type === "unwatch") { watches.get(threadId)?.dispose(); watches.delete(threadId); return; }
    if (action.type === "watch") return watch(environmentId, threadId);
    if (action.type === "load-earlier") {
      await watch(environmentId, threadId);
      const result = await run(threadEnvironment.loadEarlierHistory, { environmentId, input: { threadId } });
      if (result._tag === "error") throw new Error(result.message);
      return;
    }
    if (action.type === "select") return dispatch({ type: "thread.model-selection.set", commandId: commandId(), threadId, modelSelection: selection(action.provider, action.model) });
    if (action.type === "respond") return dispatch({ type: "runtime-request.respond", commandId: commandId(), threadId, requestId: RuntimeRequestId.make(action.requestId), ...(action.decision ? { decision: Schema.decodeUnknownSync(ProviderApprovalDecision)(action.decision) } : { answers: action.answers ?? {} }) });
    if (action.type === "fork") {
      const result = await run(threadEnvironment.forkFromRun, { environmentId, input: { sourceThreadId: threadId, targetThreadId: ThreadId.make(action.targetThreadId), runId: RunId.make(action.runId) } });
      // The command receipt can arrive before the shell stream. Publish the
      // new pill tab only once history and workspace navigation know about it.
      await new Promise<void>((resolve, reject) => {
        const atom = environmentShell.stateValueAtom(environmentId);
        let dispose = () => {};
        const timer = setTimeout(() => { dispose(); reject(new Error("The branch was created but has not appeared in history yet. Reopen it from history.")); }, 20_000);
        const check = () => {
          if (Option.getOrNull(registry.get(atom).snapshot)?.threads.some(thread => thread.id === action.targetThreadId)) {
            clearTimeout(timer); dispose(); resolve();
          }
        };
        dispose = registry.subscribe(atom, check);
        check();
      });
      return result;
    }
    if (action.type === "stop") return run(threadEnvironment.stopSession, { environmentId, input: { threadId } });
    if (action.type !== "prompt") throw new Error("Unsupported pill action");
    const shell = Option.getOrNull(registry.get(environmentShell.stateValueAtom(environmentId)).snapshot);
    const existing = shell?.threads.find(t => t.id === threadId);
    const selected = existing && !action.model && providerFor(existing.modelSelection.instanceId) === action.provider
      ? existing.modelSelection : selection(action.provider, action.model);
    const modelSelection = action.modelOptions ? { ...selected, options: action.modelOptions } : selected;
    const chosenRuntimeMode = action.runtimeMode ?? (action.permissionMode === "auto" ? "full-access" : "approval-required");
    const runtimeMode = action.provider === "opencode" && chosenRuntimeMode === "auto" ? "auto-accept-edits" : chosenRuntimeMode;
    if (!existing) {
      const project = shell?.projects.find(p => p.workspaceRoot === action.projectPath);
      const projectId = project?.id ?? ProjectId.make(commandId());
      if (!project) await run(projectEnvironment.create, { environmentId, input: { projectId, title: action.projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "Home", workspaceRoot: action.projectPath } });
      await dispatch({ type: "thread.create", commandId: commandId(), threadId, projectId, title: action.prompt.slice(0, 70) || "New conversation", modelSelection, runtimeMode, interactionMode: "default", branch: null, worktreePath: null, createdBy: "user", creationSource: "web", ...(action.nativeSessionId ? { importedNativeThread: { ref: { driver: driver(action.provider), nativeId: action.nativeSessionId, strength: "strong" } } } : {}) });
    } else {
      await dispatch({ type: "thread.runtime-mode.set", commandId: commandId(), threadId, runtimeMode });
    }
    await watch(environmentId, threadId);
    return run(threadEnvironment.startTurn, { environmentId, input: { commandId: CommandId.make(action.requestId), threadId, runtimeMode, interactionMode: "default", modelSelection, dispatchMode: "queue", message: { role: "user", messageId: MessageId.make(action.requestId), text: action.prompt, attachments: (action.attachments ?? []).filter(a => a.type === "image").map(a => ({ id: a.id, type: "image" as const, name: a.name, mimeType: a.mimeType ?? "image/png", sizeBytes: a.size ?? 0, dataUrl: a.dataUrl })) } } });
  };
  const dispose = host.onRequest(request => {
    void handle(request.action).then(value => host.reply({ kind: "response", id: request.id, value }), error => host.reply({ kind: "response", id: request.id, error: error instanceof Error ? error.message : String(error) }));
  });
  host.reply({ kind: "ready" });
  return () => { dispose(); for (const stop of watches.values()) stop.dispose(); watches.clear(); };
}
