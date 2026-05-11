import { describe, expect, test } from "vitest";
import { parseFolderRef, serializeFolderRef } from "../../src/domain/folder-ref.js";

describe("FolderRef", () => {
  test("serializes and parses a stable Telegram folder reference", () => {
    const folderRef = serializeFolderRef({
      version: 1,
      id: 7,
      title: "Research Folder"
    });

    expect(parseFolderRef(folderRef)).toEqual({
      version: 1,
      id: 7,
      title: "Research Folder"
    });
  });

  test("rejects invalid folder references instead of guessing", () => {
    expect(() => parseFolderRef("Research Folder")).toThrow(/FOLDER_NOT_FOUND/);
  });
});
