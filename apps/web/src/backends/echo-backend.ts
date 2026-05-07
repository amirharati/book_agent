import {
  AgentBackend,
  AgentStreamEvent,
  CreateSessionResult,
  SendMessageRequest,
  newSessionId,
} from "../agent-backend.js";

export class EchoBackend implements AgentBackend {
  private readonly sessions = new Set<string>();

  async createSession(): Promise<CreateSessionResult> {
    const sessionId = newSessionId();
    this.sessions.add(sessionId);
    return { sessionId };
  }

  async *sendMessage(request: SendMessageRequest): AsyncIterable<AgentStreamEvent> {
    if (!this.sessions.has(request.sessionId)) {
      yield { type: "error", message: `Unknown session: ${request.sessionId}` };
      return;
    }

    const text = `Echo: ${request.message}`.trim();
    const chunks = text.split(/\s+/).map((word) => `${word} `);
    for (const chunk of chunks) {
      yield { type: "chunk", delta: chunk };
    }

    yield { type: "done" };
  }
}
