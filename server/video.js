import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import ffmpegStatic from "ffmpeg-static";
import {
  VIDEO_HEIGHT,
  VIDEO_TRANSITION_SECONDS,
  VIDEO_WIDTH,
  videoPlan,
} from "../src/model.js";
import { exportFolderName } from "../src/export-files.js";
import { assertLocalRequest } from "./minimax.js";
import { ApiError } from "./captions.js";
import { readJson } from "./projects.js";

const FPS = 30;
const FORMAT = `fps=${FPS},format=yuv420p,setsar=1,settb=AVTB`;
const FILL = `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`;
// iPhone footage is usually HDR. HDR places diffuse white at 203 nits, so 203
// maps it to SDR white; highlights up to 1000 nits (4.93x) roll off above it.
const HDR_TO_SDR =
  "zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:param=0.8:desat=0:peak=4.93,zscale=t=bt709:m=bt709:r=tv,";
const CLOSING_FADE_DELAY = 0.15;
const CLOSING_FADE_SECONDS = 0.6;
const MUSIC_FADE_SECONDS = 1;
// Songs are leveled to this average first, so musicVolume means the same for all.
const MUSIC_REFERENCE_DB = -14;
const TRANSITIONS = [
  "slidedown",
  "slideleft",
  "fade",
  "slideup",
  "circleopen",
  "slideright",
  "smoothleft",
  "wipedown",
];
// Not a valid publication code, so it can never collide with one.
const BRAND = "_marca";
const BUILT_IN_MUSIC = {
  name: "Real Estate.mp3",
  duration: 120.05,
  builtIn: true,
};
// FFmpeg is a separate process and cannot read files inside the asar archive.
const builtInMusicFile = () =>
  fileURLToPath(new URL("./assets/real-estate.mp3", import.meta.url)).replace(
    "app.asar",
    "app.asar.unpacked",
  );
const MEDIA = {
  video: {
    extensions: [".mp4", ".mov", ".m4v", ".webm", ".mkv"],
    maxBytes: 4 * 1024 ** 3,
    stream: /Stream #.*Video:/,
    invalid: "El archivo no contiene un video que se pueda leer.",
  },
  music: {
    extensions: [".mp3", ".m4a", ".aac", ".wav", ".ogg"],
    maxBytes: 200 * 1024 ** 2,
    stream: /Stream #.*Audio:/,
    invalid: "El archivo no contiene audio que se pueda leer.",
  },
};
function publicationFolder(code) {
  try {
    return exportFolderName(code);
  } catch (error) {
    throw new ApiError(400, error.message);
  }
}
export const ffmpegPath = () =>
  ffmpegStatic.replace("app.asar", "app.asar.unpacked");
