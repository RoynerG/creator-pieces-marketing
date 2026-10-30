import { validCode } from "./publications-store.js";

export function exportFolderName(code) {
  if (!validCode(code) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(code)) {
    throw new Error(
      "Usa un código de inmueble válido para nombrar la carpeta.",
    );
  }
  return code;
}

export function pieceFilename(index) {
  if (!Number.isInteger(index) || index < 0 || index > 9) {
    throw new Error("Número de pieza no válido.");
  }
  return `${index + 1}.png`;
}

async function browserExists(parent, name) {
  try {
    await parent.getDirectoryHandle(name);
    return true;
  } catch (error) {
    if (error.name === "NotFoundError") return false;
    throw error;
  }
}
async function uniqueBrowserFolder(parent, base) {
  let name = base,
    n = 2;
  while (await browserExists(parent, name)) name = `${base} (${n++})`;
  return name;
}
async function copyBrowserDirectory(source, destination) {
  for await (const [name, entry] of source.entries()) {
    if (entry.kind === "directory")
      await copyBrowserDirectory(
        entry,
        await destination.getDirectoryHandle(name, { create: true }),
      );
    else {
      const file = await destination.getFileHandle(name, { create: true });
      const stream = await file.createWritable();
      try {
        await stream.write(await entry.getFile());
        await stream.close();
      } catch (error) {
        await stream.abort().catch(() => {});
        throw error;
      }
    }
  }
}
export async function saveBrowserFolder(parent, code, images, onConflict) {
  let name = exportFolderName(code),
    backup;
  if (await browserExists(parent, name)) {
    if (!onConflict) throw new Error(`Ya existe la carpeta ${name}.`);
    const choice = await onConflict(name);
    if (choice === "cancel") return { canceled: true };
    if (choice === "copy") name = await uniqueBrowserFolder(parent, code);
    else if (choice === "replace") {
      backup = await uniqueBrowserFolder(parent, `${code} - anterior`);
      const source = await parent.getDirectoryHandle(code);
      const destination = await parent.getDirectoryHandle(backup, {
        create: true,
      });
      // Only remove the original after every file has a complete backup.
      await copyBrowserDirectory(source, destination);
      await parent.removeEntry(code, { recursive: true });
    } else throw new Error("Elige qué hacer con la carpeta existente.");
  }
  const folder = await parent.getDirectoryHandle(name, { create: true });
  try {
    for (let i = 0; i < images.length; i++) {
      const file = await folder.getFileHandle(pieceFilename(i), {
        create: true,
      });
      const stream = await file.createWritable();
      try {
        await stream.write(images[i]);
        await stream.close();
      } catch (error) {
        await stream.abort().catch(() => {});
        throw error;
      }
    }
  } catch {
    throw new Error(
      `No se completó la exportación en ${name}.${backup ? ` La versión anterior está en ${backup}.` : ""} Revisa el espacio y los permisos.`,
    );
  }
  return { folder: name, backup, count: images.length };
}
