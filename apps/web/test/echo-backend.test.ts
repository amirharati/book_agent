import { describe, expect, it } from "vitest";
import { EchoBackend } from "../src/backends/echo-backend.js";

describe("EchoBackend", () => {
  it("streams chunk events and terminates with done", async () => {
    const backend = new EchoBackend();
    const { sessionId } = await backend.createSession();

    const events = [];
    for await (const event of backend.sendMessage({ sessionId, message: "hello world" })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "chunk")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});
