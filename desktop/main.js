import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import updater from "electron-updater";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startDesktopServer } from "../server/desktop-server.js";
import { dataDirectory } from "../server/data-path.js";
const { autoUpdater } = updater;
const directory = dataDirectory();
mkdirSync(directory, { recursive: true });
app.setPath("userData", directory);
app.setName("Piezas Estudio");
let window,
  backend,
  allowClose = false,
  updateReady = false,
  updateState = {
    status: "idle",
    message: "Buscando actualizaciones al abrir…",
  };
const send = (state) => {
  updateState = state;
  window?.webContents.send("piezas:update", state);
};
const sameApp = (event) =>
  event.sender === window?.webContents &&
  event.senderFrame?.url?.startsWith(`${backend.url}/`);
function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!sameApp(event)) throw new Error("Origen no permitido.");
    return fn(...args);
  });
}
async function checkUpdates() {
  if (updateReady) return;
  if (!app.isPackaged) {
    send({
      status: "development",
      message: "Las actualizaciones se activan en la versión instalada.",
    });
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch {
    send({
      status: "error",
      message:
        "No se pudo buscar una actualización. Puedes seguir trabajando y volver a intentar.",
    });
  }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      backend = await startDesktopServer({
        directory,
        dist: path.join(app.getAppPath(), "dist"),
      });
      window = new BrowserWindow({
        width: 1320,
        height: 920,
        minWidth: 760,
        minHeight: 620,
        title: "Piezas Estudio",
        backgroundColor: "#f6f7f9",
        show: false,
        webPreferences: {
          preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== backend.url) event.preventDefault();
      });
      window.webContents.session.setPermissionRequestHandler(
        (_wc, permission, callback) =>
          callback(permission === "clipboard-sanitized-write"),
      );
      window.webContents.session.on("will-download", (_event, item) => {
        item.setSaveDialogOptions({
          title: "Guardar archivo de Piezas",
          defaultPath: path.join(
            app.getPath("downloads"),
            path.basename(item.getFilename()),
          ),
        });
      });
      handle("piezas:info", () => ({
        version: app.getVersion(),
        storage: "SQLite",
        directory,
        update: updateState,
      }));
      handle("piezas:check-updates", checkUpdates);
      handle("piezas:choose-folder", async () => {
        const result = await dialog.showOpenDialog(window, {
          title: "Selecciona la carpeta Fotos",
          properties: ["openDirectory"],
        });
        return result.canceled ? null : result.filePaths[0];
      });
      handle("piezas:open-data", () => shell.openPath(directory));
      handle("piezas:install-update", async () => {
        if (!updateReady)
          return { error: "Todavía no hay una actualización descargada." };
        backend.store.backup();
        allowClose = true;
        setImmediate(() => autoUpdater.quitAndInstall(false, true));
        return { installing: true };
      });
      ipcMain.on("piezas:ready-close", (event) => {
        if (sameApp(event)) {
          allowClose = true;
          window.close();
        }
      });
      window.on("close", (event) => {
        if (!allowClose) {
          event.preventDefault();
          window.webContents.send("piezas:close-request");
        }
      });
      window.webContents.on("render-process-gone", () => {
        allowClose = true;
        dialog.showErrorBox(
          "Piezas",
          "La ventana se cerró inesperadamente. Abre de nuevo Piezas para recuperar lo guardado.",
        );
        app.quit();
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Piezas",
            submenu: [
              { label: "Buscar actualizaciones", click: checkUpdates },
              {
                label: "Abrir carpeta de datos",
                click: () => shell.openPath(directory),
              },
              { type: "separator" },
              { label: "Salir", click: () => window.close() },
            ],
          },
          {
            label: "Editar",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "Ver",
            submenu: [
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
        ]),
      );
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = false;
      autoUpdater.allowDowngrade = false;
      autoUpdater.on("checking-for-update", () =>
        send({ status: "checking", message: "Buscando actualizaciones…" }),
      );
      autoUpdater.on("update-available", (info) =>
        send({
          status: "downloading",
          message: `Descargando Piezas ${info.version}…`,
        }),
      );
      autoUpdater.on("download-progress", (progress) =>
        send({
          status: "downloading",
          message: `Descargando actualización: ${Math.round(progress.percent)}%`,
        }),
      );
      autoUpdater.on("update-not-available", () =>
        send({
          status: "current",
          message: `Piezas ${app.getVersion()} está actualizado.`,
        }),
      );
      autoUpdater.on("update-downloaded", (info) => {
        updateReady = true;
        send({
          status: "ready",
          message: `Piezas ${info.version} está listo para instalar.`,
        });
      });
      autoUpdater.on("error", () =>
        send({
          status: "error",
          message:
            "No se pudo actualizar. Revisa tu conexión y vuelve a intentar.",
        }),
      );
      await window.loadURL(backend.url);
      window.show();
      setTimeout(checkUpdates, 8000).unref();
      setInterval(checkUpdates, 4 * 60 * 60 * 1000).unref();
    })
    .catch((error) => {
      dialog.showErrorBox(
        "No se pudo abrir Piezas",
        error.code === "EADDRINUSE"
          ? "El puerto local 17838 está ocupado. Cierra otra instancia de Piezas e intenta de nuevo."
          : error.message,
      );
      allowClose = true;
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => {
    backend?.close().catch(() => {});
  });
}
