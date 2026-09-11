import { describe, expect, it, vi } from "vitest";
import { resolveQuietly } from "./quiet-network";

describe("resolveQuietly", () => {
  it("passes a successful response through untouched (identical object)", async () => {
    const ok = new Response("x", { status: 200 });
    const attempt = vi.fn(async () => ok);
    await expect(resolveQuietly(attempt)).resolves.toBe(ok);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("maps a rejected attempt to an opaque network error", async () => {
    const attempt = vi.fn(async (): Promise<Response> => {
      throw new Error("down");
    });
    const res = await resolveQuietly(attempt);
    expect(res.type).toBe("error");
    expect(res.status).not.toBe(204);
  });

  it("maps a nullish result to an opaque network error", async () => {
    await expect(resolveQuietly(async () => null)).resolves.toMatchObject({
      type: "error",
    });
    await expect(resolveQuietly(async () => undefined)).resolves.toMatchObject(
      {
        type: "error",
      },
    );
  });

  it("maps a synchronously throwing attempt to an opaque network error", async () => {
    const res = await resolveQuietly(() => {
      throw new Error("sync");
    });
    expect(res.type).toBe("error");
  });

  it("never synthesizes a success status", async () => {
    const attempts: (() => Promise<Response | null | undefined>)[] = [
      async (): Promise<Response> => {
        throw new Error("a");
      },
      async () => null,
      async () => undefined,
    ];
    for (const attempt of attempts) {
      const res = await resolveQuietly(attempt);
      expect(res.status).not.toBe(204);
      expect(res.status).not.toBe(200);
    }
  });
});
