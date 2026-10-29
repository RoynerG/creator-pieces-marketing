export const descriptionDefaults = {
  source: "",
  output: "",
  reference: "",
  operation: "EN VENTA",
  city: "Cartagena",
  phone: "3106573536",
  brand: "Go Cartagena Real Estate",
};
export function normalizeDescription(input = {}) {
  if (!input || typeof input !== "object") input = {};
  const result = {};
  for (const [key, max] of Object.entries({
    source: 18000,
    output: 10000,
    reference: 24,
    city: 100,
    phone: 40,
    brand: 80,
  })) {
    result[key] =
      typeof input[key] === "string"
        ? input[key].slice(0, max)
        : descriptionDefaults[key];
  }
  result.operation =
    input.operation === "EN ARRIENDO" ? "EN ARRIENDO" : "EN VENTA";
  result.output = withoutLinks(result.output);
  return result;
}
export const withoutLinks = (text) =>
  text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi, "")
    .replace(/\n[ \t]+\n/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
export const plainCaption = (text) =>
  withoutLinks(text).replace(/\*\*([^*]+)\*\*/g, "$1");
