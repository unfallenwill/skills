import { readFileSync } from "node:fs";

export const SERVER_NAME = "handoff-acp";

/** Read from the plugin manifest so the two versions never drift apart. */
function readPluginVersion() {
  try {
    const manifest = JSON.parse(readFileSync(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"));
    return typeof manifest.version === "string" ? manifest.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const SERVER_VERSION = readPluginVersion();
