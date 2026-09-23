import { app, BrowserWindow, ipcMain } from "electron";
import type { PillReply, PillRequest } from "@t3tools/shared/gluiPill";

export const isPillHost = process.env.GLUI_WORKSPACE_HOST === "1" && typeof process.send === "function";
let quitting = false;
export const isPillHostQuitting = () => quitting;

/** Only our parent process can drive this bridge; no socket or public IPC endpoint. */
export function installPillHost(): void {
  if (!isPillHost) return;
  let renderer: Electron.WebContents | undefined;
  const pending: PillRequest[] = [];
  const deliver = (request: PillRequest) => {
    if (!renderer || renderer.isDestroyed()) return;
    if (request.action.type === "show") {
      const window = BrowserWindow.fromWebContents(renderer);
      if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
    }
    renderer.send("glui:host-request", request);
  };
  app.on("before-quit", () => { quitting = true; });
  app.whenReady().then(() => app.dock?.hide());
  ipcMain.on("glui:host-reply", (event, reply: PillReply) => {
    // Only the app's own top-level renderer gets the parent capability.
    if (event.senderFrame !== event.sender.mainFrame || !event.sender.getURL().startsWith("glui://app")) return;
    if (reply.kind === "ready") {
      renderer = event.sender;
      for (const request of pending.splice(0)) deliver(request);
    }
    process.send?.(reply);
  });
  process.on("message", (message: PillRequest | { kind: "shutdown" }) => {
    if (message.kind === "shutdown") { quitting = true; app.quit(); return; }
    if (message.kind !== "request") return;
    if (renderer && !renderer.isDestroyed()) deliver(message);
    else if (pending.length < 128) pending.push(message);
    else process.send?.({ kind: "response", id: message.id, error: "Workspace is still starting. Please retry." });
  });
  process.once("disconnect", () => { quitting = true; app.quit(); });
}
