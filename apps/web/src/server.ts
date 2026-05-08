import { createApp } from "./app.js";
import { CursorSdkBackend } from "./backends/cursor-sdk-backend.js";
import { EchoBackend } from "./backends/echo-backend.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

function loadEnvironment() {
  const explicitPath = process.env.BOOK_AGENT_ENV_PATH?.trim();
  const candidates = [
    explicitPath,
    path.resolve(process.cwd(), ".env"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const result = dotenv.config({ path: candidate, override: false });
    if (!result.error) {
      return;
    }
  }
}

loadEnvironment();

function resolveBackend() {
  const backendName = process.env.AGENT_BACKEND ?? "echo";
  const cwd = process.env.WORKSPACE_ROOT ?? process.cwd();
  if (backendName === "cursor-sdk") {
    const bookAgentConfigPath =
      process.env.BOOK_AGENT_CONFIG ?? `${cwd.replace(/\/+$/, "")}/.book_agent.json`;
    return {
      backendName,
      workspaceRoot: cwd,
      backend: new CursorSdkBackend({
        cwd,
        bookAgentConfigPath,
        cursorApiKey: process.env.CURSOR_API_KEY,
        cursorModelId: process.env.CURSOR_MODEL_ID,
      }),
    };
  }

  return {
    backendName,
    workspaceRoot: cwd,
    backend: new EchoBackend(),
  };
}

const { backend, backendName, workspaceRoot } = resolveBackend();
const app = createApp({ backend, backendName, workspaceRoot });
const port = Number.parseInt(process.env.PORT ?? "8787", 10);

app.listen(port, () => {
  console.log(
    `web backend listening on http://localhost:${port} (backend=${backendName}, workspace=${workspaceRoot})`,
  );
});
