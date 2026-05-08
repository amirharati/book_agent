import { randomUUID } from "node:crypto";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AgentStreamEvent =
  | { type: "chunk"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export interface CreateSessionResult {
  sessionId: string;
}

export interface CreateSessionRequest {
  cwd?: string;
  bookAgentConfigPath?: string;
  systemPrompt?: string;
}

export interface SendMessageRequest {
  sessionId: string;
  message: string;
  history?: ChatMessage[];
}

export interface AgentBackend {
  createSession(request?: CreateSessionRequest): Promise<CreateSessionResult>;
  sendMessage(request: SendMessageRequest): AsyncIterable<AgentStreamEvent>;
}

export function newSessionId(): string {
  return randomUUID();
}