const seconds = (value) => Number(value.toFixed(3));
export function videoArgs({ segments, music, output }) {
  const inputs = [],
    filters = [],
    labels = [];
  let index = 0;
  const image = (file, duration) => {
    inputs.push(
      "-loop",
      "1",
      "-framerate",
      String(FPS),
      "-t",
      String(seconds(duration)),
      "-i",
      file,
    );
    return index++;
  };
  segments.forEach((segment, position) => {
    const label = `v${position}`;
    labels.push(label);
    if (segment.kind === "clip") {
      inputs.push("-i", segment.file);
      filters.push(
        `[${index}:v]${segment.hdr ? HDR_TO_SDR : ""}${FILL},trim=duration=${seconds(segment.seconds)},setpts=PTS-STARTPTS,${FORMAT}[${label}]`,
      );
      index++;
    } else if (segment.kind === "closing") {
      // The card slides in empty and its contact details fade in on top.
      const background = index++;
      inputs.push(
        "-f",
        "lavfi",
        "-t",
        String(seconds(segment.seconds)),
        "-i",
        `color=c=0x${segment.background.slice(1)}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:r=${FPS}`,
      );
      const details = image(segment.file, segment.seconds - CLOSING_FADE_DELAY);
      filters.push(
        `[${background}:v]${FORMAT}[${label}a]`,
        `[${details}:v]${FORMAT}[${label}b]`,
        `[${label}a][${label}b]xfade=transition=fade:duration=${CLOSING_FADE_SECONDS}:offset=${CLOSING_FADE_DELAY}[${label}]`,
      );
    } else {
      const input = image(segment.file, segment.seconds);
      filters.push(`[${input}:v]${FORMAT}[${label}]`);
    }
  });
  let last = labels[0],
    elapsed = 0;
  for (let i = 1; i < labels.length; i++) {
    elapsed += segments[i - 1].seconds - VIDEO_TRANSITION_SECONDS;
    filters.push(
      `[${last}][${labels[i]}]xfade=transition=${TRANSITIONS[(i - 1) % TRANSITIONS.length]}:duration=${VIDEO_TRANSITION_SECONDS}:offset=${seconds(elapsed)}[x${i}]`,
    );
    last = `x${i}`;
  }
  const total = seconds(elapsed + segments.at(-1).seconds);
  const audio = [];
  if (music) {
    inputs.push("-stream_loop", "-1", "-i", music.file);
    filters.push(
      `[${index}:a]atrim=duration=${total},asetpts=N/SR/TB,volume=${music.gain.toFixed(1)}dB,afade=t=out:st=${seconds(total - MUSIC_FADE_SECONDS)}:d=${MUSIC_FADE_SECONDS}[audio]`,
    );
    audio.push(
      "-map",
      "[audio]",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
    );
  }
  return {
    total,
    args: [
      "-hide_banner",
      "-y",
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      `[${last}]`,
      ...audio,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(FPS),
      "-t",
      String(total),
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      output,
    ],
  };
}
function probe(ffmpeg, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-i", file], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let text = "";
    child.stderr.on("data", (chunk) => (text += chunk));
    child.on("error", reject);
    child.on("close", () => {
      const match = text.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
      resolve({
        text,
        duration: match
          ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
          : 0,
        hdr: /arib-std-b67|smpte2084/.test(text),
      });
    });
  });
}
function musicGain(ffmpeg, file, percent) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    let text = "";
    child.stderr.on("data", (chunk) => (text += chunk));
    child.on("error", reject);
    child.on("close", () => {
      const mean = Number(text.match(/mean_volume: (-?[\d.]+) dB/)?.[1]);
      resolve(
        (Number.isFinite(mean) ? MUSIC_REFERENCE_DB - mean : 0) +
          20 * Math.log10(percent / 100),
      );
    });
  });
}
function json(res, status, data) {
  if (res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
async function readMeta(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
export function createVideoMiddleware({ root, ffmpeg = ffmpegPath() }) {
  const mediaRoot = path.join(root, "media");
  let job = null;
  const folder = (code) =>
    path.join(mediaRoot, code === BRAND ? BRAND : publicationFolder(code));
  const running = () => job?.status === "running";
  const metaFile = (code, kind) => path.join(folder(code), `${kind}.json`);
  const finalFile = (code) => path.join(folder(code), "final.mp4");
  async function removeMedia(code, kind) {
    const meta = await readMeta(metaFile(code, kind));
    if (!meta) return;
    await rm(path.join(folder(code), meta.file), { force: true });
    await rm(metaFile(code, kind), { force: true });
  }
  async function upload(req, code, kind, name) {
    const rule = MEDIA[kind];
    if (!rule) throw new ApiError(400, "Tipo de archivo no válido.");
    const extension = path.extname(name).toLowerCase();
    if (!rule.extensions.includes(extension))
      throw new ApiError(
        415,
        `Usa un archivo ${rule.extensions.join(", ").replaceAll(".", "").toUpperCase()}.`,
      );
    await mkdir(folder(code), { recursive: true });
    const file = `${kind}${extension}`,
      temp = path.join(folder(code), `${kind}.upload${extension}`);
    let size = 0;
    const limit = new Transform({
      transform(chunk, _encoding, done) {
        size += chunk.length;
        done(
          size > rule.maxBytes
            ? new ApiError(413, "El archivo es demasiado grande.")
            : null,
          chunk,
        );
      },
    });
    try {
      await pipeline(req, limit, createWriteStream(temp));
      const info = await probe(ffmpeg, temp);
      if (!rule.stream.test(info.text) || info.duration < 1)
        throw new ApiError(422, rule.invalid);
      await removeMedia(code, kind);
      await rename(temp, path.join(folder(code), file));
      await writeFile(
        metaFile(code, kind),
        JSON.stringify({
          name: path.basename(name).slice(0, 120),
          file,
          size,
          duration: info.duration,
          hdr: info.hdr,
        }),
      );
    } finally {
      await rm(temp, { force: true });
    }
  }
  async function status(code) {
    let final = null;
    try {
      const info = await stat(finalFile(code));
      final = { size: info.size, updatedAt: info.mtimeMs };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return {
      video: await readMeta(metaFile(code, "video")),
      music: await readMeta(metaFile(code, "music")),
      defaultMusic:
        (await readMeta(metaFile(BRAND, "music"))) || BUILT_IN_MUSIC,
      final,
    };
  }
  async function startRender(input) {
    if (running())
      throw new ApiError(
        409,
        "Ya se está generando un video. Espera a que termine.",
      );
    const code = publicationFolder(input.code),
      image = /^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/;
    const slides = Array.isArray(input.slides) ? input.slides : [];
    if (
      slides.length > 9 ||
      ![input.cover, input.closing, ...slides].every(
        (value) => typeof value === "string" && image.test(value),
      ) ||
      !/^#[0-9a-f]{6}$/i.test(input.background)
    )
      throw new ApiError(400, "Las imágenes del video no son válidas.");
    const media = await status(code),
      withClip = input.mode === "clip" || input.mode === "both";
    if (withClip && !media.video)
      throw new ApiError(400, "Sube el video del inmueble primero.");
    const plan = videoPlan({
      mode: input.mode,
      photos: slides.length + 1,
      clipSeconds: withClip ? media.video.duration : 0,
      photoSeconds: Number(input.photoSeconds) || 4,
    });
    await mkdir(folder(code), { recursive: true });
    const temp = await mkdtemp(path.join(folder(code), "render-"));
    const write = async (name, value) => {
      const file = path.join(temp, name);
      await writeFile(file, Buffer.from(value.split(",")[1], "base64"));
      return file;
    };
    const segments = [];
    for (const segment of plan.segments) {
      if (segment.kind === "clip")
        segments.push({
          ...segment,
          file: path.join(folder(code), media.video.file),
          hdr: media.video.hdr,
        });
      else if (segment.kind === "photo")
        segments.push({
          ...segment,
          file: await write(`${segment.index}.img`, slides[segment.index - 1]),
        });
      else
        segments.push({
          ...segment,
          file: await write(`${segment.kind}.img`, input[segment.kind]),
          background: input.background,
        });
    }
    const output = path.join(temp, "final.mp4");
    const song = media.music
      ? path.join(folder(code), media.music.file)
      : media.defaultMusic.builtIn
        ? builtInMusicFile()
        : path.join(folder(BRAND), media.defaultMusic.file);
    const { args, total } = videoArgs({
      segments,
      output,
      music: {
        file: song,
        gain: await musicGain(
          ffmpeg,
          song,
          Math.min(100, Math.max(5, Number(input.musicVolume) || 25)),
        ),
      },
    });
    const child = spawn(ffmpeg, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const current = { code, status: "running", progress: 0, child };
    job = current;
    let log = "",
      finished = false;
    child.stdout.on("data", (chunk) => {
      const done = String(chunk).match(/out_time_us=\d+/g)?.at(-1);
      if (done)
        current.progress = Math.min(
          0.99,
          Number(done.split("=")[1]) / 1e6 / total,
        );
    });
    child.stderr.on("data", (chunk) => {
      log = (log + chunk).slice(-2000);
    });
    const finish = async (exitCode) => {
      if (finished) return;
      finished = true;
      try {
        if (current.canceled) current.status = "canceled";
        else if (exitCode !== 0) {
          console.error(log);
          current.status = "error";
          current.error =
            "No se pudo generar el video. Revisa que tus archivos no estén dañados e intenta de nuevo.";
        } else {
          await rename(output, finalFile(code));
          current.progress = 1;
          current.status = "done";
        }
      } catch (error) {
        console.error(error);
        current.status = "error";
        current.error = "No se pudo guardar el video. Revisa el espacio libre.";
      } finally {
        current.child = null;
        await rm(temp, { recursive: true, force: true });
      }
    };
    child.on("error", () => finish(1));
    child.on("close", finish);
    return { total };
  }
  async function sendFinal(req, res, code, download) {
    const file = finalFile(code),
      { size } = await stat(file);
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = range ? Number(range[1]) : 0,
      end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(range ? 206 : 200, {
      "Content-Type": "video/mp4",
      "Content-Length": end - start + 1,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(download
        ? { "Content-Disposition": `attachment; filename="${code}.mp4"` }
        : {}),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    });
    await pipeline(createReadStream(file, { start, end }), res);
  }
  async function middleware(req, res, next) {
    if (!(req.url || "").startsWith("/api/video/")) return next();
    try {
      assertLocalRequest(req);
      const url = new URL(req.url, "http://localhost"),
        code = url.searchParams.get("code") || "",
        route = `${req.method} ${url.pathname.slice(11)}`;
      if (route === "GET media") return json(res, 200, await status(code));
      if (route === "PUT media" || route === "DELETE media") {
        if (running())
          throw new ApiError(409, "Espera a que termine el video actual.");
        const kind = url.searchParams.get("kind");
        if (code !== BRAND) publicationFolder(code);
        else if (kind !== "music")
          throw new ApiError(400, "Tipo de archivo no válido.");
        if (req.method === "PUT")
          await upload(req, code, kind, url.searchParams.get("name") || "");
        else if (MEDIA[kind]) await removeMedia(code, kind);
        return json(res, 200, await status(code));
      }
      if (route === "POST render")
        return json(res, 202, await startRender(await readJson(req)));
      if (route === "GET status")
        return json(res, 200, {
          code: job?.code,
          status: job?.status || "idle",
          progress: job?.progress || 0,
          error: job?.error,
        });
      if (route === "POST cancel") {
        if (running()) {
          job.canceled = true;
          job.child?.kill();
        }
        return json(res, 200, { canceled: true });
      }
      if (route === "GET final")
        return await sendFinal(
          req,
          res,
          publicationFolder(code),
          url.searchParams.has("download"),
        );
      throw new ApiError(404, "Ruta no encontrada.");
    } catch (error) {
      if (res.headersSent) return res.destroy();
      json(res, error.status || (error.code === "ENOENT" ? 404 : 500), {
        error:
          error instanceof ApiError
            ? error.message
            : error.code === "ENOENT"
              ? "Todavía no hay un video generado."
              : "No se pudo completar la operación de video.",
      });
    }
  }
  middleware.stop = () => {
    if (running()) {
      job.canceled = true;
      job.child?.kill();
    }
  };
  return middleware;
}
