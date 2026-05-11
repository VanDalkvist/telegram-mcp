import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AppError } from "../domain/errors.js";

export interface SessionStore {
  load(): Promise<string>;
  save(session: string): Promise<void>;
}

export class FileSessionStore implements SessionStore {
  public constructor(private readonly sessionPath: string) {}

  public async load(): Promise<string> {
    try {
      const session = await readFile(this.sessionPath, "utf8");
      return assertNonEmptySession(session);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("AUTH_REQUIRED", `Telegram session is missing at ${this.sessionPath}`, {
        publicMessage: "Telegram authorization is required",
        cause: error
      });
    }
  }

  public async save(session: string): Promise<void> {
    const validSession = assertNonEmptySession(session);
    await mkdir(dirname(this.sessionPath), { recursive: true });
    await writeFile(this.sessionPath, validSession, { encoding: "utf8", mode: 0o600 });
  }
}

function assertNonEmptySession(session: string): string {
  const trimmed = session.trim();
  if (trimmed.length === 0) {
    throw new AppError("AUTH_REQUIRED", "Telegram session is empty", {
      publicMessage: "Telegram authorization is required"
    });
  }

  return trimmed;
}
