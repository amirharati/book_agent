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
});
