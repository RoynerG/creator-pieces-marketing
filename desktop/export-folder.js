import path from "node:path";
import { writeFile, lstat, rename, mkdtemp } from "node:fs/promises";
import { exportFolderName, pieceFilename } from "../src/export-files.js";

export function validatePieceExport(input) {
  const code = exportFolderName(input?.code);
  if (
    !Array.isArray(input.images) ||
    input.images.length < 1 ||
    input.images.length > 10
  ) {
    throw new Error("Selecciona entre 1 y 10 piezas para exportar.");
  }
  let total = 0;
  const images = input.images.map((value) => {
    if (!(value instanceof Uint8Array))
      throw new Error("La pieza no es una imagen PNG válida.");
    const bytes = Buffer.from(value);
    total += bytes.length;
    if (
      bytes.length < 24 ||
      bytes.length > 25 * 1024 * 1024 ||
      total > 150 * 1024 * 1024 ||
      !bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.readUInt32BE(16) !== 1080 ||
      bytes.readUInt32BE(20) !== 1350
    ) {
      throw new Error(
        "Las piezas deben ser PNG de 1080 × 1350 px y hasta 25 MB cada una (150 MB en total).",
      );
    }
    return bytes;
  });
  return { code, images };
}

async function exists(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function uniquePath(parent, base) {
  let candidate = path.join(parent, base),
    n = 2;
  while (await exists(candidate))
    candidate = path.join(parent, `${base} (${n++})`);
  return candidate;
}
export async function savePieceFolder(parent, input, onConflict) {
  const { code, images } = validatePieceExport(input);
  let target = path.join(parent, code),
    backup;
  const previous = await exists(target);
  if (previous) {
    if (!previous.isDirectory() || previous.isSymbolicLink())
      throw new Error(
        `El destino ${code} no es una carpeta normal. Elige otra ubicación.`,
      );
    if (!onConflict) throw new Error(`Ya existe la carpeta ${code}.`);
    const choice = await onConflict(code);
    if (choice === "cancel") return { canceled: true };
    if (choice === "copy") target = await uniquePath(parent, code);
    else if (choice === "replace")
      backup = await uniquePath(parent, `${code} - anterior`);
    else throw new Error("Elige qué hacer con la carpeta existente.");
  }
  // Rendered files are completed before moving an existing export to backup.
  const staging = await mkdtemp(path.join(parent, `.piezas-${code}-`));
  try {
    for (let i = 0; i < images.length; i++)
      await writeFile(path.join(staging, pieceFilename(i)), images[i], {
        flag: "wx",
      });
  } catch {
    throw new Error(
      `No se completó la exportación. Revisa el espacio y los permisos. Los archivos parciales están en ${staging}; la carpeta anterior sigue intacta.`,
    );
  }
  if (backup) await rename(path.join(parent, code), backup);
  try {
    await rename(staging, target);
  } catch (error) {
    if (backup && !(await exists(target)))
      await rename(backup, path.join(parent, code));
    throw new Error(
      `No se pudo completar la carpeta. Las imágenes generadas están en ${staging}.`,
    );
  }
  return { folder: target, backup, count: images.length };
}
