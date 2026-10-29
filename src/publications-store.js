export function validCode(value) {
  return (
    typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(value)
  );
}
export function publicationZipName(code) {
  if (!validCode(code))
    throw new Error(
      "Crea una publicación con un código válido antes de exportar.",
    );
  return `${code}.zip`;
}
export function createPublicationStore(database) {
  const read = (key) =>
    new Promise((resolve, reject) => {
      const request = database
        .transaction("projects", "readonly")
        .objectStore("projects")
        .get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return {
    read,
    archiveLegacy(project) {
      return new Promise((resolve, reject) => {
        const tx = database.transaction("projects", "readwrite"),
          store = tx.objectStore("projects");
        store.put(project, "legacy-uncoded-draft");
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    },
    async list() {
      return new Promise((resolve, reject) => {
        const request = database
          .transaction("projects", "readonly")
          .objectStore("projects")
          .getAll(IDBKeyRange.bound("summary:", "summary:\uffff"));
        request.onsuccess = () =>
          resolve(request.result.sort((a, b) => b.updatedAt - a.updatedAt));
        request.onerror = () => reject(request.error);
      });
    },
    save(project, code, expectedRevision = 0, thumbnail = "") {
      return new Promise((resolve, reject) => {
        const tx = database.transaction("projects", "readwrite"),
          store = tx.objectStore("projects");
        let error, record;
        if (!code) store.put(project, "draft");
        else {
          if (!validCode(code)) {
            tx.abort();
            reject(new Error("El código no es válido."));
            return;
          }
          const request = store.get(`publication:${code}`);
          request.onsuccess = () => {
            if ((request.result?.revision || 0) !== expectedRevision) {
              error = new Error(
                "Esta publicación cambió en otra pestaña. Guarda una copia .piezas y recarga la app para abrir la versión guardada.",
              );
              tx.abort();
              return;
            }
            record = {
              project,
              revision: expectedRevision + 1,
              updatedAt: Date.now(),
            };
            store.put(record, `publication:${code}`);
            store.put(
              {
                code,
                updatedAt: record.updatedAt,
                photos: project.photos.length,
                description: !!project.description?.output?.trim(),
                location: project.settings.location,
                thumbnail,
              },
              `summary:${code}`,
            );
            store.put(project, "draft");
          };
        }
        tx.oncomplete = () => resolve(record);
        tx.onerror = tx.onabort = () =>
          reject(
            error ||
              tx.error ||
              new Error(
                "No se pudo guardar la publicación. Descarga una copia .piezas.",
              ),
          );
      });
    },
  };
}
