import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { createMiniMaxMiddleware } from "./server/minimax.js";
const root = fileURLToPath(new URL(".", import.meta.url));
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
      configureServer(server) {
        server.middlewares.use(createMiniMaxMiddleware({ root }));
      },
      configurePreviewServer(server) {
        server.middlewares.use(createMiniMaxMiddleware({ root }));
      },
    },
  ],
});
