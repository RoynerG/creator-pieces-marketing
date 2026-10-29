import {
  readdir,
  realpath,
  stat,
  readFile,
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { assertLocalRequest } from "./minimax.js";
import { ApiError } from "./captions.js";
import { validCode } from "../src/publications-store.js";

const types = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
function inside(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}
function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
export function createLibraryMiddleware({
  root,
  defaultPath = path.join(
    os.homedir(),
    "OneDrive",
    "Personales",
    "Freelancer",
    "Go",
    "Fotos",
  ),
}) {
  const configFile = path.join(root, ".local", "photo-library.json");
  let directory = defaultPath;
  const ready = readFile(configFile, "utf8")
    .then((text) => {
      const saved = JSON.parse(text);
      if (
        typeof saved.directory === "string" &&
        path.isAbsolute(saved.directory)
      )
        directory = saved.directory;
    })
    .catch(() => {});
  async function folder(code) {
    if (!validCode(code))
      throw new ApiError(400, "Código de carpeta no válido.");
    const base = await realpath(directory),
      resolved = await realpath(path.join(base, code));
    if (!inside(base, resolved) || !(await stat(resolved)).isDirectory())
      throw new ApiError(403, "La carpeta debe estar dentro de Fotos.");
    return resolved;
  }
  return async (req, res, next) => {
    if (!(req.url || "").startsWith("/api/library/")) return next();
    try {
      assertLocalRequest(req);
      await ready;
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/api/library/config" && req.method === "GET")
        return json(res, 200, { directory });
      if (url.pathname === "/api/library/config" && req.method === "POST") {
        if (
          !/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")
        )
          throw new ApiError(415, "Se requiere JSON.");
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8000) throw new ApiError(413, "Ruta demasiado larga.");
          chunks.push(chunk);
        }
        let input;
        try {
          input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          throw new ApiError(400, "La configuración no es válida.");
        }
        const candidate =
          typeof input?.directory === "string"
            ? input.directory.trim().replace(/^"|"$/g, "")
            : "";
        if (!path.isAbsolute(candidate))
          throw new ApiError(
            400,
            "Introduce la ruta completa de la carpeta Fotos.",
          );
        const resolved = await realpath(candidate);
        if (!(await stat(resolved)).isDirectory())
          throw new ApiError(400, "La ruta debe ser una carpeta.");
        await mkdir(path.dirname(configFile), { recursive: true });
        await writeFile(configFile, JSON.stringify({ directory: resolved }));
        directory = resolved;
        return json(res, 200, { directory });
      }
      if (req.method !== "GET") throw new ApiError(405, "Método no permitido.");
      if (url.pathname === "/api/library/folders") {
        const entries = await readdir(directory, { withFileTypes: true });
        return json(res, 200, {
          directory,
          folders: entries
            .filter((entry) => entry.isDirectory() && validCode(entry.name))
            .map((entry) => entry.name)
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
        });
      }
      if (url.pathname === "/api/library/photos") {
        const code = url.searchParams.get("code"),
          location = await folder(code);
        const entries = await readdir(location, { withFileTypes: true });
        const files = entries
          .filter(
            (entry) =>
              entry.isFile() && types[path.extname(entry.name).toLowerCase()],
          )
          .map((entry) => entry.name)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        return json(res, 200, {
          code,
          files: files.map((name) => ({
            name,
            url: `/api/library/image?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`,
          })),
        });
      }
      if (url.pathname === "/api/library/image") {
        const location = await folder(url.searchParams.get("code")),
          name = url.searchParams.get("name") || "",
          type = types[path.extname(name).toLowerCase()];
        if (!name || /[\\/:\x00]/.test(name) || !type)
          throw new ApiError(400, "Archivo de imagen no válido.");
        const resolved = await realpath(path.join(location, name));
        if (!inside(location, resolved))
          throw new ApiError(
            403,
            "La imagen debe estar dentro de la carpeta del inmueble.",
          );
        const info = await stat(resolved);
        if (!info.isFile() || info.size > 25 * 1024 * 1024)
          throw new ApiError(
            413,
            "La imagen supera los 25 MB o no es un archivo.",
          );
        const bytes = await readFile(resolved);
        res.writeHead(200, {
          "Content-Type": type,
          "Content-Length": bytes.length,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "same-origin",
        });
        res.end(bytes);
        return;
      }
      throw new ApiError(404, "Ruta no encontrada.");
    } catch (error) {
      const status =
        error instanceof ApiError
          ? error.status
          : error.code === "ENOENT"
            ? 404
            : 500;
      json(res, status, {
        error:
          error instanceof ApiError
            ? error.message
            : "No se pudo leer la carpeta. Revisa la ruta y que los archivos de OneDrive estén disponibles en este equipo.",
      });
    }
  };
}
