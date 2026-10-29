import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createMiniMaxMiddleware, assertLocalRequest } from "./minimax.js";
import { createLibraryMiddleware } from "./library.js";
import { openProjectDatabase, createProjectsMiddleware } from "./projects.js";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
export async function startDesktopServer({ directory, dist, port = 17838 }) {
  const store = openProjectDatabase(directory);
  const middleware = [
    createProjectsMiddleware(store),
    createMiniMaxMiddleware({ root: directory }),
    createLibraryMiddleware({ root: directory }),
  ];
  const server = createServer(async (req, res) => {
    try {
      assertLocalRequest(req);
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      let index = 0;
      const next = async () => {
        if (index < middleware.length)
          return middleware[index++](req, res, next);
        if (!["GET", "HEAD"].includes(req.method)) {
          res.writeHead(405);
          res.end();
          return;
        }
        const pathname = decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        );
        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        const target = path.resolve(dist, relative),
          rel = path.relative(dist, target);
        if (
          rel.startsWith("..") ||
          path.isAbsolute(rel) ||
          !types[path.extname(target)] ||
          /(^|[\\/])\./.test(relative) ||
          relative.startsWith("demo/")
        ) {
          res.writeHead(404);
          res.end();
          return;
        }
        const info = await stat(target);
        if (!info.isFile()) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": types[path.extname(target)],
          "Cache-Control": "no-store",
        });
        res.end(req.method === "HEAD" ? undefined : await readFile(target));
      };
      await next();
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(error.code === "ENOENT" ? 404 : error.status || 500);
        res.end("No se pudo completar la solicitud local.");
      } else res.end();
    }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    store.close();
    throw error;
  }
  return {
    store,
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      store.close();
    },
  };
}
