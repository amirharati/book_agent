import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const GLOBAL_STATE_SCHEMA_VERSION = 1;
const ROOT_STATE_SCHEMA_VERSION = 1;
const WORKSPACE_SESSION_SCHEMA_VERSION = 1;

export const GLOBAL_STATE_FILE = path.join(os.homedir(), ".book-agent", "global.json");
export const ROOT_STATE_FILE = ".book_agent_web.json";
export const WORKSPACE_SESSION_FILE = "project.session.json";
export const CONVERSATIONS_DIR = "conversations";

export interface GlobalState {
  schemaVersion: number;
  ui: {
    theme?: string;
    density?: string;
  };
  chat: {
    defaultModel?: string;
  };
  recentRoots: string[];
  lastRoot: string | null;
  updatedAt: string;
}

export interface RootState {
  schemaVersion: number;
  lastWorkspaceId: string | null;
  workspaceOrder: string[];
  pinnedWorkspaces: string[];
  rootUiOverrides: Record<string, unknown>;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  archived: boolean;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatContextSnapshot {
  workspaceId: string | null;
  documentId: string | null;
  modelId: string | null;
  sessionShortId: string | null;
}

export interface WorkspaceSessionState {
  schemaVersion: number;
  activeDocumentId: string | null;
  openTabs: Array<{
    id: string;
    docId: string | null;
    name: string;
    path: string;
    isExternal: boolean;
  }>;
  activeTabId: string | null;
  layout: {
    chatPanelWidth: number | null;
    expandedDirs: string[];
    hideImages: boolean;
    hideHidden: boolean;
  };
  reader: {
    viewMode: "markdown" | "pdf";
  };
  chat: {
    conversations: ConversationSummary[];
    activeConversationId: string | null;
    context: ChatContextSnapshot;
  };
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()));
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getMessagePreview(content: string, limit = 160): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}

function normalizeMessage(value: unknown): ConversationMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const role = asString(row.role);
  const content = asString(row.content);
  const createdAt = asString(row.createdAt) ?? nowIso();
  if (!id || !role || !content) {
    return null;
  }
  if (role !== "user" && role !== "assistant" && role !== "system") {
    return null;
  }
  return { id, role, content, createdAt };
}

function normalizeConversationSummary(value: unknown): ConversationSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const title = asString(row.title) ?? "Untitled chat";
  const createdAt = asString(row.createdAt) ?? nowIso();
  const updatedAt = asString(row.updatedAt) ?? createdAt;
  if (!id) {
    return null;
  }
  const messages = Array.isArray(row.messages)
    ? row.messages.map((entry) => normalizeMessage(entry)).filter((entry): entry is ConversationMessage => Boolean(entry))
    : [];
  const lastMessage = messages.at(-1) ?? null;
  const messageCountFromField = asNumber(row.messageCount);
  const messageCount = messageCountFromField !== null ? Math.max(0, Math.floor(messageCountFromField)) : messages.length;
  const lastMessageAt = asString(row.lastMessageAt) ?? lastMessage?.createdAt ?? null;
  const lastMessagePreview = asString(row.lastMessagePreview) ?? (lastMessage ? getMessagePreview(lastMessage.content) : null);
  return {
    id,
    title,
    archived: asBoolean(row.archived, false),
    messageCount,
    lastMessageAt,
    lastMessagePreview,
    createdAt,
    updatedAt,
  };
}

async function readJsonSafe<T>(filePath: string, fallback: T, parser: (input: unknown) => T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parser(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(`[persistence] unable to read ${filePath}, using defaults`);
    }
    return fallback;
  }
}

