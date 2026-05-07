import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { EchoBackend } from "../src/backends/echo-backend.js";

describe("web backend API", () => {
  it("serves the chat shell at root", async () => {
    const app = createApp({ backend: new EchoBackend(), backendName: "echo" });
    const response = await request(app).get("/").expect(200);
    expect(response.text).toContain("Book Agent Web Chat");
  });

  it("creates sessions and streams responses over SSE", async () => {
    const app = createApp({ backend: new EchoBackend(), backendName: "echo" });

    const sessionResponse = await request(app).post("/api/sessions").expect(201);
    expect(sessionResponse.body.sessionId).toBeTypeOf("string");

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
