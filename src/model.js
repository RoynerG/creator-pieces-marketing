export const WIDTH = 1080;
export const HEIGHT = 1350;
export const MAX_PHOTOS = 10;
export const defaults = {
  operation: "EN VENTA",
  propertyType: "Apartamento",
  location: "",
  reference: "",
  bedrooms: "3",
  bathrooms: "2",
  area: "100",
  navy: "#041e4d",
  accent: "#ffcc00",
  secondary: "#8b9098",
  logoSize: 120,
  logoPosition: "right",
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function containRect(iw, ih, tw, th) {
  const scale = Math.min(tw / iw, th / ih);
  const width = Math.min(tw, iw * scale),
    height = Math.min(th, ih * scale);
  return { x: (tw - width) / 2, y: (th - height) / 2, width, height };
}
export function safeFilename(value) {
  return (
    String(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50) || "inmueble"
  );
}
function numeric(value, max) {
  if (value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(clamp(n, 0, max)) : "";
}
export function normalizeSettings(input = {}) {
  const settings = { ...defaults };
  for (const key of ["location", "reference", "propertyType"])
    settings[key] = String(input[key] ?? defaults[key]).slice(
      0,
      key === "reference" ? 24 : 60,
    );
  settings.operation =
    input.operation === "EN ARRIENDO" ? "EN ARRIENDO" : "EN VENTA";
  for (const key of ["navy", "accent", "secondary"])
    if (/^#[0-9a-f]{6}$/i.test(input[key])) settings[key] = input[key];
  for (const key of ["bedrooms", "bathrooms", "area"])
    settings[key] = numeric(
      input[key] ?? defaults[key],
      key === "area" ? 9999999 : 99,
    );
  settings.logoSize = clamp(Number(input.logoSize) || 120, 60, 200);
  settings.logoPosition = input.logoPosition === "left" ? "left" : "right";
  return settings;
}
export function validateProject(data) {
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.photos) ||
    data.photos.length > MAX_PHOTOS ||
    !data.settings ||
    typeof data.settings !== "object"
  )
    throw new Error("Este archivo no es un proyecto válido de Piezas.");
  const validImage = (value) =>
    typeof value === "string" &&
    /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(value);
  if (data.logo && !validImage(data.logo))
    throw new Error("El logo del proyecto no es válido.");
  return {
    version: 1,
    settings: normalizeSettings(data.settings),
    logo: data.logo || null,
    photos: data.photos.map((photo) => {
      if (!photo || !validImage(photo.src))
        throw new Error("Una foto del proyecto no es válida.");
      return {
        name: String(photo.name || "Fotografía").slice(0, 120),
        src: photo.src,
      };
    }),
  };
}