async function atomicWriteJson(filePath: string, payload: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export function defaultGlobalState(): GlobalState {
  return {
    schemaVersion: GLOBAL_STATE_SCHEMA_VERSION,
    ui: {},
    chat: {
      defaultModel: "default",
    },
    recentRoots: [],
    lastRoot: null,
    updatedAt: nowIso(),
  };
}

export function defaultRootState(): RootState {
  return {
    schemaVersion: ROOT_STATE_SCHEMA_VERSION,
    lastWorkspaceId: null,
    workspaceOrder: [],
    pinnedWorkspaces: [],
    rootUiOverrides: {},
    updatedAt: nowIso(),
  };
}

export function defaultWorkspaceSessionState(): WorkspaceSessionState {
  return {
    schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
    activeDocumentId: null,
    openTabs: [],
    activeTabId: null,
    layout: {
      chatPanelWidth: null,
      expandedDirs: [],
      hideImages: true,
      hideHidden: true,
    },
    reader: {
      viewMode: "markdown",
    },
    chat: {
      conversations: [],
      activeConversationId: null,
      context: {
        workspaceId: null,
        documentId: null,
        modelId: null,
        sessionShortId: null,
      },
    },
    updatedAt: nowIso(),
  };
}

function getConversationFilePath(workspaceDir: string, conversationId: string): string {
  const safeId = conversationId.replace(/[^a-zA-Z0-9._-]/g, "");
  const normalized = safeId || "conversation";
  return path.join(workspaceDir, CONVERSATIONS_DIR, `${normalized}.jsonl`);
}

function parseGlobalState(input: unknown): GlobalState {
  const state = defaultGlobalState();
  if (!input || typeof input !== "object") {
    return state;
  }
  const row = input as Record<string, unknown>;
  return {
    schemaVersion: GLOBAL_STATE_SCHEMA_VERSION,
    ui: {
      theme: asString((row.ui as Record<string, unknown> | undefined)?.theme) ?? undefined,
      density: asString((row.ui as Record<string, unknown> | undefined)?.density) ?? undefined,
    },
    chat: {
      defaultModel: asString((row.chat as Record<string, unknown> | undefined)?.defaultModel) ?? "default",
    },
    recentRoots: asStringArray(row.recentRoots),
    lastRoot: asString(row.lastRoot),
    updatedAt: nowIso(),
  };
}

function parseRootState(input: unknown): RootState {
  const state = defaultRootState();
  if (!input || typeof input !== "object") {
    return state;
  }
  const row = input as Record<string, unknown>;
  return {
    schemaVersion: ROOT_STATE_SCHEMA_VERSION,
    lastWorkspaceId: asString(row.lastWorkspaceId),
    workspaceOrder: asStringArray(row.workspaceOrder),
    pinnedWorkspaces: asStringArray(row.pinnedWorkspaces),
    rootUiOverrides: typeof row.rootUiOverrides === "object" && row.rootUiOverrides !== null
      ? row.rootUiOverrides as Record<string, unknown>
      : {},
    updatedAt: nowIso(),
  };
}

function parseWorkspaceSessionState(input: unknown): WorkspaceSessionState {
  const state = defaultWorkspaceSessionState();
  if (!input || typeof input !== "object") {
    return state;
  }
  const row = input as Record<string, unknown>;
  const openTabs = Array.isArray(row.openTabs)
    ? row.openTabs
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const tab = entry as Record<string, unknown>;
          const id = asString(tab.id);
          const name = asString(tab.name);
          const tabPath = asString(tab.path);
          if (!id || !name || !tabPath) {
            return null;
          }
          return {
            id,
            docId: asString(tab.docId),
            name,
            path: tabPath,
            isExternal: asBoolean(tab.isExternal, false),
          };
        })
        .filter((entry): entry is WorkspaceSessionState["openTabs"][number] => Boolean(entry))
    : [];
  const conversations = Array.isArray((row.chat as Record<string, unknown> | undefined)?.conversations)
    ? ((row.chat as Record<string, unknown>).conversations as unknown[])
        .map((entry) => normalizeConversationSummary(entry))
        .filter((entry): entry is ConversationSummary => Boolean(entry))
    : [];
  const activeConversationId = asString((row.chat as Record<string, unknown> | undefined)?.activeConversationId);
  const activeExists = activeConversationId ? conversations.some((entry) => entry.id === activeConversationId) : false;
  return {
    schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
    activeDocumentId: asString(row.activeDocumentId),
    openTabs,
    activeTabId: asString(row.activeTabId),
    layout: {
      chatPanelWidth: asNumber((row.layout as Record<string, unknown> | undefined)?.chatPanelWidth),
      expandedDirs: asStringArray((row.layout as Record<string, unknown> | undefined)?.expandedDirs),
      hideImages: asBoolean((row.layout as Record<string, unknown> | undefined)?.hideImages, true),
      hideHidden: asBoolean((row.layout as Record<string, unknown> | undefined)?.hideHidden, true),
    },
    reader: {
      viewMode: asString((row.reader as Record<string, unknown> | undefined)?.viewMode) === "pdf" ? "pdf" : "markdown",
    },
    chat: {
      conversations,
      activeConversationId: activeExists ? activeConversationId : null,
      context: {
        workspaceId: asString((row.chat as Record<string, unknown> | undefined)?.context && ((row.chat as Record<string, unknown>).context as Record<string, unknown>).workspaceId),
        documentId: asString((row.chat as Record<string, unknown> | undefined)?.context && ((row.chat as Record<string, unknown>).context as Record<string, unknown>).documentId),
        modelId: asString((row.chat as Record<string, unknown> | undefined)?.context && ((row.chat as Record<string, unknown>).context as Record<string, unknown>).modelId),
        sessionShortId: asString((row.chat as Record<string, unknown> | undefined)?.context && ((row.chat as Record<string, unknown>).context as Record<string, unknown>).sessionShortId),
      },
    },
    updatedAt: nowIso(),
  };
}

