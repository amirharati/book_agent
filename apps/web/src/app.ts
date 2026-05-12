import express from "express";
import { unzipSync } from "fflate";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { AgentBackend, AgentStreamEvent } from "./agent-backend.js";
import {
  appendConversationMessages,
  applyMessagesToConversationSummary,
  createConversationSummary,
  defaultWorkspaceSessionState,
  ensureConversationFile,
  readConversationMessages,
  readGlobalState,
  readRootState,
  readWorkspaceSessionState,
  writeGlobalState,
  writeJsonAtomic,
  writeRootState,
  writeWorkspaceSessionState,
} from "./persistence.js";
import type { ConversationMessage, RootState, WorkspaceSessionState } from "./persistence.js";

interface CreateAppInput {
  backend: AgentBackend;
  backendName: string;
  workspaceRoot?: string;
}

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "dist", "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache"]);
const SKIP_FILES_DEFAULT = new Set([".DS_Store", "Thumbs.db", ".gitignore", ".gitattributes"]);
const SKIP_EXTENSIONS_DEFAULT = new Set([".pyc", ".pyo", ".class", ".o", ".obj", ".exe", ".dll", ".so"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff"]);
const BOOK_AGENT_CONFIG_NAME = ".book_agent.json";
const BOOK_WORKSPACE_STATE_NAME = ".book_workspace.json";
const PROJECT_METADATA_NAME = "project.json";
const DEFAULT_MARKER_SERVER_URL = "http://127.0.0.1:8001";
const DEFAULT_MARKER_SUBMIT_OPTIONS: MarkerSubmitOptions = {
  output_format: "markdown",
  use_llm: true,
  llm_service: "marker.services.gemini.GoogleGeminiService",
  gemini_model_name: "gemini-3.1-flash-lite",
  paginate_output: true,
  lowres_image_dpi: 150,
  extract_images: true,
  disable_image_extraction: false,
  force_ocr: false,
  strip_existing_ocr: false,
  disable_ocr: false,
  html_tables_in_markdown: false,
  keep_pageheader_in_output: false,
  keep_pagefooter_in_output: false,
  add_block_ids: false,
  katex_compatible: true,
  normalize_equation_tags: true,
  redo_inline_math: false,
  debug: false,
};

interface BookAgentConfig {
  documents: Record<string, string>;
  output_root: string;
  current_workspace: string | null;
}

interface BookWorkspaceState {
  documents: string[];
  current_document: string | null;
  output_subdirs: Record<string, string>;
}

interface ProjectDocumentState {
  id: string;
  name: string;
  sourcePath: string;
  localSourcePath?: string;
  sourceDir: string;
  currentDir?: string;
  mdPath: string;
  pdfPath?: string;
  sourceKind?: "markdown" | "pdf";
  addedAt: string;
}

interface ProjectMetadata {
  project_id: string;
  project_name: string;
  created_at: string;
  documents: ProjectDocumentState[];
}

interface ConversionSettings {
  markerServerUrl: string;
  timeoutSec: number;
  pollIntervalMs: number;
}

interface ConversionJobState {
  id: string;
  workspaceId: string;
  documentId: string;
  provider: "marker_server";
  markerJobId: string | null;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  message: string;
  errorMessage: string | null;
  mode: "default" | "overwrite" | "test";
  preset: string;
  markerOptions: MarkerSubmitOptions;
  testPageRange: string | null;
  startRequestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  progress: number | null;
  task: string | null;
  taskProgress: number | null;
  pipelineIndex: number | null;
  pipelineTotal: number | null;
  elapsedSec: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversionJobCreateRequest {
  preset: string;
  mode: "default" | "overwrite" | "test";
  testPageRange: string | null;
  startNow: boolean;
  options?: Partial<MarkerSubmitOptions>;
}

interface MarkerSubmitOptions {
  output_format: "markdown";
  use_llm: boolean;
  llm_service: string;
  gemini_model_name: string;
  paginate_output: boolean;
  lowres_image_dpi: number;
  extract_images: boolean;
  disable_image_extraction: boolean;
  force_ocr: boolean;
  strip_existing_ocr: boolean;
  disable_ocr: boolean;
  html_tables_in_markdown: boolean;
  keep_pageheader_in_output: boolean;
  keep_pagefooter_in_output: boolean;
  add_block_ids: boolean;
  katex_compatible: boolean;
  normalize_equation_tags: boolean;
  redo_inline_math: boolean;
  debug: boolean;
}

interface SessionRuntimeContext {
  sessionId: string;
  sessionShortId: string;
  workspaceRoot: string;
  currentWorkspaceId: string | null;
  currentWorkspacePath: string | null;
  currentDocumentId: string | null;
  currentDocumentName: string | null;
  cwd: string;
  bookAgentConfigPath: string;
  resolvedOutputDir: string | null;
  modelId: string;
}

export function createApp({ backend, backendName, workspaceRoot = process.cwd() }: CreateAppInput) {
  const app = express();
  const staticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const policySourceRoot = process.env.BOOK_AGENT_POLICY_ROOT
    ? path.resolve(process.env.BOOK_AGENT_POLICY_ROOT)
    : resolvedWorkspaceRoot;
  const runtimeConfig = {
    inputRoot: path.join(resolvedWorkspaceRoot, "inputs"),
    outputRoot: path.join(resolvedWorkspaceRoot, "outputs"),
    workspaceRoot: resolvedWorkspaceRoot,
  };
  const sessionRuntimeContexts = new Map<string, SessionRuntimeContext>();

  app.use((req, res, next) => {
    const shouldLog = req.path === "/health" || req.path.startsWith("/api/");
    if (!shouldLog) {
      next();
      return;
    }

    const startedAt = Date.now();
    console.log(`[http] ${req.method} ${req.path} started`);
    res.on("finish", () => {
      const elapsedMs = Date.now() - startedAt;
      console.log(`[http] ${req.method} ${req.path} -> ${res.statusCode} (${elapsedMs}ms)`);
    });
    next();
  });

  app.use(express.static(staticDir));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, backend: backendName, workspaceRoot: resolvedWorkspaceRoot });
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      workspaceRoot: resolvedWorkspaceRoot,
      inputRoot: runtimeConfig.inputRoot,
      outputRoot: runtimeConfig.outputRoot,
    });
  });

  app.get("/api/settings/conversion", async (_req, res, next) => {
    try {
      const rootState = await readRootState(runtimeConfig.workspaceRoot);
      res.json(getConversionSettings(rootState));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/settings/conversion", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Partial<ConversionSettings>;
      const rootState = await readRootState(runtimeConfig.workspaceRoot);
      const current = getConversionSettings(rootState);
      const nextSettings: ConversionSettings = {
        markerServerUrl: typeof body.markerServerUrl === "string" && body.markerServerUrl.trim()
          ? body.markerServerUrl.trim()
          : current.markerServerUrl,
        timeoutSec: typeof body.timeoutSec === "number" && Number.isFinite(body.timeoutSec) && body.timeoutSec > 0
          ? Math.round(body.timeoutSec)
          : current.timeoutSec,
        pollIntervalMs: typeof body.pollIntervalMs === "number" && Number.isFinite(body.pollIntervalMs) && body.pollIntervalMs >= 500
          ? Math.round(body.pollIntervalMs)
          : current.pollIntervalMs,
      };
      rootState.rootUiOverrides = {
        ...rootState.rootUiOverrides,
        conversionSettings: nextSettings,
      };
      await writeRootState(runtimeConfig.workspaceRoot, rootState);
      res.json(nextSettings);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state/bootstrap", async (_req, res, next) => {
    try {
      const [globalState, rootState, config] = await Promise.all([
        readGlobalState(),
        readRootState(runtimeConfig.workspaceRoot),
        readBookAgentConfig(runtimeConfig.workspaceRoot),
      ]);
      const conversionSettings = getConversionSettings(rootState);
      const preferredWorkspaceId = config.current_workspace ?? rootState.lastWorkspaceId;
      const workspacePayload = preferredWorkspaceId
        ? await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, preferredWorkspaceId, config)
        : null;
      const workspaceId = workspacePayload?.id ?? null;
      const workspaceSession = workspacePayload
        ? await readWorkspaceSessionState(workspacePayload.path)
        : defaultWorkspaceSessionState();
      const activeConversation = workspacePayload && workspaceSession.chat.activeConversationId
        ? {
            conversation: workspaceSession.chat.conversations.find(
              (entry) => entry.id === workspaceSession.chat.activeConversationId,
            ) ?? null,
            messages: await readConversationMessages(
              workspacePayload.path,
              workspaceSession.chat.activeConversationId,
            ),
          }
        : null;
      const merged = {
        ui: {
          ...globalState.ui,
          ...(rootState.rootUiOverrides.ui && typeof rootState.rootUiOverrides.ui === "object"
            ? rootState.rootUiOverrides.ui as Record<string, unknown>
            : {}),
        },
        chat: {
          defaultModel: globalState.chat.defaultModel ?? "default",
        },
        workspaceId,
        conversion: conversionSettings,
      };
      res.json({
        workspaceRoot: runtimeConfig.workspaceRoot,
        files: {
          globalPath: path.join(os.homedir(), ".book-agent", "global.json"),
          rootPath: path.join(runtimeConfig.workspaceRoot, ".book_agent_web.json"),
          workspacePath: workspacePayload ? path.join(workspacePayload.path, "project.session.json") : null,
        },
        global: globalState,
        root: rootState,
        conversionSettings,
        workspaceSession,
        activeConversation,
        merged,
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/state/global", async (req, res, next) => {
    try {
      const patch = (req.body ?? {}) as {
        ui?: { theme?: unknown; density?: unknown };
        chat?: { defaultModel?: unknown };
        recentRoots?: unknown;
        lastRoot?: unknown;
      };
      const state = await readGlobalState();
      if (patch.ui && typeof patch.ui === "object") {
        if (typeof patch.ui.theme === "string" || patch.ui.theme === null) {
          state.ui.theme = patch.ui.theme ?? undefined;
        }
        if (typeof patch.ui.density === "string" || patch.ui.density === null) {
          state.ui.density = patch.ui.density ?? undefined;
        }
      }
      if (patch.chat && typeof patch.chat === "object") {
        if (typeof patch.chat.defaultModel === "string" && patch.chat.defaultModel.trim()) {
          state.chat.defaultModel = patch.chat.defaultModel.trim();
        }
      }
      if (Array.isArray(patch.recentRoots)) {
        state.recentRoots = patch.recentRoots.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
      }
      if (typeof patch.lastRoot === "string" || patch.lastRoot === null) {
        state.lastRoot = typeof patch.lastRoot === "string" && patch.lastRoot.trim() ? patch.lastRoot : null;
      }
      await writeGlobalState(state);
      res.json(state);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/state/root", async (req, res, next) => {
    try {
      const patch = (req.body ?? {}) as {
        lastWorkspaceId?: unknown;
        workspaceOrder?: unknown;
        pinnedWorkspaces?: unknown;
        rootUiOverrides?: unknown;
      };
      const state = await readRootState(runtimeConfig.workspaceRoot);
      if (typeof patch.lastWorkspaceId === "string" || patch.lastWorkspaceId === null) {
        state.lastWorkspaceId = typeof patch.lastWorkspaceId === "string" && patch.lastWorkspaceId.trim()
          ? patch.lastWorkspaceId
          : null;
      }
      if (Array.isArray(patch.workspaceOrder)) {
        state.workspaceOrder = patch.workspaceOrder.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
      }
      if (Array.isArray(patch.pinnedWorkspaces)) {
        state.pinnedWorkspaces = patch.pinnedWorkspaces.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
      }
      if (patch.rootUiOverrides && typeof patch.rootUiOverrides === "object") {
        state.rootUiOverrides = patch.rootUiOverrides as Record<string, unknown>;
      }
      await writeRootState(runtimeConfig.workspaceRoot, state);
      res.json(state);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/models", async (_req, res, next) => {
    try {
      const result = await backend.listModels();
      const models = Array.from(new Set(result.models.filter((model) => model.trim()))).sort((a, b) => a.localeCompare(b));
      if (!models.includes("default")) {
        models.unshift("default");
      }
      res.json({ models });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/config", async (req, res, next) => {
    try {
      const body = req.body as { inputRoot?: unknown; outputRoot?: unknown };
      if (typeof body.inputRoot !== "string" || typeof body.outputRoot !== "string") {
        res.status(400).json({ error: "inputRoot and outputRoot must be strings." });
        return;
      }

      const inputRoot = await resolveExistingDirectory(body.inputRoot, resolvedWorkspaceRoot);
      const outputRoot = await resolveExistingDirectory(body.outputRoot, resolvedWorkspaceRoot);
      runtimeConfig.inputRoot = inputRoot;
      runtimeConfig.outputRoot = outputRoot;
      res.json({
        workspaceRoot: resolvedWorkspaceRoot,
        inputRoot: runtimeConfig.inputRoot,
        outputRoot: runtimeConfig.outputRoot,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/root", (_req, res) => {
    res.json({ workspaceRoot: runtimeConfig.workspaceRoot });
  });

  app.post("/api/workspaces/root", async (req, res, next) => {
    try {
      const body = req.body as { workspaceRoot?: unknown };
      if (typeof body.workspaceRoot !== "string" || !body.workspaceRoot.trim()) {
        res.status(400).json({ error: "workspaceRoot must be a non-empty string." });
        return;
      }
      const nextRoot = path.resolve(body.workspaceRoot.trim());
      await fs.mkdir(nextRoot, { recursive: true });
      runtimeConfig.workspaceRoot = nextRoot;
      await ensureBookAgentConfig(runtimeConfig.workspaceRoot);
      const globalState = await readGlobalState();
      globalState.lastRoot = nextRoot;
      globalState.recentRoots = [nextRoot, ...globalState.recentRoots.filter((entry) => entry !== nextRoot)].slice(0, 12);
      await writeGlobalState(globalState);
      res.json({ workspaceRoot: runtimeConfig.workspaceRoot });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces", async (_req, res, next) => {
    try {
      await fs.mkdir(runtimeConfig.workspaceRoot, { recursive: true });
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const workspaces = await listCanonicalWorkspaces(runtimeConfig.workspaceRoot, config);
      res.json({
        workspaceRoot: runtimeConfig.workspaceRoot,
        currentWorkspace: config.current_workspace,
        workspaces,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions/:sessionId/context", async (req, res) => {
    const context = sessionRuntimeContexts.get(req.params.sessionId);
    if (!context) {
      res.status(404).json({ error: "Session not found." });
      return;
    }
    res.json({ context });
  });

  app.post("/api/sessions/:sessionId/title-suggestion", async (req, res, next) => {
    try {
      const sessionId = req.params.sessionId;
      const context = sessionRuntimeContexts.get(sessionId);
      if (!context) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      const body = (req.body ?? {}) as {
        messages?: Array<{ role?: unknown; content?: unknown }>;
      };
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        res.status(400).json({ error: "messages must be a non-empty array." });
        return;
      }
      const messages = body.messages
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          role: typeof entry.role === "string" ? entry.role : "",
          content: typeof entry.content === "string" ? entry.content.trim() : "",
        }))
        .filter((entry) => entry.content && (entry.role === "user" || entry.role === "assistant" || entry.role === "system"));
      if (messages.length === 0) {
        res.status(400).json({ error: "messages payload does not contain valid role/content entries." });
        return;
      }

      let suggestedTitle = "";
      try {
        const titleSession = await backend.createSession({
          cwd: context.cwd,
          bookAgentConfigPath: context.bookAgentConfigPath,
          modelId: context.modelId,
          systemPrompt: [
            "You generate concise conversation titles.",
            "Output only the title, no quotes, no punctuation suffix, no explanation.",
            "Title constraints: 3-8 words, clear and specific.",
          ].join(" "),
        });
        const titlePrompt = [
          "Generate a short title for this chat based on the messages below.",
          messages.map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`).join("\n"),
        ].join("\n\n");
        for await (const event of backend.sendMessage({
          sessionId: titleSession.sessionId,
          message: titlePrompt,
        })) {
          if (event.type === "chunk") {
            suggestedTitle += event.delta;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      } catch (error) {
        console.warn(`[title] AI title generation failed, using fallback: ${getErrorMessage(error)}`);
      }

      const fallbackUserMessage = messages.find((entry) => entry.role === "user")?.content ?? "";
      const normalizedFallback = fallbackUserMessage.replace(/\s+/g, " ").trim();
      const fallbackTitle = normalizedFallback
        ? (normalizedFallback.length > 56 ? `${normalizedFallback.slice(0, 55)}…` : normalizedFallback)
        : "New chat";

      const sanitized = sanitizeGeneratedTitle(suggestedTitle);
      res.json({ title: sanitized || fallbackTitle });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces", async (req, res, next) => {
    try {
      const body = req.body as { name?: unknown; workspaceId?: unknown };
      if (typeof body.name !== "string" || !body.name.trim()) {
        res.status(400).json({ error: "name is required." });
        return;
      }
      const rawId = typeof body.workspaceId === "string" && body.workspaceId.trim()
        ? body.workspaceId
        : body.name;
      const workspaceId = slugify(rawId);
      if (!workspaceId) {
        res.status(400).json({ error: "workspaceId/name produced an empty id." });
        return;
      }

      await ensureBookAgentConfig(runtimeConfig.workspaceRoot);
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const exists = await fs.stat(workspaceDir).catch(() => null);
      if (exists) {
        res.status(409).json({ error: `Workspace already exists: ${workspaceId}` });
        return;
      }
      await fs.mkdir(path.join(workspaceDir, "artifacts"), { recursive: true });
      await fs.mkdir(path.join(workspaceDir, "inputs"), { recursive: true });
      await fs.mkdir(path.join(workspaceDir, "documents"), { recursive: true });
      await fs.mkdir(path.join(workspaceDir, "jobs"), { recursive: true });

      const workspaceState: BookWorkspaceState = {
        documents: [],
        current_document: null,
        output_subdirs: {},
      };
      await writeBookWorkspaceState(workspaceDir, workspaceState);
      await writeProjectMetadata(workspaceDir, {
        project_id: workspaceId,
        project_name: body.name.trim(),
        created_at: new Date().toISOString(),
        documents: [],
      });

      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      config.current_workspace = workspaceId;
      config.output_root = ".";
      await writeBookAgentConfig(runtimeConfig.workspaceRoot, config);
      const rootState = await readRootState(runtimeConfig.workspaceRoot);
      rootState.lastWorkspaceId = workspaceId;
      rootState.workspaceOrder = [workspaceId, ...rootState.workspaceOrder.filter((entry) => entry !== workspaceId)];
      await writeRootState(runtimeConfig.workspaceRoot, rootState);
      res.status(201).json(await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const payload = await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config);
      if (!payload) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/workspaces/:workspaceId/session-state", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const workspace = await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const patch = (req.body ?? {}) as Partial<WorkspaceSessionState>;
      const state = await readWorkspaceSessionState(workspace.path);
      if (typeof patch.activeDocumentId === "string" || patch.activeDocumentId === null) {
        state.activeDocumentId = patch.activeDocumentId ?? null;
      }
      if (Array.isArray(patch.openTabs)) {
        state.openTabs = patch.openTabs
          .filter((tab): tab is WorkspaceSessionState["openTabs"][number] => {
            if (!tab || typeof tab !== "object") {
              return false;
            }
            return typeof tab.id === "string" && typeof tab.name === "string" && typeof tab.path === "string";
          })
          .map((tab) => ({
            id: tab.id,
            docId: typeof tab.docId === "string" ? tab.docId : null,
            name: tab.name,
            path: tab.path,
            isExternal: Boolean(tab.isExternal),
          }));
      }
      if (typeof patch.activeTabId === "string" || patch.activeTabId === null) {
        state.activeTabId = patch.activeTabId ?? null;
      }
      if (patch.layout && typeof patch.layout === "object") {
        if (typeof patch.layout.chatPanelWidth === "number" || patch.layout.chatPanelWidth === null) {
          state.layout.chatPanelWidth = patch.layout.chatPanelWidth ?? null;
        }
        if (Array.isArray(patch.layout.expandedDirs)) {
          state.layout.expandedDirs = patch.layout.expandedDirs.filter((entry): entry is string => typeof entry === "string");
        }
        if (typeof patch.layout.hideImages === "boolean") {
          state.layout.hideImages = patch.layout.hideImages;
        }
        if (typeof patch.layout.hideHidden === "boolean") {
          state.layout.hideHidden = patch.layout.hideHidden;
        }
      }
      if (patch.reader && typeof patch.reader === "object") {
        if (patch.reader.viewMode === "markdown" || patch.reader.viewMode === "pdf") {
          state.reader.viewMode = patch.reader.viewMode;
        }
      }
      if (patch.chat && typeof patch.chat === "object" && patch.chat.context && typeof patch.chat.context === "object") {
        const ctx = patch.chat.context;
        if (typeof ctx.workspaceId === "string" || ctx.workspaceId === null) {
          state.chat.context.workspaceId = ctx.workspaceId ?? null;
        }
        if (typeof ctx.documentId === "string" || ctx.documentId === null) {
          state.chat.context.documentId = ctx.documentId ?? null;
        }
        if (typeof ctx.modelId === "string" || ctx.modelId === null) {
          state.chat.context.modelId = ctx.modelId ?? null;
        }
        if (typeof ctx.sessionShortId === "string" || ctx.sessionShortId === null) {
          state.chat.context.sessionShortId = ctx.sessionShortId ?? null;
        }
      }
      await writeWorkspaceSessionState(workspace.path, state);
      res.json(state);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/conversations", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const workspace = await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const state = await readWorkspaceSessionState(workspace.path);
      const conversations = state.chat.conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        archived: conversation.archived,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messageCount,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview,
      }));
      res.json({
        workspaceId,
        activeConversationId: state.chat.activeConversationId,
        conversations,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/conversations/:conversationId", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const conversationId = req.params.conversationId;
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const workspace = await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const state = await readWorkspaceSessionState(workspace.path);
      const conversation = state.chat.conversations.find((entry) => entry.id === conversationId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }
      const messages = await readConversationMessages(workspace.path, conversationId);
      res.json({ conversation, messages, activeConversationId: state.chat.activeConversationId });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/conversations", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const workspace = await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const body = (req.body ?? {}) as { title?: unknown; setActive?: unknown };
      const state = await readWorkspaceSessionState(workspace.path);
      const conversation = createConversationSummary(typeof body.title === "string" ? body.title : undefined);
      await ensureConversationFile(workspace.path, conversation.id);
      state.chat.conversations.push(conversation);
      if (body.setActive !== false) {
        state.chat.activeConversationId = conversation.id;
      }
      await writeWorkspaceSessionState(workspace.path, state);
      res.status(201).json({
        conversation,
        activeConversationId: state.chat.activeConversationId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/workspaces/:workspaceId/conversations/:conversationId", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const conversationId = req.params.conversationId;
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const workspace = await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const body = (req.body ?? {}) as { title?: unknown; archived?: unknown; setActive?: unknown };
      const state = await readWorkspaceSessionState(workspace.path);
      const idx = state.chat.conversations.findIndex((entry) => entry.id === conversationId);
      if (idx < 0) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }
      const current = state.chat.conversations[idx];
      const updated = {
        ...current,
        title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : current.title,
        archived: typeof body.archived === "boolean" ? body.archived : current.archived,
        updatedAt: new Date().toISOString(),
      };
      state.chat.conversations[idx] = updated;
      if (typeof body.setActive === "boolean") {
        state.chat.activeConversationId = body.setActive ? conversationId : null;
      }
      await writeWorkspaceSessionState(workspace.path, state);
      res.json({
        conversation: updated,
        activeConversationId: state.chat.activeConversationId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/conversations/:conversationId/messages", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const conversationId = req.params.conversationId;
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const workspace = await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config);
      if (!workspace) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const body = (req.body ?? {}) as {
        messages?: Array<{ role?: unknown; content?: unknown }>;
        context?: Partial<{
          workspaceId: string | null;
          documentId: string | null;
          modelId: string | null;
          sessionShortId: string | null;
        }>;
      };
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        res.status(400).json({ error: "messages must be a non-empty array." });
        return;
      }
      const state = await readWorkspaceSessionState(workspace.path);
      const idx = state.chat.conversations.findIndex((entry) => entry.id === conversationId);
      if (idx < 0) {
        res.status(404).json({ error: "Conversation not found." });
        return;
      }
      const incoming: Array<Pick<ConversationMessage, "role" | "content">> = [];
      for (const message of body.messages) {
        const role = typeof message.role === "string" ? message.role : "";
        const content = typeof message.content === "string" ? message.content : "";
        if (!content.trim()) {
          continue;
        }
        if (role !== "user" && role !== "assistant" && role !== "system") {
          continue;
        }
        incoming.push({ role, content });
      }
      const writtenMessages = await appendConversationMessages(workspace.path, conversationId, incoming);
      let conversation = state.chat.conversations[idx];
      conversation = applyMessagesToConversationSummary(conversation, writtenMessages);
      state.chat.conversations[idx] = conversation;
      state.chat.activeConversationId = conversationId;
      if (body.context && typeof body.context === "object") {
        if (typeof body.context.workspaceId === "string" || body.context.workspaceId === null) {
          state.chat.context.workspaceId = body.context.workspaceId ?? null;
        }
        if (typeof body.context.documentId === "string" || body.context.documentId === null) {
          state.chat.context.documentId = body.context.documentId ?? null;
        }
        if (typeof body.context.modelId === "string" || body.context.modelId === null) {
          state.chat.context.modelId = body.context.modelId ?? null;
        }
        if (typeof body.context.sessionShortId === "string" || body.context.sessionShortId === null) {
          state.chat.context.sessionShortId = body.context.sessionShortId ?? null;
        }
      }
      await writeWorkspaceSessionState(workspace.path, state);
      res.status(201).json({
        conversation,
        appendedCount: writtenMessages.length,
        activeConversationId: state.chat.activeConversationId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/select", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const payload = await buildCanonicalWorkspaceResponse(
        runtimeConfig.workspaceRoot,
        workspaceId,
        await readBookAgentConfig(runtimeConfig.workspaceRoot),
      );
      if (!payload) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      config.current_workspace = workspaceId;
      config.output_root = ".";
      await writeBookAgentConfig(runtimeConfig.workspaceRoot, config);
      const rootState = await readRootState(runtimeConfig.workspaceRoot);
      rootState.lastWorkspaceId = workspaceId;
      rootState.workspaceOrder = [workspaceId, ...rootState.workspaceOrder.filter((entry) => entry !== workspaceId)];
      await writeRootState(runtimeConfig.workspaceRoot, rootState);
      const refreshed = await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config);
      res.json(refreshed);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/documents", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const body = req.body as { sourcePath?: unknown };
      if (typeof body.sourcePath !== "string" || !body.sourcePath.trim()) {
        res.status(400).json({ error: "sourcePath is required." });
        return;
      }
      const sourcePath = path.resolve(body.sourcePath);
      const sourceStat = await fs.stat(sourcePath).catch(() => null);
      if (!sourceStat || !sourceStat.isFile() || (!isMarkdownFile(sourcePath) && !isPdfFile(sourcePath))) {
        res.status(400).json({ error: "sourcePath must point to a markdown or pdf file." });
        return;
      }
      const sourceKind: "markdown" | "pdf" = isPdfFile(sourcePath) ? "pdf" : "markdown";
      const sourceDir = path.dirname(sourcePath);
      const documentIdBase = slugify(path.parse(sourcePath).name) || `doc-${Date.now().toString(36)}`;
      const documentId = await nextAvailableDocumentId(documentIdBase, runtimeConfig.workspaceRoot);
      const localSourceDir = path.join(workspaceDir, "inputs", documentId, "source");
      const localSourceMarkdownPath = path.join(localSourceDir, path.basename(sourcePath));
      const localCurrentDir = path.join(workspaceDir, "documents", documentId, "current");
      const localCurrentPrimaryPath = path.join(localCurrentDir, path.basename(sourcePath));

      await fs.mkdir(path.dirname(localSourceDir), { recursive: true });
      await fs.mkdir(path.dirname(localCurrentDir), { recursive: true });
      await fs.mkdir(localSourceDir, { recursive: true });
      await fs.mkdir(localCurrentDir, { recursive: true });
      await fs.copyFile(sourcePath, localSourceMarkdownPath);
      await fs.copyFile(sourcePath, localCurrentPrimaryPath);

      if (sourceKind === "markdown") {
        await copyMarkdownReferencedAssets(sourcePath, sourceDir, localSourceDir);
        await copyMarkdownReferencedAssets(sourcePath, sourceDir, localCurrentDir);
      }

      const localMdStat = await fs.stat(localCurrentPrimaryPath).catch(() => null);
      if (!localMdStat?.isFile()) {
        res.status(500).json({ error: "Failed to stage document into workspace-local inputs." });
        return;
      }

      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      config.documents[documentId] = localCurrentDir;
      config.current_workspace = workspaceId;
      config.output_root = ".";
      await writeBookAgentConfig(runtimeConfig.workspaceRoot, config);

      if (!state.documents.includes(documentId)) {
        state.documents.push(documentId);
      }
      if (!state.current_document) {
        state.current_document = documentId;
      }
      await writeBookWorkspaceState(workspaceDir, state);

      const metadata = (await readProjectMetadata(workspaceDir)) ?? {
        project_id: workspaceId,
        project_name: workspaceId,
        created_at: new Date().toISOString(),
        documents: [],
      };
      metadata.documents = metadata.documents.filter((doc) => doc.id !== documentId);
      metadata.documents.push({
        id: documentId,
        name: path.basename(sourcePath),
        sourcePath,
        localSourcePath: sourceKind === "markdown" ? localSourceMarkdownPath : undefined,
        sourceDir: localSourceDir,
        currentDir: localCurrentDir,
        mdPath: sourceKind === "markdown" ? localCurrentPrimaryPath : "",
        pdfPath: sourceKind === "pdf" ? localCurrentPrimaryPath : undefined,
        sourceKind,
        addedAt: new Date().toISOString(),
      });
      await writeProjectMetadata(workspaceDir, metadata);

      res.status(201).json(await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/current-document", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const body = req.body as { documentId?: unknown };
      if (typeof body.documentId !== "string" || !body.documentId.trim()) {
        res.status(400).json({ error: "documentId is required." });
        return;
      }
      if (!state.documents.includes(body.documentId)) {
        res.status(404).json({ error: "Document not found in workspace." });
        return;
      }
      state.current_document = body.documentId;
      await writeBookWorkspaceState(workspaceDir, state);

      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      config.current_workspace = workspaceId;
      config.output_root = ".";
      await writeBookAgentConfig(runtimeConfig.workspaceRoot, config);
      res.json(await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, workspaceId, config));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/current-document/content", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const currentDocumentId = state.current_document;
      if (!currentDocumentId) {
        res.status(404).json({ error: "No current document selected." });
        return;
      }
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const activeDir = config.documents[currentDocumentId];
      if (!activeDir) {
        res.status(404).json({ error: `Document path missing for ${currentDocumentId}` });
        return;
      }

      const metadata = await readProjectMetadata(workspaceDir);
      const metadataEntry = metadata?.documents.find((doc) => doc.id === currentDocumentId) ?? null;
      let mdPath = metadataEntry?.mdPath ?? "";
      if (!mdPath) {
        const fallback = await resolvePrimaryMarkdownPath(activeDir).catch(() => "");
        mdPath = fallback;
      }
      if (!mdPath) {
        res.status(409).json({ error: "Document does not have markdown content yet. Run conversion first." });
        return;
      }

      const content = await fs.readFile(mdPath, "utf8");
      res.json({
        document: {
          id: currentDocumentId,
          name: metadataEntry?.name ?? path.basename(mdPath),
          sourcePath: metadataEntry?.sourcePath ?? mdPath,
          sourceDir: metadataEntry?.sourceDir ?? activeDir,
          mdPath,
        },
        content,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/documents/:documentId/content", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const documentId = req.params.documentId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      if (!state.documents.includes(documentId)) {
        res.status(404).json({ error: "Document not found in workspace." });
        return;
      }
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const activeDir = config.documents[documentId];
      if (!activeDir) {
        res.status(404).json({ error: `Document path missing for ${documentId}` });
        return;
      }

      const metadata = await readProjectMetadata(workspaceDir);
      const metadataEntry = metadata?.documents.find((doc) => doc.id === documentId) ?? null;
      let mdPath = metadataEntry?.mdPath ?? "";
      if (!mdPath) {
        const fallback = await resolvePrimaryMarkdownPath(activeDir).catch(() => "");
        mdPath = fallback;
      }
      if (!mdPath) {
        res.status(409).json({ error: "Document does not have markdown content yet. Run conversion first." });
        return;
      }

      const content = await fs.readFile(mdPath, "utf8");
      res.json({
        document: {
          id: documentId,
          name: metadataEntry?.name ?? path.basename(mdPath),
          sourcePath: metadataEntry?.sourcePath ?? mdPath,
          sourceDir: metadataEntry?.sourceDir ?? activeDir,
          mdPath,
        },
        content,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/documents/:documentId", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const documentId = req.params.documentId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      if (!state.documents.includes(documentId)) {
        res.status(404).json({ error: "Document not found in workspace." });
        return;
      }
      const metadata = await readProjectMetadata(workspaceDir);
      const doc = metadata?.documents.find((entry) => entry.id === documentId) ?? null;
      if (!doc) {
        res.status(404).json({ error: "Document metadata not found." });
        return;
      }
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const activeDir = config.documents[documentId] ?? doc.currentDir ?? doc.sourceDir;
      res.json({
        id: doc.id,
        name: doc.name,
        sourcePath: doc.sourcePath,
        sourceDir: doc.sourceDir,
        currentDir: doc.currentDir ?? activeDir,
        mdPath: doc.mdPath || null,
        pdfPath: doc.pdfPath ?? null,
        sourceKind: doc.sourceKind ?? (doc.pdfPath ? "pdf" : "markdown"),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/jobs", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const jobs = await readWorkspaceJobs(workspaceDir);
      res.json({ jobs });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/documents/:documentId/conversions", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const documentId = req.params.documentId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      if (!state.documents.includes(documentId)) {
        res.status(404).json({ error: "Document not found in workspace." });
        return;
      }
      const metadata = await readProjectMetadata(workspaceDir);
      const document = metadata?.documents.find((entry) => entry.id === documentId) ?? null;
      if (!document) {
        res.status(404).json({ error: "Document metadata not found." });
        return;
      }
      const body = (req.body ?? {}) as Partial<ConversionJobCreateRequest>;
      const preset = typeof body.preset === "string" && body.preset.trim() ? body.preset.trim() : "default_native_pdf";
      const mode = body.mode === "overwrite" || body.mode === "test" ? body.mode : "default";
      const testPageRange = typeof body.testPageRange === "string" && body.testPageRange.trim()
        ? body.testPageRange.trim()
        : null;
      const startNow = body.startNow === true;
      const markerOptions = normalizeMarkerSubmitOptions(body.options);
      const sourcePdfPath = await resolveDocumentPdfPath(document);
      if (!sourcePdfPath) {
        res.status(400).json({ error: "This document has no PDF source to convert." });
        return;
      }
      if (document.mdPath && mode === "default") {
        res.status(409).json({ error: "Markdown already exists. Choose overwrite or test mode." });
        return;
      }

      const job: ConversionJobState = {
        id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        workspaceId,
        documentId,
        provider: "marker_server",
        markerJobId: null,
        status: "pending",
        message: "Queued for conversion",
        errorMessage: null,
        mode,
        preset,
        markerOptions,
        testPageRange,
        startRequestedAt: startNow ? new Date().toISOString() : null,
        startedAt: null,
        finishedAt: null,
        progress: null,
        task: null,
        taskProgress: null,
        pipelineIndex: null,
        pipelineTotal: null,
        elapsedSec: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeWorkspaceJob(workspaceDir, job);
      if (startNow) {
        const runningJob = await findRunningJob(workspaceDir);
        if (!runningJob) {
          const conversionSettings = getConversionSettings(await readRootState(runtimeConfig.workspaceRoot));
          void runMarkerConversionJob({
            workspaceDir,
            workspaceId,
            document,
            jobId: job.id,
            preset,
            sourcePdfPath,
            settings: conversionSettings,
            mode,
            markerOptions,
            testPageRange,
          }).catch((error) => {
            console.error(`[conversion] background run failed job=${job.id}: ${getErrorMessage(error)}`);
          });
        } else {
          await updateWorkspaceJob(workspaceDir, job.id, {
            message: `Waiting for active job ${runningJob.id}`,
          });
        }
      }

      const created = await readWorkspaceJob(workspaceDir, job.id);
      res.status(202).json({ job: created ?? job });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/jobs/:jobId/start", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const jobId = req.params.jobId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const job = await readWorkspaceJob(workspaceDir, jobId);
      if (!job) {
        res.status(404).json({ error: "Job not found." });
        return;
      }
      if (job.status !== "pending") {
        res.status(409).json({ error: "Only pending jobs can be started." });
        return;
      }
      const runningJob = await findRunningJob(workspaceDir);
      if (runningJob) {
        res.status(409).json({ error: `Another job is already running (${runningJob.id}).` });
        return;
      }
      const metadata = await readProjectMetadata(workspaceDir);
      const document = metadata?.documents.find((entry) => entry.id === job.documentId) ?? null;
      if (!document) {
        res.status(404).json({ error: "Document metadata not found for job." });
        return;
      }
      const sourcePdfPath = await resolveDocumentPdfPath(document);
      if (!sourcePdfPath) {
        res.status(400).json({ error: "This document has no PDF source to convert." });
        return;
      }
      const conversionSettings = getConversionSettings(await readRootState(runtimeConfig.workspaceRoot));
      await updateWorkspaceJob(workspaceDir, jobId, {
        startRequestedAt: new Date().toISOString(),
        message: "Starting conversion",
      });
      void runMarkerConversionJob({
        workspaceDir,
        workspaceId,
        document,
        jobId,
        preset: job.preset,
        sourcePdfPath,
        settings: conversionSettings,
        mode: job.mode,
        markerOptions: job.markerOptions,
        testPageRange: job.testPageRange,
      }).catch((error) => {
        console.error(`[conversion] start endpoint run failed job=${jobId}: ${getErrorMessage(error)}`);
      });
      const refreshed = await readWorkspaceJob(workspaceDir, jobId);
      res.json({ job: refreshed });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/jobs/:jobId/cancel", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const jobId = req.params.jobId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const job = await readWorkspaceJob(workspaceDir, jobId);
      if (!job) {
        res.status(404).json({ error: "Job not found." });
        return;
      }
      if (job.status === "done" || job.status === "failed" || job.status === "cancelled") {
        res.status(409).json({ error: "This job is already finished." });
        return;
      }
      const cancelled = await updateWorkspaceJob(workspaceDir, jobId, {
        status: "cancelled",
        message: "Cancelled by user",
        finishedAt: new Date().toISOString(),
      });
      res.json({ job: cancelled });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workspaces/:workspaceId/files", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }

      const hideImages = req.query.hideImages !== "false";
      const hideHidden = req.query.hideHidden !== "false";
      const customPatterns = typeof req.query.patterns === "string"
        ? req.query.patterns.split(",").map((p) => p.trim()).filter(Boolean)
        : [];

      const tree = await buildWorkspaceFileTree(workspaceDir, {
        hideImages,
        hideHidden,
        customPatterns,
      });

      res.json({
        workspaceId,
        workspacePath: workspaceDir,
        tree,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/workspaces/:workspaceId/copy", async (req, res, next) => {
    try {
      const workspaceId = req.params.workspaceId;
      const workspaceDir = path.join(runtimeConfig.workspaceRoot, workspaceId);
      const state = await readBookWorkspaceState(workspaceDir);
      if (!state) {
        res.status(404).json({ error: "Workspace not found." });
        return;
      }
      const body = req.body as { targetRoot?: unknown };
      if (typeof body.targetRoot !== "string" || !body.targetRoot.trim()) {
        res.status(400).json({ error: "targetRoot is required." });
        return;
      }
      const targetRoot = path.resolve(body.targetRoot.trim());
      await fs.mkdir(targetRoot, { recursive: true });
      let targetWorkspaceId = workspaceId;
      let targetWorkspaceDir = path.join(targetRoot, targetWorkspaceId);
      let counter = 1;
      while (await fs.stat(targetWorkspaceDir).then(() => true).catch(() => false)) {
        counter += 1;
        targetWorkspaceId = `${workspaceId}-copy-${counter}`;
        targetWorkspaceDir = path.join(targetRoot, targetWorkspaceId);
      }
      await fs.cp(workspaceDir, targetWorkspaceDir, { recursive: true });
      res.status(201).json({
        id: targetWorkspaceId,
        name: targetWorkspaceId,
        path: targetWorkspaceDir,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/files", async (req, res, next) => {
    try {
      const kindQuery = typeof req.query.kind === "string" ? req.query.kind : "all";
      const allowedKind = kindQuery === "md" || kindQuery === "pdf" || kindQuery === "all" ? kindQuery : "all";
      const files = await listBookFiles(runtimeConfig.inputRoot, allowedKind);
      res.json({
        workspaceRoot: resolvedWorkspaceRoot,
        inputRoot: runtimeConfig.inputRoot,
        outputRoot: runtimeConfig.outputRoot,
        files,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/files/content", async (req, res, next) => {
    try {
      const relativePath = getPathQuery(req);
      const absolutePath = resolveWorkspaceFile(runtimeConfig.inputRoot, relativePath);
      if (!isMarkdownFile(absolutePath)) {
        res.status(400).json({ error: "Only markdown files are supported by this endpoint." });
        return;
      }

      const content = await fs.readFile(absolutePath, "utf8");
      res.json({ path: relativePath, content });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/files/raw", async (req, res, next) => {
    try {
      const relativePath = getPathQuery(req);
      const absolutePath = resolveWorkspaceFile(runtimeConfig.inputRoot, relativePath);
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        res.status(400).json({ error: "Requested path is not a file." });
        return;
      }
      res.sendFile(absolutePath);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/fs/list", async (req, res, next) => {
    try {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? resolvedWorkspaceRoot;
      const requested = typeof req.query.path === "string" && req.query.path
        ? req.query.path
        : homeDir;
      const includeFiles = req.query.includeFiles === "documents";

      let directory = await findFirstExistingDirectory(requested, resolvedWorkspaceRoot, homeDir);

      const entries = await fs.readdir(directory, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          path: path.join(directory, entry.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const files = includeFiles
        ? entries
            .filter((entry) => entry.isFile() && (entry.name.toLowerCase().endsWith(".md") || entry.name.toLowerCase().endsWith(".pdf")))
            .map((entry) => ({
              name: entry.name,
              path: path.join(directory, entry.name),
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];

      const parentDir = path.dirname(directory);
      const parentPath = parentDir === directory ? null : parentDir;

      res.json({
        workspaceRoot: resolvedWorkspaceRoot,
        currentPath: directory,
        parentPath,
        directories,
        files,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/fs/mkdir", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { parent?: unknown; name?: unknown };
      if (typeof body.parent !== "string" || typeof body.name !== "string") {
        res.status(400).json({ error: "parent and name must be strings." });
        return;
      }

      const trimmedName = body.name.trim();
      if (!trimmedName || trimmedName.includes("/") || trimmedName.includes("\\") || trimmedName === "." || trimmedName === "..") {
        res.status(400).json({ error: "Invalid folder name." });
        return;
      }

      const parentDir = path.isAbsolute(body.parent) ? path.resolve(body.parent) : path.resolve(resolvedWorkspaceRoot, body.parent);
      const parentStat = await fs.stat(parentDir).catch(() => null);
      if (!parentStat || !parentStat.isDirectory()) {
        res.status(404).json({ error: `Parent directory does not exist: ${parentDir}` });
        return;
      }

      const newDir = path.join(parentDir, trimmedName);
      const policyOutputDir = await resolvePolicyOutputDir(runtimeConfig.workspaceRoot);
      if (policyOutputDir && !isWithinPath(policyOutputDir, newDir)) {
        console.warn(
          `[policy] mkdir path outside resolved_output_dir (warn): requested=${newDir} resolved_output_dir=${policyOutputDir}`,
        );
      }
      await fs.mkdir(newDir, { recursive: true });
      res.json({ path: newDir });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/fs/file", async (req, res, next) => {
    try {
      const requested = typeof req.query.path === "string" ? req.query.path : "";
      if (!requested) {
        res.status(400).json({ error: "Query parameter 'path' is required." });
        return;
      }

      const absolutePath = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(resolvedWorkspaceRoot, requested);
      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        res.status(404).json({ error: `File not found: ${absolutePath}` });
        return;
      }

      res.sendFile(absolutePath);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/fs/read", async (req, res, next) => {
    try {
      const requested = typeof req.query.path === "string" ? req.query.path : "";
      if (!requested) {
        res.status(400).json({ error: "Query parameter 'path' is required." });
        return;
      }

      const absolutePath = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(resolvedWorkspaceRoot, requested);
      const stat = await fs.stat(absolutePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        res.status(404).json({ error: `File not found: ${absolutePath}` });
        return;
      }

      const content = await fs.readFile(absolutePath, "utf-8");
      res.json({ path: absolutePath, content });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { cwd?: unknown; bookAgentConfigPath?: unknown; modelId?: unknown };
      const config = await readBookAgentConfig(runtimeConfig.workspaceRoot);
      const defaultBookAgentConfigPath = path.join(runtimeConfig.workspaceRoot, BOOK_AGENT_CONFIG_NAME);
      const requestedBookAgentConfigPath =
        typeof body.bookAgentConfigPath === "string" && body.bookAgentConfigPath.trim()
          ? path.resolve(body.bookAgentConfigPath)
          : defaultBookAgentConfigPath;
      const requestedCwd =
        typeof body.cwd === "string" && body.cwd.trim()
          ? path.resolve(body.cwd)
          : config.current_workspace
            ? path.join(runtimeConfig.workspaceRoot, config.current_workspace)
            : runtimeConfig.workspaceRoot;
      const requestedCwdStat = await fs.stat(requestedCwd).catch(() => null);
      const agentCwd = requestedCwdStat?.isDirectory() ? requestedCwd : runtimeConfig.workspaceRoot;
      const requestedModelId =
        typeof body.modelId === "string" && body.modelId.trim()
          ? body.modelId.trim()
          : undefined;
      const activeModelId = requestedModelId ?? process.env.CURSOR_MODEL_ID ?? "default";
      const policyPrompt = await buildRepoPolicyPrompt(policySourceRoot);
      const groundedBehaviorPrompt = [
        "Grounding behavior (high priority):",
        "- For questions about the active document/workspace, call get_config first and then use toc/search/read before answering.",
        "- If evidence is missing in the active document/workspace, do not fabricate. State insufficient evidence and suggest the next retrieval step.",
        "- For artifact creation without an explicit path, resolve _resolved_output_dir from get_config and write there by default.",
      ].join("\n");
      const currentWorkspacePayload = config.current_workspace
        ? await buildCanonicalWorkspaceResponse(runtimeConfig.workspaceRoot, config.current_workspace, config)
        : null;
      const currentDocument = currentWorkspacePayload?.currentDocument ?? null;
      const resolvedOutputDir = currentWorkspacePayload?.outputRoot ?? null;
      const runtimeContextPrompt = [
        "Runtime context:",
        `- workspace_root: ${runtimeConfig.workspaceRoot}`,
        `- current_workspace: ${config.current_workspace ?? "(none)"}`,
        `- current_document_id: ${currentDocument?.id ?? "(none)"}`,
        `- current_document_name: ${currentDocument?.name ?? "(none)"}`,
        `- resolved_output_dir: ${resolvedOutputDir ?? "(none)"}`,
        `- book_agent_config: ${requestedBookAgentConfigPath}`,
        `- cwd: ${agentCwd}`,
        `- model: ${activeModelId}`,
      ].join("\n");
      const systemPrompt = [policyPrompt, groundedBehaviorPrompt, runtimeContextPrompt].filter(Boolean).join("\n\n");

      console.log(`[session] creating session using backend=${backendName}`);
      const result = await backend.createSession({
        cwd: agentCwd,
        bookAgentConfigPath: requestedBookAgentConfigPath,
        systemPrompt,
        modelId: requestedModelId,
      });
      const runtimeContext: SessionRuntimeContext = {
        sessionId: result.sessionId,
        sessionShortId: result.sessionId.slice(0, 8),
        workspaceRoot: runtimeConfig.workspaceRoot,
        currentWorkspaceId: config.current_workspace,
        currentWorkspacePath: config.current_workspace ? path.join(runtimeConfig.workspaceRoot, config.current_workspace) : null,
        currentDocumentId: currentDocument?.id ?? null,
        currentDocumentName: currentDocument?.name ?? null,
        cwd: agentCwd,
        bookAgentConfigPath: requestedBookAgentConfigPath,
        resolvedOutputDir,
        modelId: result.modelId ?? activeModelId,
      };
      if (runtimeContext.currentWorkspacePath) {
        const workspaceSession = await readWorkspaceSessionState(runtimeContext.currentWorkspacePath);
        workspaceSession.chat.context = {
          workspaceId: runtimeContext.currentWorkspaceId,
          documentId: runtimeContext.currentDocumentId,
          modelId: runtimeContext.modelId,
          sessionShortId: runtimeContext.sessionShortId,
        };
        workspaceSession.activeDocumentId = runtimeContext.currentDocumentId;
        await writeWorkspaceSessionState(runtimeContext.currentWorkspacePath, workspaceSession);
      }
      sessionRuntimeContexts.set(result.sessionId, runtimeContext);
      console.log(
        `[session] created id=${result.sessionId} short=${runtimeContext.sessionShortId} workspace=${runtimeContext.currentWorkspaceId ?? "(none)"} doc=${runtimeContext.currentDocumentId ?? "(none)"} cwd=${runtimeContext.cwd} config=${runtimeContext.bookAgentConfigPath}`,
      );
      res.status(201).json({ ...result, runtimeContext });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:sessionId/messages/stream", async (req, res) => {
    const { sessionId } = req.params;
    const { message, history } = req.body as { message?: string; history?: unknown };

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message must be a non-empty string" });
      return;
    }

    if (history !== undefined && !Array.isArray(history)) {
      res.status(400).json({ error: "history must be an array when provided" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = (event: AgentStreamEvent) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      console.log(
        `[stream] session=${sessionId} started, promptLength=${message.length}, historyCount=${Array.isArray(history) ? history.length : 0}`,
      );
      const stream = backend.sendMessage({
        sessionId,
        message,
        history: Array.isArray(history) ? history : undefined,
      });

      let chunkCount = 0;
      for await (const event of stream) {
        if (event.type === "chunk") {
          chunkCount += 1;
        }
        send(event);
      }
      console.log(`[stream] session=${sessionId} completed with chunkCount=${chunkCount}`);
    } catch (error) {
      const message = getErrorMessage(error);
      console.error(`[stream] session=${sessionId} rawError=${describeError(error)}`);
      console.error(`[stream] session=${sessionId} failed: ${message}`);
      send({ type: "error", message });
    } finally {
      res.end();
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = getErrorMessage(error);
    console.error(`[http] request rawError=${describeError(error)}`);
    console.error(`[http] request failed: ${message}`);
    res.status(500).json({ error: message });
  });

  return app;
}

async function listBookFiles(workspaceRoot: string, kind: "md" | "pdf" | "all") {
  const files: Array<{ path: string; kind: "md" | "pdf" }> = [];
  
  const stat = await fs.stat(workspaceRoot).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    return files;
  }

  const queue = [workspaceRoot];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    if (!currentDir) {
      continue;
    }

    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(workspaceRoot, absolutePath);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          queue.push(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (isMarkdownFile(absolutePath) && (kind === "md" || kind === "all")) {
        files.push({ path: relativePath, kind: "md" });
      } else if (isPdfFile(absolutePath) && (kind === "pdf" || kind === "all")) {
        files.push({ path: relativePath, kind: "pdf" });
      }
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

function resolveWorkspaceFile(workspaceRoot: string, relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = path.resolve(workspaceRoot, normalized);

  if (!(absolutePath === workspaceRoot || absolutePath.startsWith(`${workspaceRoot}${path.sep}`))) {
    throw new Error("Requested path escapes workspace root.");
  }

  return absolutePath;
}

async function findFirstExistingDirectory(pathValue: string, workspaceRoot: string, fallback: string): Promise<string> {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return fallback;
  }

  let candidate = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(workspaceRoot, trimmed);

  while (candidate && candidate !== "/") {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat && stat.isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      break;
    }
    candidate = parent;
  }

  return fallback;
}

async function resolveExistingDirectory(pathValue: string, workspaceRoot: string): Promise<string> {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    throw new Error("Directory path cannot be empty.");
  }

  const candidate = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(workspaceRoot, trimmed);
  const stat = await fs.stat(candidate).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Directory does not exist: ${candidate}`);
  }
  return candidate;
}

function isWithinPath(rootPath: string, candidatePath: string): boolean {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function resolvePolicyOutputDir(workspaceRoot: string): Promise<string | null> {
  const config = await readBookAgentConfig(workspaceRoot);
  if (!config.current_workspace) {
    return null;
  }
  const payload = await buildCanonicalWorkspaceResponse(workspaceRoot, config.current_workspace, config);
  return payload?.outputRoot ?? null;
}

function getPathQuery(req: express.Request): string {
  const filePath = typeof req.query.path === "string" ? req.query.path : "";
  if (!filePath.trim()) {
    throw new Error("Query parameter 'path' is required.");
  }
  return filePath;
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith(".md") || filePath.endsWith(".markdown");
}

function isPdfFile(filePath: string): boolean {
  return filePath.endsWith(".pdf");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureBookAgentConfig(root: string): Promise<void> {
  const configPath = path.join(root, BOOK_AGENT_CONFIG_NAME);
  const exists = await fs.stat(configPath).catch(() => null);
  if (exists) {
    return;
  }
  const initial: BookAgentConfig = {
    documents: {},
    output_root: ".",
    current_workspace: null,
  };
  await writeJsonAtomic(configPath, initial);
}

async function readBookAgentConfig(root: string): Promise<BookAgentConfig> {
  await ensureBookAgentConfig(root);
  const configPath = path.join(root, BOOK_AGENT_CONFIG_NAME);
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<BookAgentConfig>;
    return {
      documents: typeof parsed.documents === "object" && parsed.documents !== null ? parsed.documents as Record<string, string> : {},
      output_root: typeof parsed.output_root === "string" && parsed.output_root.trim() ? parsed.output_root : ".",
      current_workspace: typeof parsed.current_workspace === "string" ? parsed.current_workspace : null,
    };
  } catch {
    console.warn(`[persistence] invalid ${BOOK_AGENT_CONFIG_NAME}; falling back to defaults`);
    return {
      documents: {},
      output_root: ".",
      current_workspace: null,
    };
  }
}

async function writeBookAgentConfig(root: string, config: BookAgentConfig): Promise<void> {
  const configPath = path.join(root, BOOK_AGENT_CONFIG_NAME);
  await writeJsonAtomic(configPath, config);
}

async function readBookWorkspaceState(workspaceDir: string): Promise<BookWorkspaceState | null> {
  const statePath = path.join(workspaceDir, BOOK_WORKSPACE_STATE_NAME);
  const raw = await fs.readFile(statePath, "utf8").catch(() => "");
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BookWorkspaceState>;
    return {
      documents: Array.isArray(parsed.documents) ? parsed.documents.filter((x): x is string => typeof x === "string") : [],
      current_document: typeof parsed.current_document === "string" ? parsed.current_document : null,
      output_subdirs: typeof parsed.output_subdirs === "object" && parsed.output_subdirs !== null
        ? parsed.output_subdirs as Record<string, string>
        : {},
    };
  } catch {
    console.warn(`[persistence] invalid ${BOOK_WORKSPACE_STATE_NAME} at ${workspaceDir}; skipping workspace`);
    return null;
  }
}

async function writeBookWorkspaceState(workspaceDir: string, state: BookWorkspaceState): Promise<void> {
  const statePath = path.join(workspaceDir, BOOK_WORKSPACE_STATE_NAME);
  await writeJsonAtomic(statePath, state);
}

async function readProjectMetadata(workspaceDir: string): Promise<ProjectMetadata | null> {
  const metadataPath = path.join(workspaceDir, PROJECT_METADATA_NAME);
  const raw = await fs.readFile(metadataPath, "utf8").catch(() => "");
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectMetadata>;
    return {
      project_id: typeof parsed.project_id === "string" ? parsed.project_id : path.basename(workspaceDir),
      project_name: typeof parsed.project_name === "string" ? parsed.project_name : path.basename(workspaceDir),
      created_at: typeof parsed.created_at === "string" ? parsed.created_at : new Date().toISOString(),
      documents: Array.isArray(parsed.documents)
        ? parsed.documents
            .filter((entry): entry is ProjectDocumentState =>
              typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string")
            .map((entry) => ({
              ...entry,
              localSourcePath: typeof entry.localSourcePath === "string" ? entry.localSourcePath : undefined,
              currentDir: typeof entry.currentDir === "string" ? entry.currentDir : undefined,
              pdfPath: typeof entry.pdfPath === "string" ? entry.pdfPath : undefined,
              sourceKind: entry.sourceKind === "pdf" ? "pdf" : "markdown",
            }))
        : [],
    };
  } catch {
    console.warn(`[persistence] invalid ${PROJECT_METADATA_NAME} at ${workspaceDir}; using fallback metadata`);
    return null;
  }
}

async function writeProjectMetadata(workspaceDir: string, metadata: ProjectMetadata): Promise<void> {
  const metadataPath = path.join(workspaceDir, PROJECT_METADATA_NAME);
  await writeJsonAtomic(metadataPath, metadata);
}

async function listCanonicalWorkspaces(root: string, config: BookAgentConfig) {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const rows: Array<{
    id: string;
    name: string;
    path: string;
    outputRoot: string;
    documentCount: number;
    currentDocumentId: string | null;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const workspaceId = entry.name;
    const payload = await buildCanonicalWorkspaceResponse(root, workspaceId, config);
    if (!payload) {
      continue;
    }
    rows.push({
      id: payload.id,
      name: payload.name,
      path: payload.path,
      outputRoot: payload.outputRoot,
      documentCount: payload.documents.length,
      currentDocumentId: payload.currentDocumentId,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

async function buildCanonicalWorkspaceResponse(root: string, workspaceId: string, config: BookAgentConfig) {
  const workspaceDir = path.join(root, workspaceId);
  const workspaceState = await readBookWorkspaceState(workspaceDir);
  if (!workspaceState) {
    return null;
  }
  const metadata = await readProjectMetadata(workspaceDir);
  const docs: Array<{
    id: string;
    name: string;
    sourcePath: string;
    sourceDir: string;
    mdPath: string;
    pdfPath?: string;
    sourceKind?: "markdown" | "pdf";
  }> = [];

  for (const docId of workspaceState.documents) {
    const activeDir = config.documents[docId] ?? "";
    const metadataDoc = metadata?.documents.find((doc) => doc.id === docId) ?? null;
    let mdPath = metadataDoc?.mdPath ?? "";
    if (!mdPath && activeDir) {
      mdPath = await resolvePrimaryMarkdownPath(activeDir).catch(() => "");
    }
    docs.push({
      id: docId,
      name: metadataDoc?.name ?? docId,
      sourcePath: metadataDoc?.sourcePath ?? mdPath,
      sourceDir: metadataDoc?.sourceDir ?? activeDir,
      mdPath,
      pdfPath: metadataDoc?.pdfPath,
      sourceKind: metadataDoc?.sourceKind ?? (metadataDoc?.pdfPath ? "pdf" : "markdown"),
    });
  }

  const currentDocument = docs.find((doc) => doc.id === workspaceState.current_document) ?? null;
  return {
    id: workspaceId,
    name: metadata?.project_name ?? workspaceId,
    path: workspaceDir,
    outputRoot: path.join(workspaceDir, "artifacts"),
    documents: docs,
    currentDocumentId: workspaceState.current_document,
    currentDocument,
    createdAt: metadata?.created_at ?? null,
  };
}

async function resolvePrimaryMarkdownPath(sourceDir: string): Promise<string> {
  const stat = await fs.stat(sourceDir).catch(() => null);
  if (!stat) {
    throw new Error(`Missing source path: ${sourceDir}`);
  }
  if (stat.isFile() && isMarkdownFile(sourceDir)) {
    return sourceDir;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Source path is not a markdown file/folder: ${sourceDir}`);
  }
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const markdownEntry = entries
    .filter((entry) => entry.isFile() && isMarkdownFile(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!markdownEntry) {
    throw new Error(`No markdown file found in ${sourceDir}`);
  }
  return path.join(sourceDir, markdownEntry.name);
}

async function nextAvailableDocumentId(baseId: string, root: string): Promise<string> {
  const config = await readBookAgentConfig(root);
  if (!config.documents[baseId]) {
    return baseId;
  }
  let counter = 2;
  while (config.documents[`${baseId}-${counter}`]) {
    counter += 1;
  }
  return `${baseId}-${counter}`;
}

async function buildRepoPolicyPrompt(policyRoot: string): Promise<string> {
  const rulePath = path.join(policyRoot, ".cursor", "rules", "book-agent.mdc");
  const ruleText = await fs.readFile(rulePath, "utf8").catch(() => "");

  const skillsRoot = path.join(policyRoot, ".cursor", "skills");
  const skillFiles = await collectSkillMarkdownFiles(skillsRoot);
  const skillSections: string[] = [];
  for (const skillFile of skillFiles) {
    const content = await fs.readFile(skillFile, "utf8").catch(() => "");
    if (!content.trim()) {
      continue;
    }
    const relative = path.relative(policyRoot, skillFile) || skillFile;
    skillSections.push(`### Skill (${relative})\n${content.trim()}`);
  }

  const parts: string[] = [];
  if (ruleText.trim()) {
    parts.push(`### Rule (.cursor/rules/book-agent.mdc)\n${ruleText.trim()}`);
  }
  if (skillSections.length > 0) {
    parts.push(skillSections.join("\n\n"));
  }

  if (parts.length === 0) {
    return "";
  }

  return [
    "Follow the repository policy context below when deciding how to use tools and where to write artifacts.",
    "The policy source of truth is loaded from this repository (.cursor/rules and .cursor/skills).",
    ...parts,
  ].join("\n\n");
}

async function collectSkillMarkdownFiles(skillsRoot: string): Promise<string[]> {
  const rootStat = await fs.stat(skillsRoot).catch(() => null);
  if (!rootStat?.isDirectory()) {
    return [];
  }
  const files: string[] = [];
  const stack = [skillsRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase() === "skill.md") {
        files.push(absolute);
      }
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function getConversionSettings(rootState: RootState): ConversionSettings {
  const raw = (rootState.rootUiOverrides?.conversionSettings ?? {}) as Partial<ConversionSettings>;
  const markerServerUrl = typeof raw.markerServerUrl === "string" && raw.markerServerUrl.trim()
    ? raw.markerServerUrl.trim()
    : DEFAULT_MARKER_SERVER_URL;
  const timeoutSec = typeof raw.timeoutSec === "number" && Number.isFinite(raw.timeoutSec) && raw.timeoutSec > 0
    ? Math.round(raw.timeoutSec)
    : 180;
  const pollIntervalMs = typeof raw.pollIntervalMs === "number" && Number.isFinite(raw.pollIntervalMs) && raw.pollIntervalMs >= 500
    ? Math.round(raw.pollIntervalMs)
    : 2000;
  return { markerServerUrl, timeoutSec, pollIntervalMs };
}

async function readWorkspaceJobs(workspaceDir: string): Promise<ConversionJobState[]> {
  const jobsDir = path.join(workspaceDir, "jobs");
  const entries = await fs.readdir(jobsDir, { withFileTypes: true }).catch(() => []);
  const jobs: ConversionJobState[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(jobsDir, entry.name);
    const raw = await fs.readFile(filePath, "utf8").catch(() => "");
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<ConversionJobState>;
      const normalized = normalizeConversionJob(parsed);
      if (normalized) {
        jobs.push(normalized);
      }
    } catch {
      // ignore malformed job records
    }
  }
  jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return jobs;
}

async function findRunningJob(workspaceDir: string): Promise<ConversionJobState | null> {
  const jobs = await readWorkspaceJobs(workspaceDir);
  return jobs.find((job) => job.status === "running") ?? null;
}

async function readWorkspaceJob(workspaceDir: string, jobId: string): Promise<ConversionJobState | null> {
  const filePath = path.join(workspaceDir, "jobs", `${jobId}.json`);
  const raw = await fs.readFile(filePath, "utf8").catch(() => "");
  if (!raw.trim()) return null;
  try {
    return normalizeConversionJob(JSON.parse(raw) as Partial<ConversionJobState>);
  } catch {
    return null;
  }
}

async function writeWorkspaceJob(workspaceDir: string, job: ConversionJobState): Promise<void> {
  await fs.mkdir(path.join(workspaceDir, "jobs"), { recursive: true });
  const filePath = path.join(workspaceDir, "jobs", `${job.id}.json`);
  await writeJsonAtomic(filePath, job);
}

async function updateWorkspaceJob(
  workspaceDir: string,
  jobId: string,
  patch: Partial<ConversionJobState>,
): Promise<ConversionJobState | null> {
  const current = await readWorkspaceJob(workspaceDir, jobId);
  if (!current) return null;
  const next: ConversionJobState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeWorkspaceJob(workspaceDir, next);
  return next;
}

async function extractZipToDirectory(zipBuffer: Buffer, destDir: string): Promise<void> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(zipBuffer));
  } catch {
    throw new Error("Marker bundle is not a valid ZIP archive.");
  }
  const absDest = path.resolve(destDir);
  for (const [rawName, data] of Object.entries(entries)) {
    if (!rawName || rawName.endsWith("/")) continue;
    const rel = rawName.replace(/^[/\\]+/, "").split(/[/\\]/).join(path.sep);
    if (rel.split(path.sep).includes("..")) continue;
    const outPath = path.resolve(absDest, rel);
    if (!outPath.startsWith(absDest + path.sep) && outPath !== absDest) continue;
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, data);
  }
}

async function promoteConvertedTreeToCurrent(sourceDir: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const ent of entries) {
    await fs.cp(path.join(sourceDir, ent.name), path.join(destDir, ent.name), { recursive: true, force: true });
  }
}

async function listMarkdownFilesRecursive(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of dirents) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && isMarkdownFile(ent.name)) {
        results.push(full);
      }
    }
  };
  await walk(rootDir);
  return results;
}

async function pickPrimaryMarkdownUnderDirectory(root: string): Promise<string | null> {
  const all = await listMarkdownFilesRecursive(root);
  if (all.length === 0) return null;
  const documentMd = all.find((p) => path.basename(p).toLowerCase() === "document.md");
  if (documentMd) return documentMd;
  const filtered = all.filter((p) => !path.basename(p).toLowerCase().startsWith("readme"));
  const candidates = filtered.length > 0 ? filtered : all;
  candidates.sort((a, b) => {
    const depthA = a.split(path.sep).length;
    const depthB = b.split(path.sep).length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });
  return candidates[0] ?? null;
}

async function resolveDocumentPdfPath(document: ProjectDocumentState): Promise<string | null> {
  if (document.pdfPath) {
    const stat = await fs.stat(document.pdfPath).catch(() => null);
    if (stat?.isFile()) return document.pdfPath;
  }
  const sourceDir = document.currentDir ?? document.sourceDir;
  const entries = await fs.readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  const pdfFile = entries
    .filter((entry) => entry.isFile() && isPdfFile(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!pdfFile) return null;
  return path.join(sourceDir, pdfFile.name);
}

async function runMarkerConversionJob(input: {
  workspaceDir: string;
  workspaceId: string;
  document: ProjectDocumentState;
  jobId: string;
  preset: string;
  sourcePdfPath: string;
  settings: ConversionSettings;
  mode: ConversionJobState["mode"];
  markerOptions: MarkerSubmitOptions;
  testPageRange: string | null;
}): Promise<void> {
  const { workspaceDir, document, jobId, preset, sourcePdfPath, settings, mode, markerOptions, testPageRange } = input;
  try {
    const currentJob = await readWorkspaceJob(workspaceDir, jobId);
    if (!currentJob || currentJob.status !== "pending") {
      return;
    }
    await updateWorkspaceJob(workspaceDir, jobId, {
      status: "running",
      message: "Submitting conversion job",
      startedAt: new Date().toISOString(),
      progress: 0,
      task: "submit",
      taskProgress: null,
      pipelineIndex: null,
      pipelineTotal: null,
      elapsedSec: 0,
    });

    const markerUrl = settings.markerServerUrl.replace(/\/+$/, "");
    const timeoutMs = Math.max(1, settings.timeoutSec) * 1000;

    let markerJobId = "";
    let markerStatusUrl = "";
    const pdfBuffer = await fs.readFile(sourcePdfPath);
    const formData = new FormData();
    formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), path.basename(sourcePdfPath));
    for (const [key, value] of Object.entries(markerOptions)) {
      formData.append(key, String(value));
    }
    formData.append("preset", preset);
    if (mode === "test" && testPageRange) {
      formData.append("page_range", testPageRange);
    }

    const submitResponse = await fetchWithContext(
      `${markerUrl}/marker/upload/start`,
      { method: "POST", body: formData },
      timeoutMs,
      "submit conversion",
    );
    if (!submitResponse.ok) {
      throw new Error(`marker upload failed (${submitResponse.status})`);
    }
    const submitPayload = await submitResponse.json() as Record<string, unknown>;
    markerJobId = typeof submitPayload.job_id === "string"
      ? submitPayload.job_id
      : typeof submitPayload.id === "string"
        ? submitPayload.id
        : "";
    if (!markerJobId) {
      throw new Error("marker response missing job id");
    }
    const returnedStatusUrl = typeof submitPayload.status_url === "string" ? submitPayload.status_url.trim() : "";
    markerStatusUrl = returnedStatusUrl || `${markerUrl}/api/jobs/${encodeURIComponent(markerJobId)}/status`;
    await updateWorkspaceJob(workspaceDir, jobId, {
      markerJobId,
      message: "Conversion running on marker server",
      progress: 0,
      task: "queued",
      taskProgress: null,
      pipelineIndex: null,
      pipelineTotal: null,
      elapsedSec: 0,
    });

    let finalStatusPayload: Record<string, unknown> | null = null;
    let status: "pending" | "running" | "done" = "pending";
    while (status !== "done") {
      await new Promise((resolve) => setTimeout(resolve, settings.pollIntervalMs));
      const statusResponse = await fetchWithContext(
        markerStatusUrl,
        undefined,
        timeoutMs,
        "poll job status",
      );
      if (!statusResponse.ok) {
        throw new Error(`marker status request failed (${statusResponse.status})`);
      }
      const payload = await statusResponse.json() as Record<string, unknown>;
      finalStatusPayload = payload;
      const liveJob = await readWorkspaceJob(workspaceDir, jobId);
      if (!liveJob || liveJob.status === "cancelled") {
        return;
      }
      const normalizedStatus = normalizeJobStatus(payload);
      status = normalizedStatus === "done" ? "done" : "running";
      const task = typeof payload.task === "string" && payload.task.trim() ? payload.task.trim() : null;
      const progress = readOptionalNumber(payload.progress);
      const taskProgress = readOptionalNumber(payload.task_progress);
      const pipelineIndex = readOptionalInteger(payload.pipeline_index);
      const pipelineTotal = readOptionalInteger(payload.pipeline_total);
      const elapsedSec = readOptionalNumber(payload.elapsed_s);
      await updateWorkspaceJob(workspaceDir, jobId, {
        status: normalizedStatus === "failed" ? "failed" : "running",
        message: deriveConversionMessage(payload, normalizedStatus),
        progress,
        task,
        taskProgress,
        pipelineIndex,
        pipelineTotal,
        elapsedSec,
      });
      if (normalizedStatus === "failed") {
        throw new Error(typeof payload.error === "string" ? payload.error : "Conversion failed on marker server");
      }
    }

    const outputDir = path.join(workspaceDir, "inputs", document.id, "converted", markerJobId);
    await fs.mkdir(outputDir, { recursive: true });

    await updateWorkspaceJob(workspaceDir, jobId, {
      message: "Downloading conversion bundle",
      task: "download",
      taskProgress: null,
      pipelineIndex: null,
      pipelineTotal: null,
      elapsedSec: readOptionalNumber(finalStatusPayload?.elapsed_s) ?? null,
    });

    const zipUrl = `${markerUrl}/api/jobs/${encodeURIComponent(markerJobId)}/zip`;
    const zipTimeoutMs = Math.max(timeoutMs * 5, 120_000);
    const zipResponse = await fetchWithContext(zipUrl, undefined, zipTimeoutMs, "download job zip");

    let primaryMarkdownAbsolute = "";
    let bundleFromZip = false;

    if (zipResponse.ok) {
      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      if (zipBuffer.length > 0) {
        try {
          await fs.rm(outputDir, { recursive: true }).catch(() => {});
          await fs.mkdir(outputDir, { recursive: true });
          await extractZipToDirectory(zipBuffer, outputDir);
          const primary = await pickPrimaryMarkdownUnderDirectory(outputDir);
          if (primary) {
            primaryMarkdownAbsolute = primary;
            bundleFromZip = true;
          }
        } catch {
          bundleFromZip = false;
        }
      }
    }

    let markdownBodyForLegacy: string | null = null;

    if (!bundleFromZip) {
      await fs.rm(outputDir, { recursive: true }).catch(() => {});
      await fs.mkdir(outputDir, { recursive: true });
      const detailResponse = await fetchWithContext(
        `${markerUrl}/api/jobs/${encodeURIComponent(markerJobId)}`,
        undefined,
        timeoutMs,
        "fetch completed job details",
      );
      if (!detailResponse.ok) {
        throw new Error(`marker details request failed (${detailResponse.status})`);
      }
      const detailPayload = await detailResponse.json() as Record<string, unknown>;
      const markdownContent = await fetchFirstMarkdownArtifact(
        markerUrl,
        markerJobId,
        [detailPayload, finalStatusPayload],
        timeoutMs,
      );
      if (!markdownContent) {
        throw new Error("Conversion finished but markdown artifact was not found (ZIP missing or invalid).");
      }
      markdownBodyForLegacy = markdownContent;
      const markdownFileName = `${document.id}.md`;
      const markdownArtifactPath = path.join(outputDir, markdownFileName);
      await fs.writeFile(markdownArtifactPath, markdownContent, "utf8");
      primaryMarkdownAbsolute = markdownArtifactPath;
    }

    if (!primaryMarkdownAbsolute) {
      throw new Error("Conversion finished but no markdown could be resolved from the bundle.");
    }

    const currentDir = document.currentDir ?? path.join(workspaceDir, "documents", document.id, "current");
    let mdPathForMetadata = "";

    if (mode !== "test") {
      await fs.mkdir(currentDir, { recursive: true });
      if (bundleFromZip) {
        await promoteConvertedTreeToCurrent(outputDir, currentDir);
        mdPathForMetadata = path.join(currentDir, path.relative(outputDir, primaryMarkdownAbsolute));
      } else {
        await fs.writeFile(path.join(currentDir, "document.md"), markdownBodyForLegacy!, "utf8");
        mdPathForMetadata = path.join(currentDir, "document.md");
      }
    }

    const metadata = await readProjectMetadata(workspaceDir);
    if (metadata) {
      const index = metadata.documents.findIndex((entry) => entry.id === document.id);
      if (index >= 0 && mode !== "test") {
        metadata.documents[index] = {
          ...metadata.documents[index],
          mdPath: mdPathForMetadata,
        };
        await writeProjectMetadata(workspaceDir, metadata);
      }
    }

    await updateWorkspaceJob(workspaceDir, jobId, {
      status: "done",
      message: mode === "test" ? "Test conversion completed" : "Conversion completed",
      errorMessage: null,
      progress: 100,
      task: "completed",
      taskProgress: 100,
      elapsedSec: readOptionalNumber(finalStatusPayload?.elapsed_s) ?? null,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    await updateWorkspaceJob(workspaceDir, jobId, {
      status: "failed",
      message: "Conversion failed",
      errorMessage: formatConversionError(error),
      task: "failed",
      finishedAt: new Date().toISOString(),
    });
    throw error;
  }
}

function normalizeJobStatus(payload: Record<string, unknown>): "pending" | "running" | "done" | "failed" {
  const raw = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
  if (raw === "done" || raw === "completed" || raw === "success") return "done";
  if (raw === "failed" || raw === "error") return "failed";
  if (raw === "running" || raw === "processing" || raw === "started" || raw === "queued") return "running";
  return "pending";
}

async function fetchFirstMarkdownArtifact(
  markerBaseUrl: string,
  markerJobId: string,
  payloadCandidates: Array<Record<string, unknown> | null>,
  timeoutMs: number,
): Promise<string | null> {
  const candidatePaths = payloadCandidates.flatMap((payload) => collectMarkdownCandidates(payload));
  for (const candidate of candidatePaths) {
    const url = candidate.startsWith("http://") || candidate.startsWith("https://")
      ? candidate
      : candidate.startsWith("/downloads/")
        ? `${markerBaseUrl}${candidate}`
      : `${markerBaseUrl}/downloads/${encodeURIComponent(markerJobId)}/${candidate.replace(/^\/+/, "")}`;
    const response = await fetchWithContext(url, undefined, timeoutMs, "download markdown artifact");
    if (!response.ok) continue;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text") || contentType.includes("markdown") || contentType.includes("application/octet-stream")) {
      const text = await response.text();
      if (text.trim()) {
        return text;
      }
    }
  }
  return null;
}

async function fetchWithContext(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  phase: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init ?? {}), signal: controller.signal });
  } catch (error) {
    throw new Error(`Marker server ${phase} failed at ${url}. Check Settings > Conversion > Marker Server URL. ${getErrorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function formatConversionError(error: unknown): string {
  const message = getErrorMessage(error);
  if (message.includes("fetch failed")) {
    return `${message}. Check Settings > Conversion > Marker Server URL and ensure marker_server is running.`;
  }
  return message;
}

function collectMarkdownCandidates(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];
  const results: string[] = [];
  const pushCandidate = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (!normalized || !normalized.toLowerCase().endsWith(".md")) return;
    results.push(normalized);
  };
  const direct = ["markdown", "markdown_url", "md_path", "md_file", "output_markdown"];
  for (const key of direct) {
    pushCandidate(payload[key]);
  }
  const files = Array.isArray(payload.files) ? payload.files : [];
  for (const file of files) {
    if (typeof file === "string" && file.toLowerCase().endsWith(".md")) {
      results.push(file);
    } else if (file && typeof file === "object") {
      const pathValue = (file as { path?: unknown; url?: unknown }).path;
      const urlValue = (file as { path?: unknown; url?: unknown }).url;
      if (typeof pathValue === "string" && pathValue.toLowerCase().endsWith(".md")) {
        results.push(pathValue);
      }
      if (typeof urlValue === "string" && urlValue.toLowerCase().endsWith(".md")) {
        results.push(urlValue);
      }
      pushCandidate((file as { download_url?: unknown; name?: unknown }).download_url);
      pushCandidate((file as { download_url?: unknown; name?: unknown }).name);
    }
  }
  const downloads = payload.downloads;
  if (Array.isArray(downloads)) {
    for (const entry of downloads) {
      pushCandidate(entry);
      if (entry && typeof entry === "object") {
        pushCandidate((entry as { path?: unknown; url?: unknown; download_url?: unknown; name?: unknown }).path);
        pushCandidate((entry as { path?: unknown; url?: unknown; download_url?: unknown; name?: unknown }).url);
        pushCandidate((entry as { path?: unknown; url?: unknown; download_url?: unknown; name?: unknown }).download_url);
        pushCandidate((entry as { path?: unknown; url?: unknown; download_url?: unknown; name?: unknown }).name);
      }
    }
  } else if (downloads && typeof downloads === "object") {
    for (const value of Object.values(downloads as Record<string, unknown>)) {
      pushCandidate(value);
      if (value && typeof value === "object") {
        pushCandidate((value as { path?: unknown; url?: unknown; download_url?: unknown; name?: unknown }).path);
        pushCandidate((value as { path?: unknown; url?: unknown; download_url?: unknown; name?: unknown }).url);
        pushCandidate((value as { path?: unknown; url?: unknown; download_url?: unknown; name?: unknown }).download_url);
        pushCandidate((value as { path?: unknown; url?: unknown; download_url?: unknown; name?: unknown }).name);
      }
    }
  }
  return Array.from(new Set(results));
}

function readOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readOptionalInteger(value: unknown): number | null {
  const parsed = readOptionalNumber(value);
  if (parsed === null) return null;
  return Math.round(parsed);
}

function deriveConversionMessage(
  payload: Record<string, unknown>,
  normalizedStatus: "pending" | "running" | "done" | "failed",
): string {
  const explicitMessage = typeof payload.message === "string" && payload.message.trim()
    ? payload.message.trim()
    : "";
  if (explicitMessage) {
    return explicitMessage;
  }
  const task = typeof payload.task === "string" && payload.task.trim() ? payload.task.trim() : "";
  const progress = readOptionalNumber(payload.progress);
  if (normalizedStatus === "done") {
    return "Conversion complete, fetching artifacts";
  }
  if (normalizedStatus === "failed") {
    return "Conversion failed on marker server";
  }
  if (task && progress !== null) {
    return `${task} (${Math.round(progress)}%)`;
  }
  if (task) {
    return task;
  }
  if (progress !== null) {
    return `Conversion running (${Math.round(progress)}%)`;
  }
  return "Conversion running";
}

function normalizeMarkerSubmitOptions(raw: unknown): MarkerSubmitOptions {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const numberWithMin = (value: unknown, fallback: number, min: number): number => {
    const parsed = readOptionalNumber(value);
    if (parsed === null) return fallback;
    return Math.max(min, Math.round(parsed));
  };
  return {
    output_format: "markdown",
    use_llm: readBooleanOption(source.use_llm, DEFAULT_MARKER_SUBMIT_OPTIONS.use_llm),
    llm_service: typeof source.llm_service === "string" && source.llm_service.trim()
      ? source.llm_service.trim()
      : DEFAULT_MARKER_SUBMIT_OPTIONS.llm_service,
    gemini_model_name: typeof source.gemini_model_name === "string" && source.gemini_model_name.trim()
      ? source.gemini_model_name.trim()
      : DEFAULT_MARKER_SUBMIT_OPTIONS.gemini_model_name,
    paginate_output: readBooleanOption(source.paginate_output, DEFAULT_MARKER_SUBMIT_OPTIONS.paginate_output),
    lowres_image_dpi: numberWithMin(source.lowres_image_dpi, DEFAULT_MARKER_SUBMIT_OPTIONS.lowres_image_dpi, 36),
    extract_images: readBooleanOption(source.extract_images, DEFAULT_MARKER_SUBMIT_OPTIONS.extract_images),
    disable_image_extraction: readBooleanOption(source.disable_image_extraction, DEFAULT_MARKER_SUBMIT_OPTIONS.disable_image_extraction),
    force_ocr: readBooleanOption(source.force_ocr, DEFAULT_MARKER_SUBMIT_OPTIONS.force_ocr),
    strip_existing_ocr: readBooleanOption(source.strip_existing_ocr, DEFAULT_MARKER_SUBMIT_OPTIONS.strip_existing_ocr),
    disable_ocr: readBooleanOption(source.disable_ocr, DEFAULT_MARKER_SUBMIT_OPTIONS.disable_ocr),
    html_tables_in_markdown: readBooleanOption(source.html_tables_in_markdown, DEFAULT_MARKER_SUBMIT_OPTIONS.html_tables_in_markdown),
    keep_pageheader_in_output: readBooleanOption(source.keep_pageheader_in_output, DEFAULT_MARKER_SUBMIT_OPTIONS.keep_pageheader_in_output),
    keep_pagefooter_in_output: readBooleanOption(source.keep_pagefooter_in_output, DEFAULT_MARKER_SUBMIT_OPTIONS.keep_pagefooter_in_output),
    add_block_ids: readBooleanOption(source.add_block_ids, DEFAULT_MARKER_SUBMIT_OPTIONS.add_block_ids),
    katex_compatible: readBooleanOption(source.katex_compatible, DEFAULT_MARKER_SUBMIT_OPTIONS.katex_compatible),
    normalize_equation_tags: readBooleanOption(source.normalize_equation_tags, DEFAULT_MARKER_SUBMIT_OPTIONS.normalize_equation_tags),
    redo_inline_math: readBooleanOption(source.redo_inline_math, DEFAULT_MARKER_SUBMIT_OPTIONS.redo_inline_math),
    debug: readBooleanOption(source.debug, DEFAULT_MARKER_SUBMIT_OPTIONS.debug),
  };
}

function readBooleanOption(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeConversionJob(raw: Partial<ConversionJobState> | null | undefined): ConversionJobState | null {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string") {
    return null;
  }
  return {
    id: raw.id,
    workspaceId: typeof raw.workspaceId === "string" ? raw.workspaceId : "",
    documentId: typeof raw.documentId === "string" ? raw.documentId : "",
    provider: "marker_server",
    markerJobId: typeof raw.markerJobId === "string" ? raw.markerJobId : null,
    status: raw.status === "running" || raw.status === "done" || raw.status === "failed" || raw.status === "cancelled"
      ? raw.status
      : "pending",
    message: typeof raw.message === "string" ? raw.message : "",
    errorMessage: typeof raw.errorMessage === "string" ? raw.errorMessage : null,
    mode: raw.mode === "overwrite" || raw.mode === "test" ? raw.mode : "default",
    preset: typeof raw.preset === "string" && raw.preset.trim() ? raw.preset : "default_native_pdf",
    markerOptions: normalizeMarkerSubmitOptions(raw.markerOptions),
    testPageRange: typeof raw.testPageRange === "string" ? raw.testPageRange : null,
    startRequestedAt: typeof raw.startRequestedAt === "string" ? raw.startRequestedAt : null,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
    finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : null,
    progress: readOptionalNumber(raw.progress),
    task: typeof raw.task === "string" ? raw.task : null,
    taskProgress: readOptionalNumber(raw.taskProgress),
    pipelineIndex: readOptionalInteger(raw.pipelineIndex),
    pipelineTotal: readOptionalInteger(raw.pipelineTotal),
    elapsedSec: readOptionalNumber(raw.elapsedSec),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

async function copyMarkdownReferencedAssets(
  markdownFilePath: string,
  sourceBaseDir: string,
  targetBaseDir: string,
): Promise<void> {
  const content = await fs.readFile(markdownFilePath, "utf8").catch(() => "");
  if (!content.trim()) {
    return;
  }

  const references = collectMarkdownLocalReferences(content);
  for (const reference of references) {
    const normalizedReference = reference.replace(/\\/g, "/");
    const absoluteSourcePath = path.resolve(sourceBaseDir, normalizedReference);
    if (!isWithinPath(sourceBaseDir, absoluteSourcePath)) {
      continue;
    }
    const stat = await fs.stat(absoluteSourcePath).catch(() => null);
    if (!stat) {
      continue;
    }
    const targetPath = path.join(targetBaseDir, ...normalizedReference.split("/"));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    if (stat.isDirectory()) {
      await fs.cp(absoluteSourcePath, targetPath, { recursive: true });
    } else if (stat.isFile()) {
      await fs.copyFile(absoluteSourcePath, targetPath);
    }
  }
}

function collectMarkdownLocalReferences(markdownSource: string): string[] {
  const references = new Set<string>();
  const markdownLinkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  const htmlImgPattern = /<img[^>]+src=["']([^"']+)["']/gi;

  const addReference = (rawValue: string) => {
    const trimmed = rawValue.trim().replace(/^<|>$/g, "");
    if (!trimmed) return;
    const valueWithoutTitle = trimmed.split(/\s+/)[0] ?? "";
    const withoutHash = valueWithoutTitle.split("#")[0] ?? "";
    const withoutQuery = withoutHash.split("?")[0] ?? "";
    if (!withoutQuery || withoutQuery === ".") return;
    const lower = withoutQuery.toLowerCase();
    if (
      lower.startsWith("http://")
      || lower.startsWith("https://")
      || lower.startsWith("data:")
      || lower.startsWith("mailto:")
      || lower.startsWith("#")
      || lower.startsWith("/")
    ) {
      return;
    }
    references.add(withoutQuery);
  };

  for (const match of markdownSource.matchAll(markdownLinkPattern)) {
    if (match[1]) addReference(match[1]);
  }
  for (const match of markdownSource.matchAll(htmlImgPattern)) {
    if (match[1]) addReference(match[1]);
  }

  return Array.from(references);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message?.trim();
    if (message && message !== "Error") {
      return message;
    }

    const causedBy = error.cause;
    if (causedBy instanceof Error && causedBy.message?.trim()) {
      return causedBy.message.trim();
    }
  }

  if (typeof error === "object" && error !== null) {
    const maybeToJson = (error as { toJSON?: unknown }).toJSON;
    if (typeof maybeToJson === "function") {
      try {
        const asJson = maybeToJson.call(error) as Record<string, unknown>;
        const jsonMessage = asJson.message;
        if (typeof jsonMessage === "string" && jsonMessage.trim() && jsonMessage.trim() !== "Error") {
          return jsonMessage.trim();
        }
        const code = asJson.code;
        if (typeof code === "string" && code.trim()) {
          return `SDK error (${code}): ${jsonMessage ?? "unknown error"}`;
        }
      } catch {
        // Ignore toJSON failures and continue.
      }
    }

    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage.trim();
    }
  }

  return "Internal server error";
}

function describeError(error: unknown): string {
  return inspect(error, { depth: 4, breakLength: 120 });
}

function sanitizeGeneratedTitle(value: string): string {
  const cleaned = value
    .replace(/\r?\n/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  const maxLength = 80;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  extension?: string;
  children?: FileTreeNode[];
}

interface FileTreeOptions {
  hideImages: boolean;
  hideHidden: boolean;
  customPatterns: string[];
}

async function buildWorkspaceFileTree(
  rootDir: string,
  options: FileTreeOptions,
): Promise<FileTreeNode[]> {
  const { hideImages, hideHidden, customPatterns } = options;

  const customPatternSet = new Set(customPatterns.map((p) => p.toLowerCase()));

  function shouldSkipFile(name: string): boolean {
    const lowerName = name.toLowerCase();

    if (SKIP_FILES_DEFAULT.has(name)) {
      return true;
    }

    if (hideHidden && name.startsWith(".")) {
      return true;
    }

    const ext = path.extname(lowerName);
    if (SKIP_EXTENSIONS_DEFAULT.has(ext)) {
      return true;
    }

    if (hideImages && IMAGE_EXTENSIONS.has(ext)) {
      return true;
    }

    if (customPatternSet.has(lowerName) || customPatternSet.has(ext)) {
      return true;
    }

    return false;
  }

  function shouldSkipDir(name: string): boolean {
    if (SKIP_DIRS.has(name)) {
      return true;
    }
    if (hideHidden && name.startsWith(".")) {
      return true;
    }
    return false;
  }

  async function buildTree(dirPath: string): Promise<FileTreeNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    const nodes: FileTreeNode[] = [];

    const sortedEntries = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sortedEntries) {
      const absolutePath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootDir, absolutePath);

      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) {
          continue;
        }
        const children = await buildTree(absolutePath);
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "directory",
          children,
        });
      } else if (entry.isFile()) {
        if (shouldSkipFile(entry.name)) {
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: "file",
          extension: ext || undefined,
        });
      }
    }

    return nodes;
  }

  return buildTree(rootDir);
}
