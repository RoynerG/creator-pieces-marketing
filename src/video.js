import "./video.css";
import { videoPlan } from "./model.js";
import { saveBrowserVideo } from "./export-files.js";
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
const BRAND = "_marca";
const logo = new Image();
const logoReady = new Promise((resolve, reject) => {
  logo.onload = resolve;
  logo.onerror = reject;
});
logo.src = "/brand/logo.svg";
export function initVideo({
  getState,
  getCode,
  getPhone,
  exportDestination,
  notice,
}) {
  const $ = (selector) => document.querySelector(selector);
  const desktop = window.piezasDesktop;
  const scene = () => ({ ...getState(), logoImage: logo });
  let media = { video: null, music: null, defaultMusic: null, final: null },
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
  const query = (extra = "", code = getCode()) =>
    `code=${encodeURIComponent(code)}${extra}`;
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
    showFile(
      "music",
      media.defaultMusic
        ? `Música predeterminada: ${media.defaultMusic.name} · ${clock(media.defaultMusic.duration)}`
        : "Sin música: el video saldrá sin sonido",
    );
    $("#music-volume-output").textContent = `${settings.musicVolume}%`;
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
      $("#video-save-folder").hidden =
        !desktop?.saveVideo && typeof window.showDirectoryPicker !== "function";
    } else {
      $("#video-player").removeAttribute("src");
      $("#video-player").load();
    }
  }
  function render() {
    if ($("#video-workspace").hidden) return;
    renderVideoCover($("#video-cover-preview"), scene(), 640);
    renderVideoClosing($("#video-closing-preview"), scene(), getPhone(), 640);
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
    if (job.status === "done") {
      if (desktop?.saveVideo) await saveToFolder();
      else notice("Tu video está listo.");
    } else if (job.status === "canceled") notice("Generación cancelada.");
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
  async function saveToFolder() {
    try {
      if (desktop?.saveVideo) {
        const result = await desktop.saveVideo({ code: getCode() });
        if (result.canceled)
          return notice("El video está listo, pero no se guardó en la carpeta.");
        if (result.error) throw new Error(result.error);
        exportDestination.show(result.destination);
        return notice(`Video guardado en ${result.file}.`, false, true);
      }
      const parent = await exportDestination.prepare();
      const response = await fetch(`/api/video/final?${query()}`);
      if (!response.ok) throw new Error("Genera el video primero.");
      const file = await saveBrowserVideo(
        parent,
        getCode(),
        await response.blob(),
      );
      notice(`Video guardado en ${file}.`, false, true);
    } catch (error) {
      if (error.name !== "AbortError") notice(error.message, true);
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
      await Promise.all([loadPieceFonts(), logoReady]);
      const state = scene(),
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
          musicVolume: settings.musicVolume,
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
  async function refreshDefaultMusic() {
    try {
      showDefaultMusic((await api(`media?${query("", BRAND)}`)).defaultMusic);
    } catch (error) {
      notice(error.message, true);
    }
  }
  function showDefaultMusic(music) {
    media.defaultMusic = music;
    $("#default-music-name").textContent =
      `${music.name} · ${clock(music.duration)}${music.builtIn ? " (incluida)" : ""}`;
    $("#default-music-remove").hidden = !!music.builtIn;
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
  $("#default-music-input").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";
    if (!file) return;
    $("#default-music-name").textContent = `Cargando ${file.name}…`;
    try {
      const result = await api(
        `media?${query(`&kind=music&name=${encodeURIComponent(file.name)}`, BRAND)}`,
        { method: "PUT", body: file },
      );
      showDefaultMusic(result.defaultMusic);
      notice("Música predeterminada guardada en este equipo.");
    } catch (error) {
      notice(error.message, true);
      refreshDefaultMusic();
    }
  });
  $("#default-music-remove").addEventListener("click", async () => {
    try {
      const result = await api(`media?${query("&kind=music", BRAND)}`, {
        method: "DELETE",
      });
      showDefaultMusic(result.defaultMusic);
    } catch (error) {
      notice(error.message, true);
    }
  });
  $("#video-save-folder").addEventListener("click", saveToFolder);
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
  logoReady.then(render, () => notice("No se pudo cargar el logo.", true));
  refreshDefaultMusic();
  return { render, refreshDefaultMusic, isBusy: () => busy };
}
