import { WIDTH, HEIGHT, containRect } from "./model.js";

function fitText(
  ctx,
  text,
  x,
  y,
  maxWidth,
  size,
  weight = 600,
  color = "#041e4d",
  tracking = 0,
  align = "center",
  family = "Poppins",
) {
  const chars = [...String(text)];
  const measure = () =>
    chars.reduce((sum, char) => sum + ctx.measureText(char).width, 0) +
    Math.max(0, chars.length - 1) * tracking;
  ctx.font = `${weight} ${size}px "${family}", sans-serif`;
  while (measure() > maxWidth && size > 10) {
    size -= 1;
    ctx.font = `${weight} ${size}px "${family}", sans-serif`;
  }
  let cursor = align === "center" ? x - measure() / 2 : x;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const char of chars) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
}
function imageContain(ctx, image, x, y, width, height, background) {
  const r = containRect(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    width,
    height,
  );
  ctx.fillStyle = background;
  ctx.fillRect(x, y, width, height);
  ctx.drawImage(image, x + r.x, y + r.y, r.width, r.height);
}
function placeholder(ctx, x, y, w, h, color) {
  ctx.fillStyle = "#e0e7e9";
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2 - 25);
  ctx.strokeStyle = "#a7b6bf";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(-38, -34, 76, 62);
  ctx.moveTo(-38, 18);
  ctx.lineTo(-10, -5);
  ctx.lineTo(7, 9);
  ctx.lineTo(23, -6);
  ctx.lineTo(38, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(15, -17, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  fitText(
    ctx,
    "Tu fotografía aquí",
    x + w / 2,
    y + h / 2 + 48,
    w - 30,
    28,
    400,
    color,
  );
}
function bed(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.roundRect(-31, -3, 62, 23, 3);
  ctx.moveTo(-29, -3);
  ctx.lineTo(-29, -23);
  ctx.quadraticCurveTo(-29, -28, -23, -28);
  ctx.lineTo(23, -28);
  ctx.quadraticCurveTo(29, -28, 29, -23);
  ctx.lineTo(29, -3);
  ctx.moveTo(-31, 15);
  ctx.lineTo(31, 15);
  ctx.moveTo(-27, 20);
  ctx.lineTo(-27, 26);
  ctx.moveTo(27, 20);
  ctx.lineTo(27, 26);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-21, -18, 18, 15, 2);
  ctx.roundRect(3, -18, 18, 15, 2);
  ctx.stroke();
  ctx.restore();
}
function bath(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(-31, -5);
  ctx.lineTo(31, -5);
  ctx.lineTo(31, 0);
  ctx.lineTo(-31, 0);
  ctx.closePath();
  ctx.moveTo(-28, 0);
  ctx.quadraticCurveTo(-28, 24, -9, 24);
  ctx.lineTo(12, 24);
  ctx.quadraticCurveTo(29, 24, 29, 0);
  ctx.moveTo(-19, 24);
  ctx.lineTo(-21, 29);
  ctx.moveTo(21, 24);
  ctx.lineTo(23, 29);
  ctx.moveTo(24, -6);
  ctx.lineTo(24, -25);
  ctx.quadraticCurveTo(24, -30, 18, -29);
  ctx.quadraticCurveTo(11, -29, 11, -22);
  ctx.lineTo(18, -22);
  ctx.moveTo(-19, -7);
  ctx.lineTo(-19, 12);
  ctx.lineTo(-7, 12);
  ctx.lineTo(-7, -7);
  ctx.stroke();
  ctx.restore();
}
function areaIcon(ctx, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-23, -24);
  ctx.lineTo(-23, 17);
  ctx.quadraticCurveTo(-23, 23, -17, 23);
  ctx.lineTo(24, 23);
  ctx.moveTo(-30, -17);
  ctx.lineTo(-23, -25);
  ctx.lineTo(-16, -17);
  ctx.moveTo(17, 16);
  ctx.lineTo(25, 23);
  ctx.lineTo(17, 30);
  ctx.moveTo(-13, -25);
  ctx.lineTo(15, -25);
  ctx.quadraticCurveTo(23, -25, 23, -17);
  ctx.lineTo(23, 12);
  ctx.stroke();
  fitText(ctx, "m²", 1, 9, 35, 25, 700, color, 0, "center", "Montserrat");
  ctx.restore();
}
export function renderPiece(canvas, state, index) {
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const s = state.settings,
    photo = state.photos[index];
  if (index === 0) {
    ctx.fillStyle = s.navy;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = s.accent;
    ctx.fillRect(0, 558, 847, HEIGHT - 558);
    ctx.fillStyle = s.secondary;
    ctx.fillRect(847, 558, 233, HEIGHT - 558);
    fitText(ctx, s.operation, 540, 120, 930, (50 * 4) / 3, 700, s.accent, 22);
    ctx.fillStyle = "#fff";
    ctx.fillRect(362, 160, 376, 8);
    fitText(
      ctx,
      s.propertyType.toUpperCase(),
      540,
      264,
      940,
      48,
      700,
      s.accent,
      17,
    );
    if (photo) imageContain(ctx, photo.image, 66, 347, 948, 695, s.navy);
    else placeholder(ctx, 66, 347, 948, 695, s.navy);
    fitText(
      ctx,
      s.location || "Barrio o ubicación",
      66,
      1111,
      737,
      (35 * 4) / 3,
      200,
      s.navy,
      0,
      "left",
    );
    ctx.fillStyle = s.navy;
    ctx.fillRect(76, 1132, 276, 71);
    fitText(
      ctx,
      `#${s.reference.replace(/^#+/, "") || "Código"}`,
      214,
      1181,
      250,
      (30 * 4) / 3,
      700,
      s.accent,
      0,
      "center",
      "Montserrat",
    );
    const specs = [
      [s.bedrooms, "habs.", 110, bed],
      [s.bathrooms, "baños", 268, bath],
      [s.area, "m²", 426, areaIcon],
    ];
    for (const [value, label, x, icon] of specs) {
      if (value === "") continue;
      icon(ctx, x, 1270, s.navy);
      fitText(
        ctx,
        `${value} ${label}`,
        x,
        1327,
        150,
        28,
        500,
        s.navy,
        0,
        "center",
        "Montserrat",
      );
    }
  } else {
    if (photo) imageContain(ctx, photo.image, 0, 0, WIDTH, HEIGHT, s.navy);
    else placeholder(ctx, 0, 0, WIDTH, HEIGHT, s.navy);
  }
  if (state.logoImage) {
    const size = s.logoSize,
      max = index === 0 ? Math.min(size, 170) : size;
    const ratio = state.logoImage.naturalWidth / state.logoImage.naturalHeight;
    const w = ratio >= 1 ? max : max * ratio,
      h = ratio >= 1 ? max / ratio : max;
    const x =
      index === 0 ? 954 - w / 2 : s.logoPosition === "left" ? 66 : 1014 - w;
    ctx.drawImage(state.logoImage, x, 1278 - h, w, h);
  }
  ctx.restore();
}
