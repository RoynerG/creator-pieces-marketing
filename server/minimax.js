import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  ApiError,
  DEFAULT_MODEL,
  MODELS,
  validateCaptionRequest,
  generateCaption,
} from "./captions.js";

function send(res, status, value) {
  if (res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
    throw new ApiError(415, "Se requiere una solicitud JSON.");
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 150000)
      throw new ApiError(413, "La solicitud es demasiado grande.");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new ApiError(400, "La solicitud no es válida.");
  }
}
export function assertLocalRequest(req) {
  const host = req.headers.host || "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host))
    throw new ApiError(
      403,
      "Esta integración solo está disponible desde este equipo.",
    );
  const origin = req.headers.origin;
  if (
    (origin && origin !== `http://${host}`) ||
    req.headers["sec-fetch-site"] === "cross-site"
  )
    throw new ApiError(403, "Solicitud de otro sitio no permitida.");
}
export function createMiniMaxMiddleware({
  root,
  fetchImpl = fetch,
  timeoutMs = 120000,
} = {}) {
  const configPath = path.join(root, ".local", "minimax.json");
  let config = { apiKey: "", model: DEFAULT_MODEL, remember: false },
    active = false;
  const ready = readFile(configPath, "utf8")
    .then((text) => {
      const saved = JSON.parse(text);
      if (
        typeof saved.apiKey === "string" &&
        saved.apiKey.startsWith("sk-cp") &&
        MODELS.includes(saved.model)
      )
        config = { apiKey: saved.apiKey, model: saved.model, remember: true };
    })
    .catch(() => {});
  return async (req, res, next) => {
    const route = (req.url || "").split("?")[0];
    if (!route.startsWith("/api/ai/")) return next();
    try {
      assertLocalRequest(req);
      await ready;
      if (route === "/api/ai/config" && req.method === "GET")
        return send(res, 200, {
          configured: !!config.apiKey,
          model: config.model,
          remember: config.remember,
        });
      if (route === "/api/ai/config" && req.method === "POST") {
        if (active)
          throw new ApiError(
            409,
            "Espera a que termine la generación antes de cambiar la configuración.",
          );
        const input = await body(req);
        if (input.clear === true) {
          await rm(configPath, { force: true });
          config = { apiKey: "", model: DEFAULT_MODEL, remember: false };
          return send(res, 200, {
            configured: false,
            model: config.model,
            remember: false,
          });
        }
        const apiKey =
          typeof input.apiKey === "string" && input.apiKey.trim()
            ? input.apiKey.trim()
            : config.apiKey;
        if (!/^sk-cp[^\s]{10,500}$/.test(apiKey))
          throw new ApiError(
            400,
            "Usa la clave de suscripción de MiniMax Coding Plan (empieza por sk-cp). No se aceptan claves de pago por uso.",
          );
        if (!MODELS.includes(input.model))
          throw new ApiError(400, "Selecciona un modelo válido.");
        const updated = {
          apiKey,
          model: input.model,
          remember: input.remember === true,
        };
        if (updated.remember) {
          await mkdir(path.dirname(configPath), { recursive: true });
          await writeFile(configPath, JSON.stringify(updated), { mode: 0o600 });
        } else await rm(configPath, { force: true });
        config = updated;
        return send(res, 200, {
          configured: true,
          model: config.model,
          remember: config.remember,
        });
      }
      if (route === "/api/ai/generate" && req.method === "POST") {
        const data = validateCaptionRequest(await body(req));
        if (!config.apiKey)
          throw new ApiError(
            400,
            "Configura tu clave de MiniMax Coding Plan para generar la descripción.",
          );
        if (active)
          throw new ApiError(
            409,
            "Ya hay una descripción en proceso. Espera a que termine.",
          );
        active = true;
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), timeoutMs);
        const onClose = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.on("close", onClose);
        try {
          const result = await generateCaption({
            ...config,
            data,
            fetchImpl,
            signal: controller.signal,
          });
          send(res, 200, result);
        } finally {
          clearTimeout(timer);
          res.off("close", onClose);
          active = false;
        }
        return;
      }
      throw new ApiError(404, "Ruta no encontrada.");
    } catch (error) {
      // Never log request bodies, upstream error bodies, or credentials.
      send(res, error instanceof ApiError ? error.status : 500, {
        error:
          error instanceof ApiError
            ? error.message
            : "No se pudo completar la operación local. Intenta de nuevo.",
      });
    }
  };
}
