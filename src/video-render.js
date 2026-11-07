import {
  VIDEO_WIDTH as WIDTH,
  VIDEO_HEIGHT as HEIGHT,
  containRect,
  coverRect,
} from "./model.js";
import { fitText, bed, bath, areaIcon } from "./render.js";

const PANEL = "rgba(24, 36, 58, 0.6)";
const GOLD = "#f5c86b";
const PHONE =
  "M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z";

function prepare(canvas, maxEdge) {
  const scale = Math.min(1, maxEdge / HEIGHT);
  canvas.width = Math.round(WIDTH * scale);
  canvas.height = Math.round(HEIGHT * scale);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}
function drawPhoto(ctx, photo, background) {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (!photo) return;
  const crop = coverRect(
    photo.image.naturalWidth,
    photo.image.naturalHeight,
    WIDTH,
    HEIGHT,
    photo.framing,
  );
  ctx.drawImage(
    photo.image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    WIDTH,
    HEIGHT,
  );
}
function drawBox(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}
// Logos sit on the bottom of their box so a tall mark can rise above the plaque.
function drawLogo(ctx, image, x, y, width, height) {
  const fit = containRect(
    image.naturalWidth,
    image.naturalHeight,
    width,
    height,
  );
  ctx.drawImage(
    image,
    x + fit.x,
    y + height - fit.height,
    fit.width,
    fit.height,
  );
}
function wrap(ctx, text, maxWidth, tracking) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    const width = ctx.measureText(next).width + next.length * tracking;
    if (line && width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return line ? [...lines, line] : lines;
}
export function renderVideoPhoto(canvas, photo, background) {
  drawPhoto(prepare(canvas, HEIGHT), photo, background);
}
export function renderVideoCover(canvas, state, maxEdge = HEIGHT) {
  const ctx = prepare(canvas, maxEdge),
    s = state.settings,
    dark = s.videoColor;
  drawPhoto(ctx, state.photos[0], dark);
  drawBox(ctx, 127, 517, 826, 643, 45, PANEL);
  if (state.logoImage) {
    drawBox(ctx, 157, 384, 758, 221, 12, dark);
    drawLogo(ctx, state.logoImage, 205, 305, 652, 270);
  }
  fitText(ctx, s.propertyType.toUpperCase(), 540, 742, 760, 54, 700, "#fff", 12);
  fitText(ctx, s.operation, 540, 823, 760, 54, 700, "#fff", 12);
  fitText(
    ctx,
    s.location || "Barrio o ubicación",
    540,
    933,
    760,
    42,
    300,
    "#fff",
    7,
    "center",
    "Raleway",
  );
  fitText(
    ctx,
    `COD. ${s.reference.replace(/^#+/, "") || "Código"}`,
    540,
    1068,
    760,
    54,
    700,
    "#fff",
    11,
  );
  const specs = [
    [s.bathrooms, bath],
    [s.bedrooms, bed],
    [s.area, areaIcon],
  ].filter(([value]) => value !== "");
  const left = 540 - (specs.length * 244 + (specs.length - 1) * 47) / 2;
  specs.forEach(([value, icon], index) => {
    const x = left + index * 291;
    drawBox(ctx, x, 1393, 244, 224, 30, dark);
    ctx.save();
    ctx.translate(x + 122, 1477);
    ctx.scale(1.6, 1.6);
    icon(ctx, 0, 0, "#fff");
    ctx.restore();
    fitText(ctx, value, x + 122, 1584, 210, 32, 700, "#fff");
  });
}
export function renderVideoClosing(canvas, state, phone, maxEdge = HEIGHT) {
  const ctx = prepare(canvas, maxEdge),
    s = state.settings;
  ctx.fillStyle = s.videoColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (state.logoImage) drawLogo(ctx, state.logoImage, 234, 327, 612, 250);
  ctx.font = '300 44px "Raleway", sans-serif';
  wrap(ctx, s.closingMessage, 880, 4)
    .slice(0, 3)
    .forEach((line, index) =>
      fitText(
        ctx,
        line,
        540,
        870 + index * 66,
        920,
        44,
        300,
        "#fff",
        4,
        "center",
        "Raleway",
      ),
    );
  if (phone) {
    ctx.font = '900 100px "Raleway", sans-serif';
    const textWidth = Math.min(ctx.measureText(phone).width, 720),
      start = 515 - (textWidth + 141) / 2;
    ctx.save();
    ctx.translate(start, 1028);
    ctx.scale(4.1, 4.1);
    ctx.fillStyle = GOLD;
    ctx.fill(new Path2D(PHONE));
    ctx.restore();
    fitText(
      ctx,
      phone,
      start + 141,
      1115,
      720,
      100,
      900,
      "#fff",
      0,
      "left",
      "Raleway",
    );
  }
  [s.instagram, s.website].forEach((line, index) =>
    fitText(
      ctx,
      line,
      540,
      1305 + index * 72,
      940,
      46,
      300,
      "#fff",
      5,
      "center",
      "Raleway",
    ),
  );
}
