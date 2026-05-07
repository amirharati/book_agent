import {
  AgentBackend,
  AgentStreamEvent,
  CreateSessionResult,
  SendMessageRequest,
  newSessionId,
} from "../agent-backend.js";
import type { McpServerConfig, SDKAgent, SDKMessage, SendOptions } from "@cursor/sdk";

interface CursorSdkBackendOptions {
  cwd: string;
  bookAgentConfigPath: string;
  cursorApiKey?: string;
  cursorModelId?: string;
}

export class CursorSdkBackend implements AgentBackend {
  private readonly sessions = new Map<string, SDKAgent>();

  constructor(private readonly options: CursorSdkBackendOptions) {}

  async createSession(): Promise<CreateSessionResult> {
    const agent = await this.createCursorAgent();
    const sessionId = newSessionId();
    this.sessions.set(sessionId, agent);
    return { sessionId };
  }

  async *sendMessage(request: SendMessageRequest): AsyncIterable<AgentStreamEvent> {
    const agent = this.sessions.get(request.sessionId);
    if (!agent) {
      yield { type: "error", message: `Unknown session: ${request.sessionId}` };
      return;
    }

    const fullPrompt = this.buildPrompt(request);
    const sendOptions: SendOptions = {
      mcpServers: this.getMcpServerConfig(),
    };
    const run = await agent.send(fullPrompt, sendOptions);

    for await (const message of run.stream()) {
      const delta = this.extractDelta(message);
      if (delta) {
        yield { type: "chunk", delta };
      }
    }
    yield { type: "done" };
  }

  private async createCursorAgent(): Promise<SDKAgent> {
    const apiKey = this.options.cursorApiKey ?? process.env.CURSOR_API_KEY;
    const modelId = this.options.cursorModelId ?? process.env.CURSOR_MODEL_ID ?? "auto";
    if (!apiKey) {
      throw new Error("CURSOR_API_KEY is required for CursorSdkBackend.");
    }

    process.env.CURSOR_API_KEY = apiKey;

    let sdkModule: typeof import("@cursor/sdk");
    try {
      sdkModule = await import("@cursor/sdk");
    } catch (error) {
      throw new Error(
        "Missing @cursor/sdk. Install it in apps/web before using AGENT_BACKEND=cursor-sdk.",
        { cause: error },
      );
    }

    if (!sdkModule.Agent) {
      throw new Error("Loaded @cursor/sdk but Agent.create is unavailable.");
    }

    try {
      return await sdkModule.Agent.create({
        apiKey,
        model: { id: modelId },
        local: { cwd: this.options.cwd },
        mcpServers: this.getMcpServerConfig(),
      });
    } catch (error) {
      throw new Error(
        `Cursor Agent.create failed (model=${modelId}): ${this.formatSdkError(error)}`,
        { cause: error },
      );
    }
  }

  private getMcpServerConfig(): Record<string, McpServerConfig> {
    return {
      "book-agent": {
        command: "python",
        args: ["-m", "book_agent.mcp_server"],
        cwd: this.options.cwd,
        env: {
          BOOK_AGENT_CONFIG: this.options.bookAgentConfigPath,
        },
      },
    };
  }

  private buildPrompt(request: SendMessageRequest): string {
    const history = request.history ?? [];
    if (history.length === 0) {
      return request.message;
    }

    const historyLines = history.map((message) => `${message.role.toUpperCase()}: ${message.content}`);
    historyLines.push(`USER: ${request.message}`);
    historyLines.push("ASSISTANT:");
    return historyLines.join("\n");
  }

  private extractDelta(message: SDKMessage): string {
    if (message.type !== "assistant") {
      return "";
    }

    return message.message.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  private formatSdkError(error: unknown): string {
    if (!(typeof error === "object" && error !== null)) {
      return String(error);
    }

    const parts: string[] = [];
    const maybeMessage = (error as { message?: unknown }).message;
    const message = typeof maybeMessage === "string" ? maybeMessage.trim() : "";
    if (message) {
      parts.push(message);
    }

    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === "string" && maybeCode.trim()) {
      parts.push(`code=${maybeCode}`);
    }

    const maybeStatus = (error as { status?: unknown }).status;
    if (typeof maybeStatus === "number") {
      parts.push(`status=${maybeStatus}`);
    }

    const maybeRequestId = (error as { requestId?: unknown }).requestId;
    if (typeof maybeRequestId === "string" && maybeRequestId.trim()) {
      parts.push(`requestId=${maybeRequestId}`);
    }

    const maybeRetryable = (error as { isRetryable?: unknown }).isRetryable;
    if (typeof maybeRetryable === "boolean") {
      parts.push(`retryable=${maybeRetryable}`);
    }

    const maybeCause = (error as { cause?: unknown }).cause;
    if (maybeCause instanceof Error && maybeCause.message.trim()) {
      parts.push(`cause=${maybeCause.message.trim()}`);
    }

    if (parts.length > 0) {
      return parts.join(", ");
    }
    return "unknown SDK error";
  }
}