export async function readGlobalState(): Promise<GlobalState> {
  return readJsonSafe(GLOBAL_STATE_FILE, defaultGlobalState(), parseGlobalState);
}

export async function writeGlobalState(state: GlobalState): Promise<void> {
  await atomicWriteJson(GLOBAL_STATE_FILE, { ...state, schemaVersion: GLOBAL_STATE_SCHEMA_VERSION, updatedAt: nowIso() });
}

export async function readRootState(workspaceRoot: string): Promise<RootState> {
  return readJsonSafe(path.join(workspaceRoot, ROOT_STATE_FILE), defaultRootState(), parseRootState);
}

export async function writeRootState(workspaceRoot: string, state: RootState): Promise<void> {
  await atomicWriteJson(path.join(workspaceRoot, ROOT_STATE_FILE), {
    ...state,
    schemaVersion: ROOT_STATE_SCHEMA_VERSION,
    updatedAt: nowIso(),
  });
}

export async function readWorkspaceSessionState(workspaceDir: string): Promise<WorkspaceSessionState> {
  return readJsonSafe(path.join(workspaceDir, WORKSPACE_SESSION_FILE), defaultWorkspaceSessionState(), parseWorkspaceSessionState);
}

export async function writeWorkspaceSessionState(workspaceDir: string, state: WorkspaceSessionState): Promise<void> {
  await atomicWriteJson(path.join(workspaceDir, WORKSPACE_SESSION_FILE), {
    ...state,
    schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
    updatedAt: nowIso(),
  });
}

export function createConversationSummary(title?: string): ConversationSummary {
  const now = nowIso();
  return {
    id: `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: title?.trim() || "New chat",
    archived: false,
    messageCount: 0,
    lastMessageAt: null,
    lastMessagePreview: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureConversationFile(workspaceDir: string, conversationId: string): Promise<string> {
  const filePath = getConversationFilePath(workspaceDir, conversationId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, "", "utf8");
  return filePath;
}

export async function readConversationMessages(workspaceDir: string, conversationId: string): Promise<ConversationMessage[]> {
  const filePath = getConversationFilePath(workspaceDir, conversationId);
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const messages: ConversationMessage[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      const message = normalizeMessage(parsed);
      if (message) {
        messages.push(message);
      }
    } catch {
      // Graceful parsing: ignore bad lines.
    }
  }
  return messages;
}

export async function replaceConversationMessages(
  workspaceDir: string,
  conversationId: string,
  messages: ConversationMessage[],
): Promise<void> {
  const filePath = await ensureConversationFile(workspaceDir, conversationId);
  const lines = messages.map((message) => JSON.stringify(message)).join("\n");
  await fs.writeFile(filePath, lines ? `${lines}\n` : "", "utf8");
}

export async function appendConversationMessages(
  workspaceDir: string,
  conversationId: string,
  messages: Array<Pick<ConversationMessage, "role" | "content">>,
): Promise<ConversationMessage[]> {
  const filePath = await ensureConversationFile(workspaceDir, conversationId);
  const created: ConversationMessage[] = [];
  for (const message of messages) {
    const nextMessage: ConversationMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      role: message.role,
      content: message.content,
      createdAt: nowIso(),
    };
    created.push(nextMessage);
  }
  if (created.length > 0) {
    const chunk = created.map((entry) => JSON.stringify(entry)).join("\n");
    await fs.appendFile(filePath, `${chunk}\n`, "utf8");
  }
  return created;
}

export function applyMessagesToConversationSummary(
  conversation: ConversationSummary,
  messages: ConversationMessage[],
): ConversationSummary {
  if (messages.length === 0) {
    return conversation;
  }
  const lastMessage = messages.at(-1) ?? null;
  return {
    ...conversation,
    messageCount: conversation.messageCount + messages.length,
    lastMessageAt: lastMessage?.createdAt ?? conversation.lastMessageAt,
    lastMessagePreview: lastMessage ? getMessagePreview(lastMessage.content) : conversation.lastMessagePreview,
    updatedAt: nowIso(),
  };
}

export async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await atomicWriteJson(filePath, payload);
}
