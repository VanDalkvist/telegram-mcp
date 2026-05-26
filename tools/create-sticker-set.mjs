#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Api, utils } from "telegram";
import { CustomFile } from "telegram/client/uploads.js";
import { loadConfigFromDotenv } from "../dist/config/config.js";
import { FileSessionStore } from "../dist/infra/file-session-store.js";
import { createGramJsClient } from "../dist/infra/telegram-client.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.manifest === undefined) {
    throw new Error("Missing --manifest /path/to/manifest.json");
  }

  const manifestPath = resolve(args.manifest);
  const baseDir = resolve(args.baseDir ?? dirname(manifestPath));
  const statePath = resolve(args.state ?? `${manifestPath}.create-state.json`);
  const manifest = await readManifest(manifestPath);
  const title = args.title ?? manifest.sticker_set_title;
  const shortName = args.shortName ?? manifest.sticker_set_short_name;
  const software = args.software ?? manifest.software ?? "telegram-mcp";
  assertStickerSetIdentity(title, shortName);
  await assertAllStickerFiles(baseDir, manifest.stickers);

  const config = loadConfigFromDotenv({ cwd: process.cwd() });
  const session = await new FileSessionStore(config.sessionPath).load();
  const client = createGramJsClient(session, config);

  try {
    await client.connect();
    if (!(await client.checkAuthorization())) {
      throw new Error("Telegram session is not authorized");
    }

    if (existsSync(statePath)) {
      const state = JSON.parse(await readFile(statePath, "utf-8"));
      if (state.sticker_set_short_name === shortName && state.created_at !== undefined) {
        const readBack = await getStickerSet(client, shortName);
        console.log(JSON.stringify({
          status: "already_created",
          sticker_set_short_name: shortName,
          sticker_set_title: readBack.set.title,
          sticker_count: Number(readBack.set.count ?? readBack.documents.length),
          link: stickerSetLink(shortName),
          state_path: statePath
        }, null, 2));
        return;
      }
    }

    await assertShortNameAvailable(client, shortName);

    console.log(JSON.stringify({
      sticker_set_short_name: shortName,
      sticker_set_title: title,
      dry_run: !args.apply,
      sticker_count: manifest.stickers.length,
      state_path: statePath
    }, null, 2));

    if (!args.apply) {
      return;
    }

    const stickerItems = [];
    for (const item of manifest.stickers) {
      const absolutePath = resolve(baseDir, item.path);
      const media = await uploadStickerMedia(client, absolutePath, item.emoji);
      stickerItems.push(new Api.InputStickerSetItem({
        document: utils.getInputDocument(media.document),
        emoji: item.emoji
      }));

      console.log(JSON.stringify({
        status: "uploaded_media",
        slug: item.slug,
        emoji: item.emoji
      }));

      if (args.delayMs > 0) {
        await sleep(args.delayMs);
      }
    }

    const result = await client.invoke(new Api.stickers.CreateStickerSet({
      userId: new Api.InputUserSelf(),
      title,
      shortName,
      stickers: stickerItems,
      software
    }));
    assertStickerSetResponse(result);

    const readBack = await getStickerSet(client, shortName);
    const state = {
      sticker_set_short_name: shortName,
      sticker_set_title: readBack.set.title,
      link: stickerSetLink(shortName),
      created_at: new Date().toISOString(),
      manifest_path: manifestPath,
      stickers: manifest.stickers.map((item) => ({
        path: item.path,
        slug: item.slug,
        text: item.text,
        emoji: item.emoji,
        sha256: item.sha256
      }))
    };
    await writeJson(statePath, state);

    console.log(JSON.stringify({
      status: "complete",
      sticker_set_short_name: shortName,
      sticker_set_title: readBack.set.title,
      final_count: Number(readBack.set.count ?? readBack.documents.length),
      link: stickerSetLink(shortName)
    }, null, 2));
  } finally {
    await client.disconnect?.();
  }
}

