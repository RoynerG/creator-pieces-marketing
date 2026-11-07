import "./video.css";
import { videoPlan } from "./model.js";
import { loadPieceFonts } from "./fonts.js";
import {
  renderVideoClosing,
  renderVideoCover,
  renderVideoPhoto,
} from "./video-render.js";

const clock = (value) => {
  const total = Math.round(value);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
export function initVideo({ getState, getCode, getPhone, notice }) {
  const $ = (selector) => document.querySelector(selector);
  let media = { video: null, music: null, final: null },
    busy = false,
    uploading = false,
    polling;
  async function api(route, options) {
    const response = await fetch(`/api/video/${route}`, options);
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("Reinicia Piezas para activar la creación de videos.");
    }
    if (!response.ok)
      throw new Error(result.error || "No se pudo completar la operación.");
    return result;
  }
  const query = (extra = "") =>
    `code=${encodeURIComponent(getCode())}${extra}`;
  function plan() {
    const { settings, photos } = getState();
    return videoPlan({
      mode: settings.videoMode,
      photos: photos.length,
      clipSeconds: media.video?.duration || 0,
      photoSeconds: settings.photoSeconds,
    });
  }
  function missing() {
    const { settings, photos } = getState();
    if (!photos.length) return "Carga al menos una foto para la portada.";
    if (settings.videoMode !== "photos" && !media.video)
      return "Sube el video del inmueble.";
    if (settings.videoMode !== "clip" && photos.length < 2)
      return "Carga más fotos para el recorrido.";
    return "";
  }
  function showFile(kind, label) {
    const file = media[kind];
    $(`#video-${kind}-name`).textContent = file
      ? `${file.name} · ${clock(file.duration)}`
      : label;
    $(`#video-${kind}-remove`).hidden = !file;
  }
  function update() {
    const { settings } = getState(),
      problem = missing();
    $("#video-clip-field").hidden = settings.videoMode === "photos";
    $("#video-photos-field").hidden = settings.videoMode === "clip";
    $("#photo-seconds-output").textContent = `${settings.photoSeconds} s`;
    showFile("video", "Ningún video cargado");
    showFile("music", "Sin música: el video saldrá sin sonido");
    const { segments, total } = plan();
    $("#video-summary").textContent = problem
      ? problem
      : `Duración: ${clock(total)} · ${segments.length} escenas · 1080 × 1920 px`;
    $("#generate-video").disabled = busy || !!problem;
    $("#cancel-video").hidden = !busy || uploading;
    $("#video-progress").hidden = !busy;
    for (const id of [
      "video-video-input",
      "video-music-input",
      "video-video-remove",
      "video-music-remove",
    ])
      $(`#${id}`).disabled = busy;
    const ready = !!media.final && !busy;
    $("#video-result").hidden = !ready;
    if (ready) {
      const source = `/api/video/final?${query(`&v=${media.final.updatedAt}`)}`;
      if ($("#video-player").getAttribute("src") !== source)
        $("#video-player").src = source;
      $("#video-download").href = `${source}&download=1`;
      $("#video-download").download = `${getCode()}.mp4`;
    } else {
      $("#video-player").removeAttribute("src");
      $("#video-player").load();
    }
  }
  function render() {
    if ($("#video-workspace").hidden) return;
    renderVideoCover($("#video-cover-preview"), getState(), 640);
    renderVideoClosing(
      $("#video-closing-preview"),
      getState(),
      getPhone(),
      640,
    );
    update();
  }
  async function refresh() {
    if (!getCode()) return;
    try {
      media = await api(`media?${query()}`);
      const job = await api("status");
      if (job.status === "running" && job.code === getCode()) {
        busy = true;
        polling ??= setTimeout(poll, 300);
      }
    } catch (error) {
      notice(error.message, true);
    }
    render();
  }
  async function finishJob(job) {
    polling = undefined;
    busy = false;
    media = await api(`media?${query()}`);
    render();
    if (job.status === "done") notice("Tu video está listo.");
    else if (job.status === "canceled") notice("Generación cancelada.");
    else if (job.status === "error") notice(job.error, true);
  }
  async function poll() {
    try {
      const job = await api("status");
      if (job.status !== "running") return await finishJob(job);
      $("#video-progress-bar").value = job.progress;
      $("#video-progress-label").textContent =
        `Generando video… ${Math.round(job.progress * 100)}%`;
      polling = setTimeout(poll, 500);
    } catch (error) {
      polling = undefined;
      busy = false;
      notice(error.message, true);
      update();
    }
  }
  function capture(draw, type) {
    const canvas = document.createElement("canvas");
    draw(canvas);
    return canvas.toDataURL(type, 0.93);
  }
  async function generate() {
    if (busy) return;
    busy = true;
    $("#video-progress-bar").value = 0;
    $("#video-progress-label").textContent = "Preparando escenas…";
    update();
    try {
      await loadPieceFonts();
      const state = getState(),
        { settings, photos } = state,
        background = settings.videoColor;
      const slides =
        settings.videoMode === "clip"
          ? []
          : photos
              .slice(1)
              .map((photo) =>
                capture(
                  (canvas) => renderVideoPhoto(canvas, photo, background),
                  "image/jpeg",
                ),
              );
      await api("render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: getCode(),
          mode: settings.videoMode,
          photoSeconds: settings.photoSeconds,
          background,
          slides,
          cover: capture(
            (canvas) => renderVideoCover(canvas, state),
            "image/png",
          ),
          closing: capture(
            (canvas) => renderVideoClosing(canvas, state, getPhone()),
            "image/png",
          ),
        }),
      });
      polling = setTimeout(poll, 300);
    } catch (error) {
      busy = false;
      notice(error.message, true);
      update();
    }
  }
  async function send(kind, file) {
    if (!file || busy) return;
    busy = uploading = true;
    $("#video-progress-bar").removeAttribute("value");
    $("#video-progress-label").textContent = `Cargando ${file.name}…`;
    update();
    try {
      media = await api(
        `media?${query(`&kind=${kind}&name=${encodeURIComponent(file.name)}`)}`,
        { method: "PUT", body: file },
      );
    } catch (error) {
      notice(error.message, true);
    } finally {
      busy = uploading = false;
      render();
    }
  }
  for (const kind of ["video", "music"]) {
    const zone = document.querySelector(`[for="video-${kind}-input"]`);
    for (const name of ["dragenter", "dragover"])
      zone.addEventListener(name, (event) => {
        event.preventDefault();
        zone.classList.add("dragover");
      });
    for (const name of ["dragleave", "drop"])
      zone.addEventListener(name, (event) => {
        event.preventDefault();
        zone.classList.remove("dragover");
      });
    zone.addEventListener("drop", (event) =>
      send(kind, event.dataTransfer.files[0]),
    );
    $(`#video-${kind}-input`).addEventListener("change", (event) => {
      const [file] = event.target.files;
      event.target.value = "";
      send(kind, file);
    });
    $(`#video-${kind}-remove`).addEventListener("click", async () => {
      try {
        media = await api(`media?${query(`&kind=${kind}`)}`, {
          method: "DELETE",
        });
        render();
      } catch (error) {
        notice(error.message, true);
      }
    });
  }
  $("#generate-video").addEventListener("click", generate);
  $("#cancel-video").addEventListener("click", () =>
    api("cancel", { method: "POST" }).catch((error) =>
      notice(error.message, true),
    ),
  );
  $("#show-video").addEventListener("click", () => {
    $("#pieces-workspace").hidden = true;
    $("#description-workspace").hidden = true;
    $("#video-workspace").hidden = false;
    $("#show-pieces").setAttribute("aria-pressed", "false");
    $("#show-description").setAttribute("aria-pressed", "false");
    $("#show-video").setAttribute("aria-pressed", "true");
    refresh();
  });
  return { render, isBusy: () => busy };
}
