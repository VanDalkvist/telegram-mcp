import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AppError } from "../../src/domain/errors.js";
import { FileSessionStore } from "../../src/infra/file-session-store.js";

describe("FileSessionStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "telegram-mcp-session-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("saves and loads a non-empty session", async () => {
    const store = new FileSessionStore(join(dir, "nested", "session"));

    await store.save("session-string");

    await expect(store.load()).resolves.toBe("session-string");
  });

  test("tightens existing session file permissions when saving", async () => {
    const sessionPath = join(dir, "session");
    await writeFile(sessionPath, "old-session", { mode: 0o644 });
    const store = new FileSessionStore(sessionPath);

    await store.save("session-string");

    expect((await stat(sessionPath)).mode & 0o777).toBe(0o600);
    await expect(store.load()).resolves.toBe("session-string");
  });

  test("rejects empty saved sessions", async () => {
    const store = new FileSessionStore(join(dir, "session"));

    await expect(store.save("   ")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  test("fails with AUTH_REQUIRED when session file is missing or empty", async () => {
    const store = new FileSessionStore(join(dir, "missing"));

    await expect(store.load()).rejects.toBeInstanceOf(AppError);
    await expect(store.load()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });

    await store.save("valid");
    await store.save("another-valid");
    await expect(store.load()).resolves.toBe("another-valid");
  });
});
