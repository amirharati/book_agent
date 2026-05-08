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
  modelId?: string;
}

export interface CreateSessionRequest {
  cwd?: string;
  bookAgentConfigPath?: string;
  systemPrompt?: string;
  modelId?: string;
}

export interface ListModelsResult {
  models: string[];
}

export interface SendMessageRequest {
  sessionId: string;
  message: string;
  history?: ChatMessage[];
}

export interface AgentBackend {
  createSession(request?: CreateSessionRequest): Promise<CreateSessionResult>;
  listModels(): Promise<ListModelsResult>;
  sendMessage(request: SendMessageRequest): AsyncIterable<AgentStreamEvent>;
}

export function newSessionId(): string {
  return randomUUID();
}
