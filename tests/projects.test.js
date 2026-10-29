import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openProjectDatabase } from "../server/projects.js";
import { startDesktopServer } from "../server/desktop-server.js";
import { defaults } from "../src/model.js";
import { migrateLocalConfig } from "../server/data-path.js";

const project = (code, location = "Manga") => ({
  version: 1,
  settings: { ...defaults, reference: code, location },
  photos: [{ name: "Sala", src: "data:image/png;base64,YQ==" }],
  description: { reference: code, output: "Mi publicación" },
});
async function temp(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "piezas-sqlite-"));
  return dir;
}

test("SQLite retains separate publications, photos and drafts after reopening", async (t) => {
  const dir = await temp(t);
  let db = openProjectDatabase(dir);
  db.save(project("12238"), "12238");
  db.save(project("12266", "Bocagrande"), "12266");
  db.close();
  db = openProjectDatabase(dir);
  t.after(() => db.close());
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(
    db.read("publication:12238").project.photos[0].src,
    "data:image/png;base64,YQ==",
  );
  assert.equal(
    db.read("publication:12266").project.settings.location,
    "Bocagrande",
  );
  assert.equal(db.read("draft").settings.reference, "12266");
  assert.equal(db.list().length, 2);
  assert.equal("project" in db.list()[0], false);
});

test("stale saves cannot overwrite either the current publication or draft", async (t) => {
  const dir = await temp(t),
    one = openProjectDatabase(dir),
    two = openProjectDatabase(dir);
  t.after(() => {
    two.close();
    one.close();
  });
  t.after(() => rm(dir, { recursive: true, force: true }));
  one.save(project("12238"), "12238");
  two.save(project("12238", "Actualizada"), "12238", 1);
  assert.throws(
    () => one.save(project("12238", "Obsoleta"), "12238", 1),
    (error) => error.status === 409,
  );
  assert.equal(one.read("publication:12238").revision, 2);
  assert.equal(one.read("draft").settings.location, "Actualizada");
  assert.throws(
    () => one.save(project("12238"), "999"),
    (error) => error.status === 400,
  );
});

test("browser migration is idempotent and preserves newer SQLite changes", async (t) => {
  const dir = await temp(t),
    db = openProjectDatabase(dir);
  t.after(() => db.close());
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(
    db.migrate("publication:12238", project("12238")).imported,
    true,
  );
  db.save(project("12238", "Nueva"), "12238", 1);
  assert.equal(
    db.migrate("publication:12238", project("12238", "Vieja")).imported,
    false,
  );
  assert.equal(db.read("publication:12238").project.settings.location, "Nueva");
  assert.equal(db.migrate("draft", project("12266")).imported, false);
  assert.equal(db.read("draft").settings.reference, "12238");
  assert.throws(() => db.migrate("publication:../bad", project("../bad")));
});

test("pre-update backup is a complete independently readable database", async (t) => {
  const dir = await temp(t),
    db = openProjectDatabase(dir);
  t.after(() => db.close());
  t.after(() => rm(dir, { recursive: true, force: true }));
  db.save(project("12238"), "12238");
  const backup = new DatabaseSync(db.backup(), { readOnly: true });
  db.save(project("12238", "Cambió después"), "12238", 1);
  const saved = JSON.parse(
    backup.prepare("SELECT project FROM publications WHERE code=?").get("12238")
      .project,
  );
  assert.equal(saved.settings.location, "Manga");
  backup.close();
});

test("desktop server serves bundled app and guarded SQLite API without exposing data files", async (t) => {
  const dir = await temp(t),
    dist = path.join(dir, "dist");
  await mkdir(dist);
  await writeFile(
    path.join(dist, "index.html"),
    "<!doctype html><title>Piezas</title>",
  );
  await writeFile(path.join(dir, "private.txt"), "private");
  const server = await startDesktopServer({ directory: dir, dist, port: 0 });
  t.after(() => server.close());
  t.after(() => rm(dir, { recursive: true, force: true }));
  const home = await fetch(server.url);
  assert.equal(home.status, 200);
  assert.match(
    home.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  const send = (body, origin = server.url) =>
    fetch(server.url + "/api/projects/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await send({ project: project("12238"), code: "12238", revision: 0 }))
      .status,
    200,
  );
  assert.equal(
    (await send({ project: project("12238"), code: "12238", revision: 0 }))
      .status,
    409,
  );
  assert.equal(
    (
      await send(
        { project: project("12238"), code: "12238", revision: 1 },
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  for (const target of [
    "/publicaciones.sqlite",
    "/../private.txt",
    "/%2e%2e%5cprivate.txt",
    "/.local/minimax.json",
  ]) {
    assert.equal((await fetch(server.url + target)).status, 404);
  }
  const list = await (await fetch(server.url + "/api/projects/list")).json();
  assert.equal(list[0].code, "12238");
});

test("legacy configuration migrates once and cannot resurrect a forgotten key", async (t) => {
  const dir = await temp(t);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const old = path.join(dir, "repo"),
    destination = path.join(dir, "data");
  await mkdir(path.join(old, ".local"), { recursive: true });
  await writeFile(
    path.join(old, ".local", "minimax.json"),
    JSON.stringify({ apiKey: "sk-cp-fake-test-only", model: "MiniMax-M3" }),
  );
  await migrateLocalConfig(old, destination);
  const keyFile = path.join(destination, ".local", "minimax.json");
  await rm(keyFile);
  await migrateLocalConfig(old, destination);
  const { access } = await import("node:fs/promises");
  await assert.rejects(access(keyFile), { code: "ENOENT" });
});