function parseArgs(argv) {
  const args = {
    apply: false,
    delayMs: 500
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--apply":
        args.apply = true;
        break;
      case "--dry-run":
        args.apply = false;
        break;
      case "--manifest":
        args.manifest = readNext(argv, ++index, arg);
        break;
      case "--base-dir":
        args.baseDir = readNext(argv, ++index, arg);
        break;
      case "--state":
        args.state = readNext(argv, ++index, arg);
        break;
      case "--title":
        args.title = readNext(argv, ++index, arg);
        break;
      case "--short-name":
        args.shortName = readNext(argv, ++index, arg);
        break;
      case "--software":
        args.software = readNext(argv, ++index, arg);
        break;
      case "--delay-ms":
        args.delayMs = parseNonNegativeInt(readNext(argv, ++index, arg), arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readNext(argv, index, name) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function parseNonNegativeInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

async function readManifest(path) {
  const manifest = JSON.parse(await readFile(path, "utf-8"));
  if (!Array.isArray(manifest.stickers) || manifest.stickers.length === 0) {
    throw new Error("Manifest must include a non-empty stickers array");
  }
  for (const [index, item] of manifest.stickers.entries()) {
    for (const key of ["path", "emoji", "slug", "text", "sha256"]) {
      if (typeof item[key] !== "string" || item[key].trim().length === 0) {
        throw new Error(`Manifest sticker ${index} is missing ${key}`);
      }
    }
  }
  return manifest;
}

function assertStickerSetIdentity(title, shortName) {
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 64) {
    throw new Error("Sticker set title must be 1-64 characters");
  }
  if (typeof shortName !== "string" || shortName.length < 1 || shortName.length > 64) {
    throw new Error("Sticker set short name must be 1-64 characters");
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(shortName) || shortName.includes("__")) {
    throw new Error("Sticker set short name must start with a letter and contain only letters, digits, and single underscores");
  }
}

async function assertAllStickerFiles(baseDir, stickers) {
  for (const item of stickers) {
    const absolutePath = resolve(baseDir, item.path);
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) {
      throw new Error(`Sticker path is not a file: ${absolutePath}`);
    }
    if (metadata.size > 512 * 1024) {
      throw new Error(`Sticker exceeds 512 KB: ${absolutePath}`);
    }
    mimeTypeForPath(absolutePath);
  }
}

async function assertShortNameAvailable(client, shortName) {
  try {
    const result = await client.invoke(new Api.stickers.CheckShortName({ shortName }));
    if (result !== true && result?.className !== "BoolTrue") {
      throw new Error(`Sticker set short name is not available: ${shortName}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("SHORT_NAME_OCCUPIED") || message.includes("PACK_SHORT_NAME_OCCUPIED")) {
      throw new Error(`Sticker set short name is already occupied: ${shortName}`);
    }
    throw error;
  }
}

async function getStickerSet(client, shortName) {
  const result = await client.invoke(new Api.messages.GetStickerSet({
    stickerset: new Api.InputStickerSetShortName({ shortName }),
    hash: 0
  }));
  assertStickerSetResponse(result);
  return result;
}

function assertStickerSetResponse(result) {
  if (!(result instanceof Api.messages.StickerSet)) {
    throw new Error(`Unexpected sticker set response: ${result?.className ?? typeof result}`);
  }
  if (result.set?.masks || result.set?.emojis) {
    throw new Error("Expected a regular static sticker set");
  }
}

async function uploadStickerMedia(client, path, emoji) {
  const metadata = await stat(path);
  const fileName = basename(path);
  const file = await client.uploadFile({
    file: new CustomFile(fileName, metadata.size, path),
    workers: 1
  });
  const media = new Api.InputMediaUploadedDocument({
    file,
    mimeType: mimeTypeForPath(path),
    attributes: [
      new Api.DocumentAttributeImageSize({ w: 512, h: 512 }),
      new Api.DocumentAttributeSticker({
        alt: emoji,
        stickerset: new Api.InputStickerSetEmpty()
      }),
      new Api.DocumentAttributeFilename({ fileName })
    ]
  });
  const result = await client.invoke(new Api.messages.UploadMedia({
    peer: new Api.InputPeerSelf(),
    media
  }));
  if (!(result instanceof Api.MessageMediaDocument) || result.document === undefined) {
    throw new Error(`Unexpected upload media response: ${result?.className ?? typeof result}`);
  }
  return result;
}

function mimeTypeForPath(path) {
  if (path.toLowerCase().endsWith(".webp")) {
    return "image/webp";
  }
  if (path.toLowerCase().endsWith(".png")) {
    return "image/png";
  }
  throw new Error(`Unsupported sticker format: ${path}`);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function stickerSetLink(shortName) {
  return `https://t.me/addstickers/${shortName}`;
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
