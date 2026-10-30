export function initExportDestination({ notice }) {
  const native = window.piezasDesktop;
  let folder, db;
  const label = document.querySelector("#export-destination");
  const show = (value) => {
    label.textContent = value
      ? `Guardar carpetas en: ${value}`
      : "Destino: elige una ubicación al guardar.";
    document.querySelector("#settings-export-destination").textContent =
      label.textContent;
  };
  const ready = (async () => {
    try {
      if (native?.exportDestination) {
        show(await native.exportDestination());
        return;
      }
      if (typeof window.showDirectoryPicker !== "function") return;
      db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("piezas-export-destination", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("settings");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      folder = await new Promise((resolve, reject) => {
        const request = db
          .transaction("settings")
          .objectStore("settings")
          .get("folder");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      show(folder?.name);
    } catch {
      /* A folder can still be selected when browser persistence is unavailable. */
    }
  })();
  async function choose() {
    if (native?.chooseExportDestination) {
      const path = await native.chooseExportDestination();
      if (path) show(path);
      return path;
    }
    const chosen = await window.showDirectoryPicker({
      mode: "readwrite",
      id: "piezas-export",
      ...(folder ? { startIn: folder } : {}),
    });
    folder = chosen;
    show(folder.name);
    await ready;
    if (db) {
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction("settings", "readwrite");
          tx.objectStore("settings").put(chosen, "folder");
          tx.oncomplete = resolve;
          tx.onerror = tx.onabort = () => reject(tx.error);
        });
      } catch {
        notice(
          "La ubicación se usará en esta sesión; el navegador no permitió recordarla.",
        );
      }
    }
    folder = chosen;
    show(folder.name);
    return folder;
  }
  document
    .querySelector("#configure-export")
    .addEventListener("click", async () => {
      try {
        await choose();
      } catch (error) {
        if (error.name !== "AbortError") notice(error.message, true);
      }
    });
  return {
    show,
    async prepare() {
      await ready;
      if (!folder) return choose();
      try {
        if (
          (await folder.requestPermission({ mode: "readwrite" })) === "granted"
        )
          return folder;
      } catch {
        /* A removed or disconnected folder can be selected again. */
      }
      return choose();
    },
  };
}

export function resolveExportConflict(name) {
  const dialog = document.querySelector("#export-conflict-dialog");
  document.querySelector("#export-conflict-description").textContent =
    `Ya existe la carpeta ${name} en esta ubicación.`;
  dialog.returnValue = "cancel";
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue || "cancel"),
      { once: true },
    );
    dialog.showModal();
  });
}
