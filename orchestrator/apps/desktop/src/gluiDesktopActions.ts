import { isPillHost } from "./gluiPillHost.ts";
import * as Electron from "electron";

/** One shortcut and tray for the actual orchestration workspace. */
export function installGluiDesktopActions(): () => void {
  if (isPillHost) return () => {};
  const showWorkspace = () => {
    const window = Electron.BrowserWindow.getAllWindows().find(
      (candidate) => candidate.webContents.getURL().startsWith("glui:"),
    );
    if (!window) { Electron.app.emit("activate"); return; }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  const toggleWorkspace = () => {
    const window = Electron.BrowserWindow.getAllWindows().find(
      (candidate) => candidate.webContents.getURL().startsWith("glui:"),
    );
    if (window?.isFocused() && window.isVisible()) window.hide();
    else showWorkspace();
  };
  const accelerator = Electron.globalShortcut.register("Alt+Space", toggleWorkspace)
    ? "Alt+Space"
    : Electron.globalShortcut.register("CommandOrControl+Shift+K", toggleWorkspace)
      ? "CommandOrControl+Shift+K" : null;
  const image = Electron.nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAACXBIWXMAAAsTAAALEwEAmpwYAAABDElEQVR4nNXSsSuFURjH8Q9JMkgpg8EgpYyUAaORLNxSd5NbN4vdH0CZLoubwaaMDOQPILPFZDDYjDcsujr1qLeb9+2+3cmvnjqn8zvf93l/5+G/aBx1NNCMOsV8nNfwhfMiyC5aaP9RzfDcxf4TfXmQZPjGJXawmamx8C0GbDvvd1oB2egll3p0kzrpSY0ApSCTZnGAw6i0XsM+hotARwHai/1ZTuBtVIpAlTA9xEtMRHc1nHSAqkWgIbyG8RiDmbPVMqCkZXyE+Q0XMTu3ZUFJc3gsyKfdLehXM1jvGMirAG3pQf14CtBSmYujmMI0VnAdkBcMdAuZzISerXcslO3mPr7+jJuY6JG8Gz9bOldlFbTwQQAAAABJRU5ErkJggg==").resize({ height: 20 });
  image.setTemplateImage(true);
  const tray = new Electron.Tray(image);
  tray.setToolTip("GLUI — Glue UI");
  tray.setContextMenu(Electron.Menu.buildFromTemplate([
    { label: "Open GLUI", click: showWorkspace },
    { type: "separator" },
    { label: "Quit GLUI", click: () => Electron.app.quit() },
  ]));
  tray.on("click", showWorkspace);
  return () => {
    if (accelerator) Electron.globalShortcut.unregister(accelerator);
    tray.destroy();
  };
}
