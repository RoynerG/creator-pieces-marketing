import { normalizeDescription } from "./caption-model.js";
export const WIDTH = 1080;
export const HEIGHT = 1350;
export const MAX_PHOTOS = 10;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_TRANSITION_SECONDS = 0.5;
const VIDEO_COVER_SECONDS = 4;
const VIDEO_CLOSING_SECONDS = 3.9;
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
  videoMode: "photos",
  photoSeconds: 4,
  videoColor: "#051226",
  musicVolume: 25,
  closingMessage: "Contáctanos para ofrecerte la casa de tus sueños",
  instagram: "@goctgrealstate",
  website: "www.gocartagenarealestate.com",
};
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function containRect(iw, ih, tw, th) {
  const scale = Math.min(tw / iw, th / ih);
  const width = Math.min(tw, iw * scale),
    height = Math.min(th, ih * scale);
  return { x: (tw - width) / 2, y: (th - height) / 2, width, height };
}
export function normalizeFraming(value = {}) {
  const position = (n) =>
    Number.isFinite(Number(n)) ? clamp(Number(n), 0, 100) : 50;
  return { x: position(value?.x ?? 50), y: position(value?.y ?? 50) };
}
export function coverRect(iw, ih, tw, th, framing) {
  const { x, y } = normalizeFraming(framing);
  const scale = Math.max(tw / iw, th / ih);
  const width = Math.min(iw, tw / scale);
  const height = Math.min(ih, th / scale);
  return {
    x: ((iw - width) * x) / 100,
    y: ((ih - height) * y) / 100,
    width,
    height,
  };
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
  for (const [key, max] of Object.entries({
    location: 60,
    reference: 24,
    propertyType: 60,
    closingMessage: 120,
    instagram: 60,
    website: 60,
  }))
    settings[key] = String(input[key] ?? defaults[key]).slice(0, max);
  settings.operation =
    input.operation === "EN ARRIENDO" ? "EN ARRIENDO" : "EN VENTA";
  for (const key of ["navy", "accent", "secondary", "videoColor"])
    if (/^#[0-9a-f]{6}$/i.test(input[key])) settings[key] = input[key];
  for (const key of ["bedrooms", "bathrooms", "area"])
    settings[key] = numeric(
      input[key] ?? defaults[key],
      key === "area" ? 9999999 : 99,
    );
  settings.logoSize = clamp(Number(input.logoSize) || 120, 60, 200);
  settings.logoPosition = input.logoPosition === "left" ? "left" : "right";
  settings.videoMode = ["photos", "clip", "both"].includes(input.videoMode)
    ? input.videoMode
    : defaults.videoMode;
  settings.photoSeconds = clamp(
    Number(input.photoSeconds) || defaults.photoSeconds,
    2,
    8,
  );
  settings.musicVolume = clamp(
    Number(input.musicVolume) || defaults.musicVolume,
    5,
    100,
  );
  return settings;
}
// Each segment overlaps the next during the transition, so a photo shown for
// N seconds is followed by its successor exactly N seconds later.
export function videoPlan({ mode, photos, clipSeconds = 0, photoSeconds }) {
  const overlap = VIDEO_TRANSITION_SECONDS;
  const segments = [{ kind: "cover", seconds: VIDEO_COVER_SECONDS + overlap }];
  if (mode !== "photos" && clipSeconds > 0)
    segments.push({ kind: "clip", seconds: clipSeconds });
  if (mode !== "clip")
    for (let index = 1; index < photos; index++)
      segments.push({ kind: "photo", index, seconds: photoSeconds + overlap });
  segments.push({ kind: "closing", seconds: VIDEO_CLOSING_SECONDS + overlap });
  const total =
    segments.reduce((sum, segment) => sum + segment.seconds, 0) -
    overlap * (segments.length - 1);
  return { segments, total };
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
    description: normalizeDescription(data.description),
    settings: normalizeSettings(data.settings),
    logo: data.logo || null,
    photos: data.photos.map((photo) => {
      if (!photo || !validImage(photo.src))
        throw new Error("Una foto del proyecto no es válida.");
      return {
        name: String(photo.name || "Fotografía").slice(0, 120),
        src: photo.src,
        ...(photo.framing ? { framing: normalizeFraming(photo.framing) } : {}),
      };
    }),
  };
}
