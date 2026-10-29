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
export function createLegacyPublicationStore(database) {
  const read = (key) =>
    new Promise((resolve, reject) => {
      const request = database
        .transaction("projects", "readonly")
        .objectStore("projects")
        .get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return { read };
}

export function createPublicationStore() {
  async function request(route, input) {
    let response;
    try {
      response = await fetch(
        `/api/projects/${route}`,
        input
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            }
          : {},
      );
    } catch {
      throw new Error(
        "No se pudo conectar con el almacenamiento local de Piezas.",
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("Reinicia Piezas para activar SQLite.");
    }
    if (!response.ok)
      throw new Error(result.error || "No se pudo guardar la publicación.");
    return result;
  }
  return {
    status: () => request("status"),
    read: (key) => request(`read?key=${encodeURIComponent(key)}`),
    list: () => request("list"),
    archiveLegacy: (project) => request("legacy", { project }),
    save: (project, code, revision = 0, thumbnail = "") =>
      request("save", { project, code, revision, thumbnail }),
    migrate: (key, project, thumbnail = "") =>
      request("migrate", { key, project, thumbnail }),
  };
}
export async function migrateBrowserProjects(database, store) {
  const existing = new Set(
    (await store.list()).map((item) => `publication:${item.code}`),
  );
  const legacy = createLegacyPublicationStore(database);
  const keys = await new Promise((resolve, reject) => {
    const request = database
      .transaction("projects", "readonly")
      .objectStore("projects")
      .getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let failures = 0;
  for (const key of keys) {
    if (
      typeof key !== "string" ||
      (!key.startsWith("publication:") &&
        !["draft", "legacy-uncoded-draft"].includes(key))
    )
      continue;
    if (existing.has(key)) continue;
    try {
      if (!key.startsWith("publication:") && (await store.read(key))) continue;
      const value = await legacy.read(key),
        summary = key.startsWith("publication:")
          ? await legacy.read(`summary:${key.slice(12)}`)
          : null;
      await store.migrate(
        key,
        key.startsWith("publication:") ? value.project : value,
        summary?.thumbnail || "",
      );
    } catch {
      failures++;
    }
  }
  return failures;
}
