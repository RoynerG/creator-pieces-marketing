import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  savePieceFolder,
  savePieceVideo,
  validatePieceExport,
} from "../desktop/export-folder.js";
import {
  exportFolderName,
  pieceFilename,
  saveBrowserFolder,
  saveBrowserVideo,
} from "../src/export-files.js";

// Header fixture tests the export boundary; PNG rendering is handled by Canvas.
function pngHeader(marker = 0) {
  const bytes = Buffer.alloc(25);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(1080, 16);
  bytes.writeUInt32BE(1350, 20);
  bytes[24] = marker;
  return bytes;
}
test("the video stays with its post when images are saved or replaced", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "piezas-post-video-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const source = path.join(parent, "final.mp4");
  await writeFile(source, "uno");
  const saved = await savePieceVideo(parent, "12238", source);
  assert.equal(saved.file, path.join(parent, "12238", "video", "12238.mp4"));
  await writeFile(source, "dos");
  await savePieceVideo(parent, "12238", source);
  assert.equal(await readFile(saved.file, "utf8"), "dos");
  assert.equal(
    await readFile(
      path.join(parent, "12238", "video", "12238 - anterior.mp4"),
      "utf8",
    ),
    "uno",
  );
  const pieces = { code: "12238", images: [pngHeader()] };
  const first = await savePieceFolder(parent, pieces, () => {
    throw new Error("solo hay video: no debe preguntar");
  });
  assert.equal(first.backup, undefined);
  assert.equal(await readFile(saved.file, "utf8"), "dos");
  assert.equal(existsSync(path.join(parent, "12238", "1.png")), true);
  const second = await savePieceFolder(parent, pieces, async () => "replace");
  assert.equal(await readFile(saved.file, "utf8"), "dos");
  assert.equal(existsSync(path.join(second.backup, "1.png")), true);
  assert.equal(existsSync(path.join(second.backup, "video")), false);
});

