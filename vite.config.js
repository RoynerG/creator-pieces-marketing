import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { createMiniMaxMiddleware } from "./server/minimax.js";
import { createLibraryMiddleware } from "./server/library.js";
import { dataDirectory, migrateLocalConfig } from "./server/data-path.js";
import {
  openProjectDatabase,
  createProjectsMiddleware,
} from "./server/projects.js";
const root = fileURLToPath(new URL(".", import.meta.url));
async function setup(server) {
  const directory = dataDirectory();
  await migrateLocalConfig(root, directory);
  const store = openProjectDatabase(directory);
  server.middlewares.use(createProjectsMiddleware(store));
  server.middlewares.use(createMiniMaxMiddleware({ root: directory }));
  server.middlewares.use(createLibraryMiddleware({ root: directory }));
  server.httpServer?.once("close", () => store.close());
}
export default defineConfig({
  server: {
    host: "127.0.0.1",
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.local/**"],
    },
  },
  preview: { host: "127.0.0.1" },
  plugins: [
    {
      name: "piezas-local-minimax",
      configureServer: setup,
      configurePreviewServer: setup,
    },
  ],
});
