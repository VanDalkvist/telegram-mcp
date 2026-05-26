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

const REGULAR_STICKER_SET_LIMIT = 120;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.manifest === undefined) {
    throw new Error("Missing --manifest /path/to/manifest.json");
  }

  const manifestPath = resolve(args.manifest);
  const baseDir = resolve(args.baseDir ?? dirname(manifestPath));
  const statePath = resolve(args.state ?? `${manifestPath}.state.json`);
  const manifest = await readManifest(manifestPath);
  const shortName = args.shortName ?? manifest.sticker_set_short_name;
  if (typeof shortName !== "string" || shortName.trim().length === 0) {
    throw new Error("Manifest must include sticker_set_short_name or pass --short-name");
  }

  const config = loadConfigFromDotenv({ cwd: process.cwd() });
  const session = await new FileSessionStore(config.sessionPath).load();
  const client = createGramJsClient(session, config);
  const state = await readState(statePath, shortName);
  const uploadedHashes = new Set(state.uploaded.map((entry) => entry.sha256));
  const requestedStickers = limitItems(
    manifest.stickers.filter((item) => !uploadedHashes.has(item.sha256)),
    args.limit
  );

  try {
    await client.connect();
    if (!(await client.checkAuthorization())) {
      throw new Error("Telegram session is not authorized");
    }

    const stickerSetInput = new Api.InputStickerSetShortName({ shortName });
    const before = await getStickerSet(client, stickerSetInput);
    assertEditableRegularStickerSet(before);

    const currentCount = Number(before.set.count ?? before.documents.length);
    const remainingCapacity = REGULAR_STICKER_SET_LIMIT - currentCount;
    if (requestedStickers.length > remainingCapacity) {
      throw new Error(
        `Sticker set capacity exceeded: current=${currentCount}, pending=${requestedStickers.length}, limit=${REGULAR_STICKER_SET_LIMIT}`
      );
    }

    console.log(JSON.stringify({
      sticker_set_short_name: shortName,
      sticker_set_title: before.set.title,
      dry_run: !args.apply,
      current_count: currentCount,
      pending_count: requestedStickers.length,
      remaining_capacity: remainingCapacity,
      state_path: statePath
    }, null, 2));

    if (!args.apply) {
      return;
    }

    for (const item of requestedStickers) {
      const absolutePath = resolve(baseDir, item.path);
      await assertStickerFile(absolutePath);
      const media = await uploadStickerMedia(client, stickerSetInput, absolutePath, item.emoji);
      const inputDocument = utils.getInputDocument(media.document);
      const result = await client.invoke(new Api.stickers.AddStickerToSet({
        stickerset: stickerSetInput,
        sticker: new Api.InputStickerSetItem({
          document: inputDocument,
          emoji: item.emoji
        })
      }));

      state.uploaded.push({
        path: item.path,
        slug: item.slug,
        text: item.text,
        emoji: item.emoji,
        sha256: item.sha256,
        sticker_set_count: Number(result.set?.count ?? 0),
        uploaded_at: new Date().toISOString()
      });
      await writeState(statePath, state);
      console.log(JSON.stringify({
        status: "uploaded",
        slug: item.slug,
        emoji: item.emoji,
        sticker_set_count: Number(result.set?.count ?? 0)
      }));

      if (args.delayMs > 0) {
        await sleep(args.delayMs);
      }
    }

    const after = await getStickerSet(client, stickerSetInput);
    console.log(JSON.stringify({
      status: "complete",
      sticker_set_short_name: shortName,
      final_count: Number(after.set.count ?? after.documents.length),
      uploaded_count: state.uploaded.length
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
      case "--short-name":
        args.shortName = readNext(argv, ++index, arg);
        break;
      case "--limit":
        args.limit = parsePositiveInt(readNext(argv, ++index, arg), arg);
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

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
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

async function readState(path, shortName) {
  if (!existsSync(path)) {
    return {
      sticker_set_short_name: shortName,
      uploaded: []
    };
  }
  const state = JSON.parse(await readFile(path, "utf-8"));
  if (state.sticker_set_short_name !== shortName) {
    throw new Error(`State file belongs to ${state.sticker_set_short_name}, expected ${shortName}`);
  }
  if (!Array.isArray(state.uploaded)) {
    throw new Error("State file uploaded field must be an array");
  }
  return state;
}

async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function limitItems(items, limit) {
  return limit === undefined ? items : items.slice(0, limit);
}

async function getStickerSet(client, stickerSetInput) {
  const result = await client.invoke(new Api.messages.GetStickerSet({
    stickerset: stickerSetInput,
    hash: 0
  }));
  if (!(result instanceof Api.messages.StickerSet)) {
    throw new Error(`Unexpected sticker set response: ${result?.className ?? typeof result}`);
  }
  return result;
}

function assertEditableRegularStickerSet(result) {
  if (!result.set?.creator) {
    throw new Error("Current Telegram account is not the creator of this sticker set");
  }
  if (result.set.masks || result.set.emojis) {
    throw new Error("Only regular static sticker sets are supported by this runner");
  }
}

async function assertStickerFile(path) {
  const metadata = await stat(path);
  if (!metadata.isFile()) {
    throw new Error(`Sticker path is not a file: ${path}`);
  }
  if (metadata.size > 512 * 1024) {
    throw new Error(`Sticker exceeds 512 KB: ${path}`);
  }
}

async function uploadStickerMedia(client, stickerSetInput, path, emoji) {
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
        stickerset: stickerSetInput
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

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