test("folder export preserves carousel order and leaves existing exports untouched", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "piezas-folder-"));
  try {
    const images = Array.from({ length: 10 }, (_, i) => pngHeader(i));
    const result = await savePieceFolder(root, { code: "12238", images });
    assert.equal(result.folder, path.join(root, "12238"));
    assert.equal(result.count, 10);
    assert.deepEqual(
      (await readdir(result.folder)).sort(),
      images.map((_, i) => pieceFilename(i)).sort(),
    );
    for (let i = 0; i < 10; i++)
      assert.deepEqual(
        await readFile(path.join(result.folder, pieceFilename(i))),
        images[i],
      );
    await writeFile(path.join(result.folder, "nota.txt"), "Conservar");
    await assert.rejects(
      savePieceFolder(root, { code: "12238", images: [pngHeader(99)] }),
      /Ya existe/,
    );
    assert.deepEqual(
      await readFile(path.join(result.folder, "1.png")),
      images[0],
    );
    assert.equal(
      await readFile(path.join(result.folder, "nota.txt"), "utf8"),
      "Conservar",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("export refuses unsafe Windows names, missing images and invalid PNG dimensions", () => {
  for (const code of ["../12238", "C:\\Fotos", "CON", "NUL", "LPT1", ""])
    assert.throws(() => exportFolderName(code));
  assert.throws(() => validatePieceExport({ code: "12238", images: [] }));
  assert.throws(() =>
    validatePieceExport({ code: "12238", images: Array(11).fill(pngHeader()) }),
  );
  assert.throws(() =>
    validatePieceExport({ code: "12238", images: [new Uint8Array([1, 2, 3])] }),
  );
  const wrong = pngHeader();
  wrong.writeUInt32BE(3001, 16);
  assert.throws(() => validatePieceExport({ code: "12238", images: [wrong] }));
  wrong.writeUInt32BE(0, 16);
  assert.throws(() => validatePieceExport({ code: "12238", images: [wrong] }));
});

test("folder export rejects any piece with a different size from the cover", () => {
  for (const [w, h] of [
    [1600, 900],
    [1200, 1200],
    [900, 1600],
  ]) {
    const bytes = pngHeader();
    bytes.writeUInt32BE(w, 16);
    bytes.writeUInt32BE(h, 20);
    assert.throws(() =>
      validatePieceExport({ code: "12238", images: [pngHeader(), bytes] }),
    );
  }
});

class MemoryFolder {
  kind = "directory";
  items = new Map();
  async getDirectoryHandle(name, { create } = {}) {
    if (!this.items.has(name)) {
      if (!create)
        throw Object.assign(new Error(name), { name: "NotFoundError" });
      this.items.set(name, new MemoryFolder());
    }
    return this.items.get(name);
  }
  async getFileHandle(name) {
    if (!this.items.has(name))
      this.items.set(name, {
        kind: "file",
        content: null,
        getFile() {
          return this.content;
        },
        createWritable() {
          return {
            write: async (content) => (this.content = content),
            close: async () => {},
            abort: async () => {},
          };
        },
      });
    return this.items.get(name);
  }
  async removeEntry(name) {
    this.items.delete(name);
  }
  async *keys() {
    yield* this.items.keys();
  }
  async *entries() {
    yield* this.items.entries();
  }
}
test("browser export keeps the video with its post", async () => {
  const parent = new MemoryFolder();
  assert.equal(
    await saveBrowserVideo(parent, "12238", "mp4"),
    "12238/video/12238.mp4",
  );
  const first = await saveBrowserFolder(parent, "12238", [pngHeader()], () => {
    throw new Error("solo hay video: no debe preguntar");
  });
  assert.equal(first.backup, undefined);
  const second = await saveBrowserFolder(
    parent,
    "12238",
    [pngHeader()],
    async () => "replace",
  );
  assert.equal(second.backup, "12238 - anterior");
  const post = await parent.getDirectoryHandle("12238");
  const video = await post.getDirectoryHandle("video");
  assert.equal((await video.getFileHandle("12238.mp4")).content, "mp4");
});

test("browser folder export refuses an existing folder before opening any file", async () => {
  let writes = 0;
  const parent = {
    getDirectoryHandle: async () => ({
      keys: async function* () {
        yield "1.png";
      },
      getFileHandle: async () => {
        writes++;
      },
    }),
  };
  await assert.rejects(
    saveBrowserFolder(parent, "12238", [pngHeader()]),
    /Ya existe/,
  );
  assert.equal(writes, 0);
});

test("replacement preserves the previous folder and removes obsolete pieces from the new export", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "piezas-replace-"));
  try {
    const original = await savePieceFolder(root, {
      code: "12238",
      images: [pngHeader(1), pngHeader(2)],
    });
    await writeFile(
      path.join(original.folder, "nota.txt"),
      "Conservar también",
    );
    const replaced = await savePieceFolder(
      root,
      { code: "12238", images: [pngHeader(3)] },
      async () => "replace",
    );
    assert.equal(path.basename(replaced.backup), "12238 - anterior");
    assert.deepEqual(await readdir(replaced.folder), ["1.png"]);
    assert.deepEqual(
      await readFile(path.join(replaced.folder, "1.png")),
      pngHeader(3),
    );
    assert.deepEqual(
      await readFile(path.join(replaced.backup, "2.png")),
      pngHeader(2),
    );
    assert.equal(
      await readFile(path.join(replaced.backup, "nota.txt"), "utf8"),
      "Conservar también",
    );
    const copy = await savePieceFolder(
      root,
      { code: "12238", images: [pngHeader(4)] },
      async () => "copy",
    );
    assert.equal(path.basename(copy.folder), "12238 (2)");
    const canceled = await savePieceFolder(
      root,
      { code: "12238", images: [pngHeader(5)] },
      async () => "cancel",
    );
    assert.equal(canceled.canceled, true);
    assert.deepEqual(
      await readFile(path.join(replaced.folder, "1.png")),
      pngHeader(3),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
