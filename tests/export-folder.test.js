import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  savePieceFolder,
  validatePieceExport,
} from "../desktop/export-folder.js";
import {
  exportFolderName,
  pieceFilename,
  saveBrowserFolder,
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
  wrong.writeUInt32BE(1, 16);
  assert.throws(() => validatePieceExport({ code: "12238", images: [wrong] }));
});
test("browser folder export refuses an existing folder before opening any file", async () => {
  let writes = 0;
  const parent = {
    getDirectoryHandle: async () => ({
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
