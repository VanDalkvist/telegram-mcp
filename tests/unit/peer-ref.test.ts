import { describe, expect, test } from "vitest";
import { AppError } from "../../src/domain/errors.js";
import { parsePeerRef, serializePeerRef } from "../../src/domain/peer-ref.js";

describe("PeerRef", () => {
  test("serializes and parses a stable chat reference", () => {
    const value = serializePeerRef({
      version: 1,
      type: "channel",
      id: "123",
      accessHash: "456",
      username: "public_channel",
      title: "Public Channel"
    });

    expect(parsePeerRef(value)).toEqual({
      version: 1,
      type: "channel",
      id: "123",
      accessHash: "456",
      username: "public_channel",
      title: "Public Channel"
    });
  });

  test("rejects invalid peer references instead of guessing", () => {
    expect(() => parsePeerRef("Public Channel")).toThrow(AppError);
    expect(() => parsePeerRef("{bad-json")).toThrow(/CHAT_NOT_FOUND/);
  });
});
