import path from "node:path";
import os from "node:os";
import { mkdir, copyFile, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
export function dataDirectory() {
  return (
    process.env.PIEZAS_DATA_DIR ||
    path.join(
      process.env.APPDATA || path.join(os.homedir(), ".config"),
      "Piezas Estudio",
    )
  );
}
export async function migrateLocalConfig(repository, destination) {
  await mkdir(path.join(destination, ".local"), { recursive: true });
  const marker = path.join(destination, ".local", "repository-config-migrated");
  try {
    await access(marker);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const file of ["minimax.json", "photo-library.json"]) {
    try {
      await copyFile(
        path.join(repository, ".local", file),
        path.join(destination, ".local", file),
        constants.COPYFILE_EXCL,
      );
    } catch (error) {
      if (!["ENOENT", "EEXIST"].includes(error.code)) throw error;
    }
  }
  await writeFile(marker, "Migración completada.\n");
}
