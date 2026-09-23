import * as NodeOS from "node:os";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Synchronous pre-runtime isolation must precede Effect configuration.
import * as NodePath from "node:path";

// Never inherit the host T3 app's state directory. GLUI owns a separate database,
// auth bootstrap, caches, and Electron profile, including in development.
process.env.T3CODE_HOME = NodePath.resolve(
  process.env.GLUI_HOME?.trim() || NodePath.join(NodeOS.homedir(), ".glui"),
);
process.env.T3CODE_COMMIT_HASH = "5ccb2a5268f68a018b172f1eb672cdb74499a5dd";
