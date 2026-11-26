import "./video.css";
import { VIDEO_EXTRA_PHOTOS, videoPlan } from "./model.js";
import { icon } from "./icons.js";
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
  browseLibrary,
  notice,
}) {
  const $ = (selector) => document.querySelector(selector);
  const desktop = window.piezasDesktop;
  const scene = () => ({ ...getState(), logoImage: logo });
  let media = {
      video: null,
      music: null,
      photos: [],
      defaultMusic: null,
      final: null,
    },
    shownPhotos = "",
    library = { styles: [] },
    lastSong = "",
    picked = "",
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
  // The publication's first photo is always the cover; the rest are optional.
  const pieceSlides = () =>
    getState().settings.videoPhotos === "all"
      ? getState().photos.slice(1)
      : [];
  function plan() {
    const { settings } = getState();
    return videoPlan({
      mode: settings.videoMode,
      photos: 1 + pieceSlides().length + media.photos.length,
      clipSeconds: media.video?.duration || 0,
      photoSeconds: settings.photoSeconds,
    });
  }
  function missing() {
    const { settings, photos } = getState();
    if (!photos.length) return "Carga al menos una foto para la portada.";
    if (settings.videoMode !== "photos" && !media.video)
      return "Sube el video del inmueble.";
    if (
      settings.videoMode !== "clip" &&
      !plan().segments.some((segment) => segment.kind === "photo")
    )
      return "Añade fotos para el recorrido.";
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
    showFile("music", "Ninguna canción subida para este inmueble");
    $("#music-volume-output").textContent = `${settings.musicVolume}%`;
    $("#video-music-choice").disabled = busy || !!media.music;
    $("#video-music-choice-note").textContent = media.music
      ? "Se usará la canción subida para este inmueble."
      : library.error || "";
    showMusicPreview();
    showPhotos();
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
      "video-browse-photos",
      "video-add-photos",
      "video-photos-clear",
    ])
      $(`#${id}`).disabled = busy;
    $("#video-photo-list").inert = busy;
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
  function showPhotos() {
    const { photos } = media;
    $("#video-photo-count").textContent = photos.length
      ? `${photos.length} de ${VIDEO_EXTRA_PHOTOS} fotos adicionales`
      : "Sin fotos adicionales";
    $("#video-photos-clear").hidden = !photos.length;
    const signature = photos.map((photo) => photo.id).join();
    if (signature === shownPhotos) return;
    shownPhotos = signature;
    const list = $("#video-photo-list");
    list.replaceChildren();
    photos.forEach((photo, index) => {
      const item = document.createElement("figure");
      item.className = "video-photo";
      const image = document.createElement("img");
      image.src = `/api/video/photo?${query(`&id=${photo.id}`)}`;
      image.alt = photo.name;
      image.loading = "lazy";
      const number = document.createElement("span");
      number.className = "video-photo-number";
      number.textContent = String(index + 1);
      const tools = document.createElement("div");
      tools.className = "video-photo-tools";
      for (const [action, label] of [
        ["chevron-left", "Mover antes"],
        ["trash", "Quitar foto"],
        ["chevron-right", "Mover después"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "icon-button";
        button.innerHTML = icon(action);
        button.title = label;
        button.setAttribute("aria-label", `${label} ${index + 1}`);
        button.disabled =
          (action === "chevron-left" && index === 0) ||
          (action === "chevron-right" && index === photos.length - 1);
        button.addEventListener("click", () =>
          action === "trash"
            ? changePhotos(`photo?${query(`&id=${photo.id}`)}`, "DELETE")
            : movePhoto(index, action === "chevron-left" ? -1 : 1),
        );
        tools.append(button);
      }
      item.append(image, number, tools);
      list.append(item);
    });
  }
  async function changePhotos(route, method, body) {
    if (busy) return;
    try {
      media = await api(route, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      render();
    } catch (error) {
      notice(error.message, true);
    }
  }
  function movePhoto(index, step) {
    const ids = media.photos.map((photo) => photo.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    changePhotos(`photos?${query()}`, "POST", { ids });
  }
  // Browsers apply the photo's orientation, so phone pictures arrive upright.
  async function preparePhoto(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error("usa una imagen JPG, PNG o WebP.");
    if (file.size > 25 * 1024 * 1024) throw new Error("supera los 25 MB.");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      renderVideoPhoto(canvas, { image }, getState().settings.videoColor);
      return await new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("no se pudo preparar la imagen.")),
          "image/jpeg",
          0.9,
        ),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function addPhotos(files) {
    if (busy || !files.length) return;
    const room = VIDEO_EXTRA_PHOTOS - media.photos.length,
      queue = files.slice(0, room),
      errors = [];
    if (!room)
      return notice(
        `Ya tienes ${VIDEO_EXTRA_PHOTOS} fotos adicionales. Quita alguna para añadir otras.`,
        true,
      );
    busy = uploading = true;
    update();
    let added = 0;
    try {
      for (const [index, file] of queue.entries()) {
        $("#video-progress-bar").value = index / queue.length;
        $("#video-progress-label").textContent =
          `Añadiendo foto ${index + 1} de ${queue.length}…`;
        try {
          media = await api(
            `photo?${query(`&name=${encodeURIComponent(file.name)}`)}`,
            { method: "PUT", body: await preparePhoto(file) },
          );
          added++;
        } catch (error) {
          errors.push(`“${file.name}”: ${error.message}`);
        }
      }
    } finally {
      busy = uploading = false;
      render();
    }
    if (files.length > room)
      errors.push(`Se alcanzó el máximo de ${VIDEO_EXTRA_PHOTOS} fotos.`);
    notice(
      `${added} ${added === 1 ? "foto añadida" : "fotos añadidas"} al video.${errors.length ? ` ${errors.join(" ")}` : ""}`,
      !!errors.length,
    );
  }
  const songName = (choice) =>
    choice.slice(choice.indexOf("/") + 1).replace(/\.[^.]+$/, "");
  function pick(style) {
    const songs = library.styles.find((item) => item.name === style)?.songs;
    if (!songs?.length) return "";
    const others = songs.filter((song) => `song:${style}/${song}` !== picked);
    const list = others.length ? others : songs;
    return `song:${style}/${list[Math.floor(Math.random() * list.length)]}`;
  }
  // "Al azar" is resolved here, so the song you hear is the one the video uses.
  function musicChoice() {
    const choice = getState().settings.musicChoice;
    if (!choice.startsWith("style:")) return choice;
    const style = choice.slice(6);
    if (!picked.startsWith(`song:${style}/`)) picked = pick(style) || "";
    return picked || choice;
  }
  function showMusicPreview() {
    const choice = musicChoice(),
      player = $("#video-music-player");
    const name = media.music
      ? media.music.name.replace(/\.[^.]+$/, "")
      : choice.startsWith("song:")
        ? songName(choice)
        : (media.defaultMusic?.name || "Real Estate.mp3").replace(/\.[^.]+$/, "");
    $("#video-music-now").textContent = `Sonará: ${name}`;
    const style = getState().settings.musicChoice.startsWith("style:");
    $("#video-music-shuffle").hidden =
      !!media.music ||
      !style ||
      (library.styles.find(
        (item) => item.name === getState().settings.musicChoice.slice(6),
      )?.songs.length || 0) < 2;
    const source = `/api/video/music-preview?${query(`&choice=${encodeURIComponent(choice)}`)}`;
    if (player.dataset.source !== source) {
      player.pause();
      player.dataset.source = source;
      player.src = source;
    }
  }
  function fillMusic() {
    const select = $("#video-music-choice"),
      current = getState().settings.musicChoice;
    select.replaceChildren(
      new Option(
        `Predeterminada: ${media.defaultMusic?.name || "Real Estate.mp3"}`,
        "",
      ),
    );
    for (const style of library.styles) {
      const group = document.createElement("optgroup");
      group.label = style.name || "Sin estilo";
      if (style.name)
        group.append(new Option(`Al azar: ${style.name}`, `style:${style.name}`));
      for (const song of style.songs)
        group.append(
          new Option(song.replace(/\.[^.]+$/, ""), `song:${style.name}/${song}`),
        );
      select.append(group);
    }
    if (current && ![...select.options].some((option) => option.value === current))
      select.append(new Option("Canción no encontrada en la carpeta", current));
    select.value = current;
    const count = library.styles.reduce((sum, style) => sum + style.songs.length, 0);
    $("#music-library-path").value ||= library.directory || "";
    $("#music-library-status").textContent = library.error
      ? library.error
      : `${count} ${count === 1 ? "canción" : "canciones"} en ${library.styles.filter((style) => style.name).length} estilos · ${library.directory}`;
  }
  async function refreshMusicLibrary() {
    try {
      library = await api("music-library");
    } catch (error) {
      library = { styles: [], error: error.message };
    }
    fillMusic();
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
      await refreshMusicLibrary();
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
      else notice(`Tu video está listo.${songNote()}`);
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
        return notice(
          `Video guardado en ${result.file}.${songNote()}`,
          false,
          true,
        );
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
  const songNote = () => (lastSong ? ` Música: ${lastSong}.` : "");
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
          : pieceSlides().map((photo) =>
              capture(
                (canvas) => renderVideoPhoto(canvas, photo, background),
                "image/jpeg",
              ),
            );
      const started = await api("render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: getCode(),
          mode: settings.videoMode,
          photoSeconds: settings.photoSeconds,
          musicVolume: settings.musicVolume,
          transitions: settings.videoTransitions,
          musicChoice: musicChoice(),
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
      lastSong = started.song;
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
      await refreshMusicLibrary();
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
  $("#video-browse-photos").addEventListener("click", () =>
    browseLibrary({
      capacity: () => VIDEO_EXTRA_PHOTOS - media.photos.length,
      hint: "Se añaden al video en el orden en que las selecciones.",
      add: addPhotos,
    }),
  );
  $("#video-add-photos").addEventListener("click", () =>
    $("#video-photos-input").click(),
  );
  $("#video-photos-input").addEventListener("change", (event) => {
    const files = [...event.target.files];
    event.target.value = "";
    addPhotos(files);
  });
  $("#video-photos-clear").addEventListener("click", () => {
    if (window.confirm("¿Quitar todas las fotos adicionales del video?"))
      changePhotos(`photo?${query("&id=all")}`, "DELETE");
  });
  $("#music-library-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      library = await api("music-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory: $("#music-library-path").value }),
      });
      fillMusic();
      notice("Carpeta de música conectada.");
    } catch (error) {
      $("#music-library-status").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  $("#video-music-shuffle").addEventListener("click", () => {
    const choice = getState().settings.musicChoice;
    if (choice.startsWith("style:")) picked = pick(choice.slice(6));
    const playing = !$("#video-music-player").paused;
    showMusicPreview();
    if (playing) $("#video-music-player").play().catch(() => {});
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
