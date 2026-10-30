const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("piezasDesktop", {
  info: () => ipcRenderer.invoke("piezas:info"),
  checkUpdates: () => ipcRenderer.invoke("piezas:check-updates"),
  installUpdate: () => ipcRenderer.invoke("piezas:install-update"),
  chooseFolder: () => ipcRenderer.invoke("piezas:choose-folder"),
  exportDestination: () => ipcRenderer.invoke("piezas:export-destination"),
  chooseExportDestination: () =>
    ipcRenderer.invoke("piezas:choose-export-destination"),
  savePieces: (input) => ipcRenderer.invoke("piezas:save-pieces", input),
  openDataFolder: () => ipcRenderer.invoke("piezas:open-data"),
  readyToClose: () => ipcRenderer.send("piezas:ready-close"),
  onCloseRequested: (callback) => {
    ipcRenderer.on("piezas:close-request", () => callback());
  },
  onUpdate: (callback) => {
    ipcRenderer.on("piezas:update", (_event, state) => callback(state));
  },
});
