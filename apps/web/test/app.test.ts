import request from "supertest";
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { EchoBackend } from "../src/backends/echo-backend.js";

async function withTestApp(run: (app: ReturnType<typeof createApp>) => Promise<void>) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "book-agent-web-test-"));
  try {
    const app = createApp({ backend: new EchoBackend(), backendName: "echo", workspaceRoot });
    await run(app);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("web backend API", () => {
  it("serves the chat shell at root", async () => {
    await withTestApp(async (app) => {
      const response = await request(app).get("/").expect(200);
      expect(response.text).toContain("Research Studio");
    });
  });

  it("creates sessions and streams responses over SSE", async () => {
    await withTestApp(async (app) => {
      const sessionResponse = await request(app).post("/api/sessions").expect(201);
      expect(sessionResponse.body.sessionId).toBeTypeOf("string");
      expect(sessionResponse.body.runtimeContext).toMatchObject({
        sessionId: sessionResponse.body.sessionId,
        sessionShortId: sessionResponse.body.sessionId.slice(0, 8),
      });

      const contextResponse = await request(app)
        .get(`/api/sessions/${sessionResponse.body.sessionId}/context`)
        .expect(200);
      expect(contextResponse.body.context).toMatchObject({
        sessionId: sessionResponse.body.sessionId,
        sessionShortId: sessionResponse.body.sessionId.slice(0, 8),
      });

      const streamResponse = await request(app)
        .post(`/api/sessions/${sessionResponse.body.sessionId}/messages/stream`)
        .set("Accept", "text/event-stream")
        .send({ message: "ping" })
        .expect(200);

      expect(streamResponse.headers["content-type"]).toContain("text/event-stream");
      expect(streamResponse.text).toContain("event: chunk");
      expect(streamResponse.text).toContain("event: done");
    });
  });

  it("copies added markdown file plus referenced assets into workspace-local inputs", async () => {
    await withTestApp(async (app) => {
      const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "book-agent-source-"));
      try {
        const externalDocDir = path.join(externalRoot, "doc-src");
        const externalImagesDir = path.join(externalDocDir, "images");
        await fs.mkdir(externalDocDir, { recursive: true });
        await fs.mkdir(externalImagesDir, { recursive: true });
        const sourceMdPath = path.join(externalDocDir, "chapter-1.md");
        const referencedImagePath = path.join(externalImagesDir, "fig-1.png");
        const unrelatedPath = path.join(externalDocDir, "other.md");
        await fs.writeFile(sourceMdPath, "# Original\n\n![Figure](images/fig-1.png)\n", "utf8");
        await fs.writeFile(referencedImagePath, "img", "utf8");
        await fs.writeFile(unrelatedPath, "# Unrelated\n", "utf8");

        const workspaceResponse = await request(app)
          .post("/api/workspaces")
          .send({ name: "Copy Test Workspace" })
          .expect(201);
        const workspaceId = workspaceResponse.body.id as string;

        const addResponse = await request(app)
          .post(`/api/workspaces/${encodeURIComponent(workspaceId)}/documents`)
          .send({ sourcePath: sourceMdPath, mode: "copy" })
          .expect(201);

        const addedDoc = addResponse.body.documents?.[0];
        expect(addedDoc).toBeTruthy();
        expect(addedDoc.sourcePath).toBe(sourceMdPath);
        expect(addedDoc.sourceDir).toContain(path.join(workspaceId, "inputs"));
        expect(addedDoc.mdPath).toContain(path.join(workspaceId, "documents"));
        await expect(fs.stat(path.join(addedDoc.sourceDir, "images", "fig-1.png"))).resolves.toBeTruthy();
        await expect(fs.stat(path.join(addedDoc.sourceDir, "other.md"))).rejects.toBeTruthy();

        await fs.writeFile(sourceMdPath, "# Modified outside workspace\n", "utf8");
        const contentResponse = await request(app)
          .get(`/api/workspaces/${encodeURIComponent(workspaceId)}/documents/${encodeURIComponent(addedDoc.id)}/content`)
          .expect(200);
        expect(contentResponse.body.content).toContain("# Original");
      } finally {
        await fs.rm(externalRoot, { recursive: true, force: true });
      }
    });
  });

  it("copies only selected pdf file into workspace-local inputs", async () => {
    await withTestApp(async (app) => {
      const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "book-agent-pdf-source-"));
      try {
        const sourceDir = path.join(externalRoot, "pdfs");
        await fs.mkdir(sourceDir, { recursive: true });
        const sourcePdfPath = path.join(sourceDir, "a.pdf");
        const otherPdfPath = path.join(sourceDir, "b.pdf");
        await fs.writeFile(sourcePdfPath, "pdf-a", "utf8");
        await fs.writeFile(otherPdfPath, "pdf-b", "utf8");

        const workspaceResponse = await request(app)
          .post("/api/workspaces")
          .send({ name: "PDF Copy Workspace" })
          .expect(201);
        const workspaceId = workspaceResponse.body.id as string;

        const addResponse = await request(app)
          .post(`/api/workspaces/${encodeURIComponent(workspaceId)}/documents`)
          .send({ sourcePath: sourcePdfPath, mode: "copy" })
          .expect(201);

        const addedDoc = addResponse.body.documents?.[0];
        expect(addedDoc).toBeTruthy();
        expect(addedDoc.pdfPath).toContain(path.join(workspaceId, "documents"));
        await expect(fs.stat(path.join(addedDoc.sourceDir, "a.pdf"))).resolves.toBeTruthy();
        await expect(fs.stat(path.join(addedDoc.sourceDir, "b.pdf"))).rejects.toBeTruthy();
      } finally {
        await fs.rm(externalRoot, { recursive: true, force: true });
      }
    });
  });

  it("does not auto-start conversion jobs when adding pdf", async () => {
    await withTestApp(async (app) => {
      const externalRoot = await fs.mkdtemp(path.join(os.tmpdir(), "book-agent-pdf-auto-convert-"));
      try {
        const sourceDir = path.join(externalRoot, "pdfs");
        await fs.mkdir(sourceDir, { recursive: true });
        const sourcePdfPath = path.join(sourceDir, "auto.pdf");
        await fs.writeFile(sourcePdfPath, "pdf-content", "utf8");

        const workspaceResponse = await request(app)
          .post("/api/workspaces")
          .send({ name: "PDF Auto Convert Workspace" })
          .expect(201);
        const workspaceId = workspaceResponse.body.id as string;

        const addResponse = await request(app)
          .post(`/api/workspaces/${encodeURIComponent(workspaceId)}/documents`)
          .send({ sourcePath: sourcePdfPath, mode: "copy" })
          .expect(201);
        const addedDoc = addResponse.body.documents?.[0];
        expect(addedDoc).toBeTruthy();

        await sleep(50);
        const jobsResponse = await request(app)
          .get(`/api/workspaces/${encodeURIComponent(workspaceId)}/jobs`)
          .expect(200);
        const jobs = Array.isArray(jobsResponse.body.jobs) ? jobsResponse.body.jobs : [];
        expect(jobs.find((job) => job.documentId === addedDoc.id)).toBeFalsy();
      } finally {
        await fs.rm(externalRoot, { recursive: true, force: true });
      }
    });
  });
});
