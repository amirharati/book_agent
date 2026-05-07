import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { AgentBackend, AgentStreamEvent } from "./agent-backend.js";

interface CreateAppInput {
  backend: AgentBackend;
  backendName: string;
  workspaceRoot?: string;
}

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "dist", "__pycache__", ".mypy_cache"]);

export function createApp({ backend, backendName, workspaceRoot = process.cwd() }: CreateAppInput) {
  const app = express();
  const staticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const runtimeConfig = {
    inputRoot: path.join(resolvedWorkspaceRoot, "inputs"),
    outputRoot: path.join(resolvedWorkspaceRoot, "outputs"),
  };

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
      const includeFiles = req.query.includeFiles === "md";

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
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
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

  app.post("/api/sessions", async (_req, res, next) => {
    try {
      console.log(`[session] creating session using backend=${backendName}`);
      const result = await backend.createSession();
      console.log(`[session] created session id=${result.sessionId}`);
      res.status(201).json(result);
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
