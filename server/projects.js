import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { validateProject } from "../src/model.js";
import { validCode } from "../src/publications-store.js";
import { assertLocalRequest } from "./minimax.js";
import { ApiError } from "./captions.js";

export function openProjectDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "publicaciones.sqlite");
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;",
  );
  if (db.prepare("PRAGMA user_version").get().user_version > 1) {
    db.close();
    throw new Error(
      "Esta base de datos requiere una versión más reciente de Piezas.",
    );
  }
  db.exec(`CREATE TABLE IF NOT EXISTS publications (code TEXT PRIMARY KEY, project TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL, location TEXT NOT NULL, photos INTEGER NOT NULL, has_description INTEGER NOT NULL, thumbnail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS drafts (key TEXT PRIMARY KEY, project TEXT NOT NULL);
    PRAGMA user_version=1;`);
  const select = db.prepare(
    "SELECT project, revision, updated_at FROM publications WHERE code=?",
  );
  const draft = db.prepare("SELECT project FROM drafts WHERE key=?");
  const putDraft = db.prepare(
    "INSERT INTO drafts(key,project) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET project=excluded.project",
  );
  const put = db.prepare(
    "INSERT INTO publications VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET project=excluded.project,revision=excluded.revision,updated_at=excluded.updated_at,location=excluded.location,photos=excluded.photos,has_description=excluded.has_description,thumbnail=excluded.thumbnail",
  );
  function normalize(project, code) {
    let clean;
    try {
      clean = validateProject(project);
    } catch (error) {
      throw new ApiError(400, error.message);
    }
    if (code) {
      if (!validCode(code) || clean.settings.reference !== code)
        throw new ApiError(400, "El código no coincide con la publicación.");
      clean.description.reference = code;
    }
    return clean;
  }
  function thumbnail(value) {
    return typeof value === "string" &&
      value.length < 200000 &&
      /^data:image\/(jpeg|png);base64,[a-zA-Z0-9+/=]+$/.test(value)
      ? value
      : "";
  }
  function write(clean, code, revision, image, updatedAt = Date.now()) {
    put.run(
      code,
      JSON.stringify(clean),
      revision,
      updatedAt,
      clean.settings.location,
      clean.photos.length,
      clean.description.output.trim() ? 1 : 0,
      thumbnail(image),
    );
    return { revision, updatedAt };
  }
  return {
    filename,
    close() {
      db.close();
    },
    read(key) {
      if (key.startsWith("publication:")) {
        const row = select.get(key.slice(12));
        return row
          ? {
              project: JSON.parse(row.project),
              revision: row.revision,
              updatedAt: row.updated_at,
            }
          : null;
      }
      if (!["draft", "legacy-uncoded-draft"].includes(key))
        throw new ApiError(400, "Registro no válido.");
      const row = draft.get(key);
      return row ? JSON.parse(row.project) : null;
    },
    list() {
      return db
        .prepare(
          "SELECT code, updated_at AS updatedAt, location, photos, has_description AS description, thumbnail FROM publications ORDER BY updated_at DESC",
        )
        .all()
        .map((row) => ({ ...row, description: !!row.description }));
    },
    archiveLegacy(project) {
      putDraft.run("legacy-uncoded-draft", JSON.stringify(normalize(project)));
    },
    save(project, code, expectedRevision = 0, image = "") {
      const clean = normalize(project, code);
      db.exec("BEGIN IMMEDIATE");
      try {
        let result = null;
        if (code) {
          if ((select.get(code)?.revision || 0) !== expectedRevision)
            throw new ApiError(
              409,
              "Esta publicación cambió en otra ventana. Guarda una copia .piezas y recarga la app.",
            );
          result = write(clean, code, expectedRevision + 1, image);
        }
        putDraft.run("draft", JSON.stringify(clean));
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    migrate(key, project, image = "") {
      if (key.startsWith("publication:")) {
        const code = key.slice(12),
          clean = normalize(project, code);
        db.exec("BEGIN IMMEDIATE");
        try {
          const existing = select.get(code);
          if (!existing) write(clean, code, 1, image);
          db.exec("COMMIT");
          return { imported: !existing };
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      if (!["draft", "legacy-uncoded-draft"].includes(key))
        throw new ApiError(400, "Registro de migración no válido.");
      const clean = normalize(project);
      const result = db
        .prepare("INSERT OR IGNORE INTO drafts(key,project) VALUES (?,?)")
        .run(key, JSON.stringify(clean));
      return { imported: result.changes > 0 };
    },
    backup() {
      const folder = path.join(directory, "backups");
      mkdirSync(folder, { recursive: true });
      const target = path.join(folder, `publicaciones-${Date.now()}.sqlite`);
      if (!existsSync(target))
        db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
      return target;
    },
  };
}
async function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
    throw new ApiError(415, "Se requiere JSON.");
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 150 * 1024 * 1024)
      throw new ApiError(413, "El proyecto supera los 150 MB.");
    chunks.push(chunk);
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks));
    if (!input || typeof input !== "object") throw new Error();
    return input;
  } catch {
    throw new ApiError(400, "Solicitud no válida.");
  }
}
export function createProjectsMiddleware(store) {
  return async (req, res, next) => {
    if (!(req.url || "").startsWith("/api/projects/")) return next();
    const reply = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    try {
      assertLocalRequest(req);
      const url = new URL(req.url, "http://localhost");
      if (req.method === "GET") {
        if (url.pathname === "/api/projects/status")
          return reply(200, { storage: "sqlite" });
        if (url.pathname === "/api/projects/list")
          return reply(200, store.list());
        if (url.pathname === "/api/projects/read")
          return reply(200, store.read(url.searchParams.get("key") || ""));
      }
      if (req.method === "POST") {
        const input = await readJson(req);
        if (url.pathname === "/api/projects/save")
          return reply(
            200,
            store.save(
              input.project,
              input.code || "",
              input.revision,
              input.thumbnail,
            ),
          );
        if (url.pathname === "/api/projects/legacy") {
          store.archiveLegacy(input.project);
          return reply(200, { saved: true });
        }
        if (url.pathname === "/api/projects/migrate")
          return reply(
            200,
            store.migrate(
              String(input.key || ""),
              input.project,
              input.thumbnail,
            ),
          );
      }
      throw new ApiError(404, "Ruta no encontrada.");
    } catch (error) {
      reply(error instanceof ApiError ? error.status : 500, {
        error:
          error instanceof ApiError
            ? error.message
            : "No se pudo guardar en SQLite. Revisa el espacio y los permisos del equipo.",
      });
    }
  };
}
