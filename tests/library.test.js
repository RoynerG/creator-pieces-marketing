import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLibraryMiddleware } from "../server/library.js";
import { publicationZipName, validCode } from "../src/publications-store.js";
test("ZIP uses only the publication code and rejects unsafe or missing IDs", () => {
  assert.equal(publicationZipName("12238"), "12238.zip");
  for (const code of ["", "../secret", "a/b", "a\\b", "a".repeat(25)]) {
    assert.equal(validCode(code), false);
    assert.throws(() => publicationZipName(code));
  }
});
test("local photo library lists codes, orders images naturally and restricts access to the selected root", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "piezas-library-test-"));
  const photos = path.join(root, "Fotos");
  await mkdir(path.join(photos, "12238"), { recursive: true });
  for (const name of ["10.jpeg", "2.jpeg", "1.jpeg"])
    await writeFile(path.join(photos, "12238", name), "test-image");
  await writeFile(path.join(photos, "12238", "private.txt"), "private");
  await mkdir(path.join(root, "outside"));
  await writeFile(path.join(root, "outside", "secret.jpeg"), "secret");
  await symlink(
    path.join(root, "outside"),
    path.join(photos, "999"),
    process.platform === "win32" ? "junction" : "dir",
  );
  let middleware = createLibraryMiddleware({ root, defaultPath: photos });
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/library/`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  let result = await (await fetch(base + "folders")).json();
  assert.ok(result.folders.includes("12238"));
  result = await (await fetch(base + "photos?code=12238")).json();
  assert.deepEqual(
    result.files.map((f) => f.name),
    ["1.jpeg", "2.jpeg", "10.jpeg"],
  );
  const image = await fetch(base + "image?code=12238&name=1.jpeg");
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.equal(await image.text(), "test-image");
  for (const query of [
    "photos?code=..",
    "image?code=12238&name=..%2Fprivate.txt",
    "image?code=12238&name=private.txt",
    "image?code=999&name=secret.jpeg",
  ])
    assert.ok((await fetch(base + query)).status >= 400);
  assert.equal(
    (
      await fetch(base + "folders", {
        headers: { Origin: "https://other.example" },
      })
    ).status,
    403,
  );
  const post = (data) =>
    fetch(base + "config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  assert.equal((await post({ directory: "../elsewhere" })).status, 400);
  assert.equal((await post({ directory: photos })).status, 200);
  middleware = createLibraryMiddleware({
    root,
    defaultPath: path.join(root, "missing"),
  });
  assert.equal((await fetch(base + "folders")).status, 200);
});
