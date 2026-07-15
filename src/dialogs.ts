import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";

/// Native confirmation dialog (reliable inside the webview).
export const confirmDialog = (message: string, title = "Confirm") =>
  tauriConfirm(message, { title, kind: "warning" });
