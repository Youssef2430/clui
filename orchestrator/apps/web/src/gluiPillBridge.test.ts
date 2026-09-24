import { afterEach, expect, it, vi } from "vite-plus/test";
import type { OrchestrationV2ThreadProjection, OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import type { PillAction, PillReply, PillRequest } from "@t3tools/shared/gluiPill";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Exit from "effect/Exit";
import { mergeOlderHistoryIntoProjection } from "@t3tools/client-runtime/state/threads";

const mocks = vi.hoisted(() => ({
  registry: { get: vi.fn(), subscribe: vi.fn() },
  run: vi.fn(),
  thread: Symbol("thread"), shell: Symbol("shell"), config: Symbol("config"),
  loadEarlier: Symbol("load-earlier"),
}));
vi.mock("./rpc/atomRegistry", () => ({ appAtomRegistry: mocks.registry }));
vi.mock("./state/primaryEnvironment", () => ({ primaryEnvironmentIdAtom: Symbol("environment") }));
vi.mock("./state/server", () => ({ primaryServerConfigAtom: mocks.config }));
vi.mock("./state/shell", () => ({ environmentShell: { stateValueAtom: () => mocks.shell } }));
vi.mock("./state/threads", () => ({
  environmentThreadDetails: { stateAtom: () => mocks.thread },
  threadEnvironment: { loadEarlierHistory: mocks.loadEarlier },
}));
vi.mock("./state/projects", () => ({ projectEnvironment: {} }));
vi.mock("./state/orchestration", () => ({ orchestrationEnvironment: { v2: {} } }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({ runAtomCommand: mocks.run }));

import { installGluiPillBridge } from "./gluiPillBridge";

let dispose = () => {};
afterEach(() => { dispose(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

function setup() {
  const now = DateTime.makeUnsafe("2026-09-23T00:00:00Z");
  const rows = Array.from({ length: 31 }, (_, index) => ({
    sourceThreadId: "saved-thread", sourceItemId: `item-${index}`, visibility: "local", position: index,
    item: { id: `item-${index}`, type: "user_message", messageId: `message-${index}`, text: `Prompt ${index + 1}`,
      createdBy: "user", inputIntent: "turn_start", status: "completed", attachments: [], startedAt: now, updatedAt: now },
  })) as unknown as OrchestrationV2ProjectedTurnItem[];
  // The server opens with ten turns and returns up to twenty per older page.
  const initial = rows.slice(-10);
  const pages = [rows.slice(1, 21), rows.slice(0, 1)];
  let projection = {
    thread: { id: "saved-thread", title: "Long conversation", projectId: "project", runtimeMode: "approval-required",
      modelSelection: { instanceId: "codex", model: "test" }, activeProviderThreadId: null },
    runs: [], attempts: [], providerThreads: [], runtimeRequests: [], messages: [],
    turnItems: initial.map(row => row.item), visibleTurnItems: initial,
  } as unknown as OrchestrationV2ThreadProjection;
  let history = { hasMoreHistory: true };
  const state = () => ({ status: "live", error: Option.none(), data: Option.some(projection), history });
  const listeners = new Set<(value: ReturnType<typeof state>) => void>();
  mocks.registry.get.mockImplementation(atom => atom === mocks.thread ? state()
    : atom === mocks.config ? { providers: [{ instanceId: "codex", driver: "codex" }] }
    : atom === mocks.shell ? { snapshot: Option.some({ projects: [{ id: "project", workspaceRoot: "/project" }] }) }
    : "environment");
  mocks.registry.subscribe.mockImplementation((atom, listener) => {
    if (atom === mocks.thread) listeners.add(listener);
    return () => { listeners.delete(listener); };
  });
  mocks.run.mockImplementation(async (_registry, command, input) => {
    expect(command).toBe(mocks.loadEarlier);
    expect(input).toEqual({ environmentId: "environment", input: { threadId: "saved-thread" } });
    projection = mergeOlderHistoryIntoProjection(projection, pages.shift()!);
    history = { hasMoreHistory: pages.length > 0 };
    for (const listener of listeners) listener(state());
    return Exit.succeed({ _tag: "loaded" });
  });
  const replies: PillReply[] = [];
  const pending = new Map<string, (reply: Extract<PillReply, { kind: "response" }>) => void>();
  let listener: (request: PillRequest) => void;
  vi.stubGlobal("window", { gluiPillHost: {
    onRequest: (next: typeof listener) => { listener = next; return () => {}; },
    reply: (reply: PillReply) => {
      replies.push(reply);
      if (reply.kind === "response") { pending.get(reply.id)?.(reply); pending.delete(reply.id); }
    },
  } });
  dispose = installGluiPillBridge();
  let sequence = 0;
  return {
    replies,
    request: (action: PillAction) => new Promise<Extract<PillReply, { kind: "response" }>>(resolve => {
      const id = String(++sequence);
      pending.set(id, resolve);
      listener({ kind: "request", id, action });
    }),
    latest: () => replies.filter(reply => reply.kind === "thread").at(-1)!.thread,
  };
}

it("loads a reopened conversation beyond ten turns, across multiple pages without duplicates", async () => {
  const bridge = setup();
  await bridge.request({ type: "watch", threadId: "saved-thread" });
  expect(bridge.latest().messages).toHaveLength(10);
  expect(bridge.latest().messages[0]?.content).toBe("Prompt 22");
  expect(bridge.latest().hasMoreHistory).toBe(true);

  expect((await bridge.request({ type: "load-earlier", threadId: "saved-thread" })).error).toBeUndefined();
  expect(bridge.latest().messages).toHaveLength(30);
  expect(bridge.latest().hasMoreHistory).toBe(true);
  await bridge.request({ type: "load-earlier", threadId: "saved-thread" });
  expect(bridge.latest().messages.map(message => message.content)).toEqual(Array.from({ length: 31 }, (_, i) => `Prompt ${i + 1}`));
  expect(bridge.latest().hasMoreHistory).toBe(false);
});

it("reports history errors through the parent bridge and allows retry without losing the transcript", async () => {
  const bridge = setup();
  await bridge.request({ type: "watch", threadId: "saved-thread" });
  mocks.run.mockResolvedValueOnce(Exit.succeed({ _tag: "error", message: "History request failed" }));
  const failed = await bridge.request({ type: "load-earlier", threadId: "saved-thread" });
  expect(failed.error).toBe("History request failed");
  expect(bridge.latest().messages).toHaveLength(10);
  expect(bridge.latest().hasMoreHistory).toBe(true);
  expect((await bridge.request({ type: "load-earlier", threadId: "saved-thread" })).error).toBeUndefined();
  expect(bridge.latest().messages).toHaveLength(30);
});
