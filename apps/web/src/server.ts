import { createApp } from "./app.js";
import { CursorSdkBackend } from "./backends/cursor-sdk-backend.js";
import { EchoBackend } from "./backends/echo-backend.js";

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
