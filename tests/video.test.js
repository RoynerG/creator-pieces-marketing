import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { startDesktopServer } from "../server/desktop-server.js";
import {
  TRANSITION_STYLES,
  ffmpegPath,
  transitionsFor,
  videoArgs,
} from "../server/video.js";
import {
  defaults,
  normalizeSettings,
  validateProject,
  videoPlan,
} from "../src/model.js";

const run = promisify(execFile);
const ffmpeg = ffmpegPath();
async function generate(file, ...args) {
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args, file]);
  return file;
}
async function probe(file) {
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", file]).catch(
    (error) => error,
  );
  return stderr;
}
async function dataUrl(dir, name, color) {
  const file = await generate(
    path.join(dir, name),
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=1080x1920`,
    "-frames:v",
    "1",
  );
  return `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
}
async function server(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "piezas-video-test-"));
  const app = await startDesktopServer({
    directory: dir,
    dist: path.resolve("dist"),
    port: 0,
  });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, url: app.url };
}
async function upload(url, code, kind, file) {
  return fetch(
    `${url}/api/video/media?code=${code}&kind=${kind}&name=${path.basename(file)}`,
    { method: "PUT", body: await readFile(file) },
  );
}
async function finished(url) {
  for (;;) {
    const job = await (await fetch(`${url}/api/video/status`)).json();
    if (job.status !== "running") return job;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const render = (url, body) =>
  fetch(`${url}/api/video/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("video plan follows the reference timing for each mode", () => {
  const photos = videoPlan({ mode: "photos", photos: 3, photoSeconds: 4 });
  assert.deepEqual(
    photos.segments.map((segment) => segment.kind),
    ["cover", "photo", "photo", "closing"],
  );
  assert.equal(photos.total, 4 + 4 + 4 + 4.4);
  const clip = videoPlan({
    mode: "clip",
    photos: 3,
    clipSeconds: 20,
    photoSeconds: 4,
  });
  assert.deepEqual(
    clip.segments.map((segment) => segment.kind),
    ["cover", "clip", "closing"],
  );
  const both = videoPlan({
    mode: "both",
    photos: 2,
    clipSeconds: 20,
    photoSeconds: 4,
  });
  assert.deepEqual(
    both.segments.map((segment) => segment.kind),
    ["cover", "clip", "photo", "closing"],
  );
});

test("transitions overlap consecutive scenes and music fades with the video", () => {
  const { segments } = videoPlan({ mode: "photos", photos: 2, photoSeconds: 4 });
  const { args, total } = videoArgs({
    segments: segments.map((segment) => ({
      ...segment,
      file: "a.png",
      background: "#081121",
    })),
    music: { file: "song.mp3", gain: -13.3 },
    output: "out.mp4",
  });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.equal(total, 12.4);
  assert.match(graph, /xfade=transition=slidedown:duration=0.5:offset=4\[x1\]/);
  assert.match(graph, /xfade=transition=slideleft:duration=0.5:offset=8\[x2\]/);
  assert.match(graph, /volume=-13.3dB,afade=t=out:st=11.4:d=1/);
});

test("video settings are bounded and old projects open with defaults", () => {
  const settings = normalizeSettings({
    videoMode: "otro",
    photoSeconds: 900,
    videoColor: "red",
    closingMessage: "x".repeat(500),
  });
  assert.equal(settings.videoMode, "photos");
  assert.equal(settings.photoSeconds, 8);
  assert.equal(settings.videoColor, defaults.videoColor);
  assert.equal(settings.closingMessage.length, 120);
  const old = validateProject({ version: 1, photos: [], settings: {} });
  assert.equal(old.settings.website, defaults.website);
});

test("media routes reject unsafe codes, other sites and unreadable files", async (t) => {
  const { url } = await server(t);
  const route = `${url}/api/video/media`;
  assert.equal(
    (await fetch(`${route}?code=..%2F..%2Fetc&kind=video&name=a.mp4`, {
      method: "PUT",
      body: "x",
    })).status,
    400,
  );
  assert.equal(
    (await fetch(`${route}?code=7016&kind=video&name=a.mp4`, {
      method: "PUT",
      body: "x",
      headers: { Origin: "https://example.com" },
    })).status,
    403,
  );
  assert.equal(
    (await fetch(`${route}?code=7016&kind=video&name=a.exe`, {
      method: "PUT",
      body: "x",
    })).status,
    415,
  );
  const broken = await fetch(`${route}?code=7016&kind=video&name=a.mp4`, {
    method: "PUT",
    body: "esto no es un video",
  });
  assert.equal(broken.status, 422);
  const state = await (await fetch(`${route}?code=7016`)).json();
  assert.equal(state.video, null);
});

test("renders a vertical H.264 video with cover, clip, photo, closing and music", async (t) => {
  const { dir, url } = await server(t);
  const clip = await generate(
    path.join(dir, "clip.mp4"),
    "-f",
    "lavfi",
    "-i",
    "testsrc=s=1920x1080:r=30:d=2",
    "-pix_fmt",
    "yuv420p",
  );
  const music = await generate(
    path.join(dir, "song.m4a"),
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
  );
  const cover = await dataUrl(dir, "cover.png", "white"),
    photo = await dataUrl(dir, "photo.png", "red"),
    closing = await dataUrl(dir, "closing.png", "blue");
  const missing = await render(url, {
    code: "7016",
    mode: "clip",
    background: "#081121",
    cover,
    closing,
  });
  assert.equal(missing.status, 400);
  assert.equal((await upload(url, "7016", "video", clip)).status, 200);
  assert.equal((await upload(url, "7016", "music", music)).status, 200);
  const started = await render(url, {
    code: "7016",
    mode: "both",
    photoSeconds: 2,
    background: "#081121",
    cover,
    closing,
    slides: [photo],
  });
  assert.equal(started.status, 202);
  const { total } = await started.json();
  assert.equal(total, 4 + 1.5 + 2 + 4.4);
  const job = await finished(url);
  assert.equal(job.status, "done", job.error);
  const { stderr } = await run(ffmpeg, [
    "-hide_banner",
    "-i",
    path.join(dir, "media", "7016", "final.mp4"),
    "-af",
    "volumedetect",
    "-vn",
    "-f",
    "null",
    "-",
  ]);
  assert.ok(
    Number(stderr.match(/mean_volume: (-?[\d.]+)/)[1]) < -20,
    "la música debe quedar de fondo",
  );
  const download = await fetch(`${url}/api/video/final?code=7016&download=1`);
  assert.equal(
    download.headers.get("content-disposition"),
    'attachment; filename="7016.mp4"',
  );
  const final = path.join(dir, "result.mp4");
  await writeFile(final, Buffer.from(await download.arrayBuffer()));
  const info = await probe(final);
  assert.match(info, /Video: h264.*yuv420p.*1080x1920/);
  assert.match(info, /Audio: aac/);
  const seconds = Number(info.match(/Duration: 00:00:(\d+\.\d+)/)[1]);
  assert.ok(Math.abs(seconds - total) < 0.25, `duración ${seconds}`);
  const partial = await fetch(`${url}/api/video/final?code=7016`, {
    headers: { Range: "bytes=0-99" },
  });
  assert.equal(partial.status, 206);
  assert.equal((await partial.arrayBuffer()).byteLength, 100);
});

test("videos include the built-in song without any configuration", async (t) => {
  const { dir, url } = await server(t);
  const initial = await (await fetch(`${url}/api/video/media?code=7016`)).json();
  assert.equal(initial.defaultMusic.builtIn, true);
  const cover = await dataUrl(dir, "cover.png", "white");
  await render(url, {
    code: "7016",
    mode: "photos",
    background: "#051226",
    cover,
    closing: cover,
  });
  const job = await finished(url);
  assert.equal(job.status, "done", job.error);
  assert.match(
    await probe(path.join(dir, "media", "7016", "final.mp4")),
    /Audio: aac/,
  );
});

test("default music applies only to publications without their own song", async (t) => {
  const { dir, url } = await server(t);
  const song = await generate(
    path.join(dir, "song.m4a"),
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
  );
  assert.equal((await upload(url, "_marca", "music", song)).status, 200);
  assert.equal((await upload(url, "_marca", "video", song)).status, 400);
  const cover = await dataUrl(dir, "cover.png", "white");
  const started = await render(url, {
    code: "7016",
    mode: "photos",
    background: "#081121",
    cover,
    closing: cover,
  });
  assert.equal(started.status, 202);
  assert.equal((await finished(url)).status, "done");
  const state = await (await fetch(`${url}/api/video/media?code=7016`)).json();
  assert.equal(state.music, null);
  assert.equal(state.defaultMusic.name, "song.m4a");
  assert.match(
    await probe(path.join(dir, "media", "7016", "final.mp4")),
    /Audio: aac/,
  );
  assert.equal(
    (await render(url, { code: "_marca", background: "#000000" })).status,
    400,
  );
});

test("HDR reference white stays white after converting phone footage", async (t) => {
  const { dir, url } = await server(t);
  // HLG places diffuse white at a 75% signal, which is 0xBF in full range.
  const clip = await generate(
    path.join(dir, "hdr.mov"),
    "-f",
    "lavfi",
    "-i",
    "color=c=0xBFBFBF:s=720x1280:r=30:d=2",
    "-vf",
    "format=gbrp,format=yuv420p10le,setparams=range=tv:color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p10le",
    "-color_primaries",
    "bt2020",
    "-color_trc",
    "arib-std-b67",
    "-colorspace",
    "bt2020nc",
  );
  assert.equal((await upload(url, "7016", "video", clip)).status, 200);
  const state = await (
    await fetch(`${url}/api/video/media?code=7016`)
  ).json();
  assert.equal(state.video.hdr, true);
  const cover = await dataUrl(dir, "cover.png", "white");
  await render(url, {
    code: "7016",
    mode: "clip",
    background: "#081121",
    cover,
    closing: cover,
  });
  const job = await finished(url);
  assert.equal(job.status, "done", job.error);
  const final = path.join(dir, "media", "7016", "final.mp4");
  const { stdout } = await run(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "5",
      "-i",
      final,
      "-frames:v",
      "1",
      "-vf",
      "scale=1:1,format=gray",
      "-f",
      "rawvideo",
      "-",
    ],
    { encoding: "buffer" },
  );
  assert.ok(stdout[0] > 225, `blanco HDR exportado como ${stdout[0]}`);
});

test("a render can be canceled without replacing the last finished video", async (t) => {
  const { dir, url } = await server(t);
  const clip = await generate(
    path.join(dir, "clip.mp4"),
    "-f",
    "lavfi",
    "-i",
    "testsrc=s=1080x1920:r=30:d=30",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "ultrafast",
  );
  await upload(url, "7016", "video", clip);
  const cover = await dataUrl(dir, "cover.png", "white");
  await render(url, {
    code: "7016",
    mode: "clip",
    background: "#081121",
    cover,
    closing: cover,
  });
  await fetch(`${url}/api/video/cancel`, { method: "POST" });
  const job = await finished(url);
  assert.equal(job.status, "canceled");
  const state = await (
    await fetch(`${url}/api/video/media?code=7016`)
  ).json();
  assert.equal(state.final, null);
});

test("every transition style uses transitions this FFmpeg supports", async () => {
  const { stdout } = await run(ffmpeg, ["-hide_banner", "-h", "filter=xfade"]);
  const supported = new Set(
    [...stdout.matchAll(/^ {5}(\w+)\s+-?\d+/gm)].map((match) => match[1]),
  );
  for (const [style, names] of Object.entries(TRANSITION_STYLES))
    for (const name of names)
      assert.ok(supported.has(name), `${style}: ${name}`);
  const surprise = transitionsFor("aleatoria", () => 0.5);
  assert.equal(
    new Set(surprise).size,
    new Set(Object.values(TRANSITION_STYLES).flat()).size,
  );
  assert.deepEqual(transitionsFor("clasica"), ["slidedown"]);
});

test("extra video photos can be added, reordered, removed and rendered", async (t) => {
  const { dir, url } = await server(t);
  const photo = (name, size = "1080x1920") =>
    generate(
      path.join(dir, name),
      "-f",
      "lavfi",
      "-i",
      `color=c=red:s=${size}`,
      "-frames:v",
      "1",
    );
  const add = async (file) =>
    fetch(`${url}/api/video/photo?code=7016&name=${path.basename(file)}`, {
      method: "PUT",
      body: await readFile(file),
    });
  for (const name of ["a.jpg", "b.jpg", "c.jpg"])
    assert.equal((await add(await photo(name))).status, 200);
  assert.equal((await add(await photo("small.jpg", "720x1280"))).status, 422);
  let state = await (await fetch(`${url}/api/video/media?code=7016`)).json();
  assert.deepEqual(
    state.photos.map((item) => item.name),
    ["a.jpg", "b.jpg", "c.jpg"],
  );
  const [a, b, c] = state.photos.map((item) => item.id);
  const order = (ids) =>
    fetch(`${url}/api/video/photos?code=7016`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  assert.equal((await order([c, a])).status, 400);
  assert.equal((await order([c, a, a])).status, 400);
  state = await (await order([c, a, b])).json();
  assert.deepEqual(
    state.photos.map((item) => item.name),
    ["c.jpg", "a.jpg", "b.jpg"],
  );
  const image = await fetch(`${url}/api/video/photo?code=7016&id=${c}`);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.equal(
    (await fetch(`${url}/api/video/photo?code=7016&id=..%2Fx`)).status,
    400,
  );
  state = await (
    await fetch(`${url}/api/video/photo?code=7016&id=${b}`, {
      method: "DELETE",
    })
  ).json();
  assert.equal(state.photos.length, 2);
  const cover = await dataUrl(dir, "cover.png", "white");
  const started = await render(url, {
    code: "7016",
    mode: "photos",
    photoSeconds: 2,
    transitions: "alegre",
    background: "#051226",
    cover,
    closing: cover,
    slides: [cover],
  });
  const { total } = await started.json();
  assert.equal(total, 4 + 2 + 2 + 2 + 4.4);
  assert.equal((await finished(url)).status, "done");
  state = await (
    await fetch(`${url}/api/video/photo?code=7016&id=all`, {
      method: "DELETE",
    })
  ).json();
  assert.equal(state.photos.length, 0);
});
