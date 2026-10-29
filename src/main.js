import "./styles.css";
import { zipSync } from "fflate";
import {
  defaults,
  MAX_PHOTOS,
  WIDTH,
  HEIGHT,
  safeFilename,
  normalizeSettings,
  validateProject,
} from "./model.js";
import { renderPiece } from "./render.js";
import { loadPieceFonts } from "./fonts.js";
import { initDescriptions } from "./descriptions.js";
import {
  createPublicationStore,
  validCode,
  publicationZipName,
} from "./publications-store.js";
import { initPublications } from "./publications.js";
import { icon, fillIcons } from "./icons.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let state = {
  settings: { ...defaults },
  photos: [],
  logo: null,
  logoImage: null,
};
let selected = 0,
  fontsReady = false,
  busy = false,
  saveTimer,
  noticeTimer,
  renderFrame,
  database;
let saveQueue = Promise.resolve();
let publicationStore,
  activeCode = "",
  activeRevision = 0,
  saveError,
  legacyDraft;
fillIcons();
const descriptions = initDescriptions({
  getProperty: () => state.settings,
  onChange: () => changed(),
  notice,
});
const publications = initPublications({
  getStore: () => publicationStore,
  getActive: () => activeCode,
  getPhotoCount: () => state.photos.length,
  open: openPublication,
  home: async () => {
    if (busy) return false;
    descriptions.set(descriptions.get());
    await flushPublication();
    return true;
  },
  importPhotos: async (files) => {
    await addPhotos(files);
  },
  notice,
});

function notice(message, error = false, persistent = false) {
  clearTimeout(noticeTimer);
  $("#notice").textContent = message;
  $("#notice").classList.toggle("error", error);
  $("#notice").hidden = false;
  if (!persistent)
    noticeTimer = setTimeout(
      () => {
        $("#notice").hidden = true;
      },
      error ? 8000 : 4500,
    );
}
async function task(message, action) {
  if (busy) return;
  busy = true;
  $("main").inert = true;
  $(".app-header").inert = true;
  $("main").setAttribute("aria-busy", "true");
  notice(message, false, true);
  try {
    await action();
  } catch (error) {
    console.error(error);
    notice(
      error.message || "No se pudo completar la acción. Intenta de nuevo.",
      true,
    );
  } finally {
    busy = false;
    $("main").inert = false;
    $(".app-header").inert = false;
    $("main").removeAttribute("aria-busy");
  }
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          "No se pudo leer una imagen. Prueba con un JPG, PNG o WebP válido.",
        ),
      );
    img.src = src;
  });
}
function canvasBlob(canvas) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("No se pudo generar la imagen.")),
      "image/png",
    ),
  );
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function fileImage(file, isLogo = false) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(`“${file.name}”: usa una imagen JPG, PNG o WebP.`);
  if (file.size > 25 * 1024 * 1024)
    throw new Error(`“${file.name}” supera los 25 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const max = isLogo ? 1200 : 3000,
      scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!isLogo) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const src = canvas.toDataURL(isLogo ? "image/png" : "image/jpeg", 0.96);
    return { name: file.name, src, image: await loadImage(src) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function serialize() {
  return {
    version: 1,
    description: descriptions.get(),
    settings: { ...state.settings },
    logo: state.logo,
    photos: state.photos.map(({ name, src }) => ({ name, src })),
  };
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("piezas-estudio", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error(
          "Cierra otras pestañas de Piezas para habilitar el guardado.",
        ),
      );
  });
}
function readDraft() {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("projects", "readonly")
      .objectStore("projects")
      .get("draft");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function saveDraft() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!publicationStore) return Promise.resolve();
  const snapshot = serialize(),
    code = activeCode;
  let thumbnail = "";
  if (state.photos[0]) {
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 135;
    const img = state.photos[0].image;
    const scale = Math.min(180 / img.width, 135 / img.height);
    canvas
      .getContext("2d")
      .drawImage(
        img,
        (180 - img.width * scale) / 2,
        (135 - img.height * scale) / 2,
        img.width * scale,
        img.height * scale,
      );
    thumbnail = canvas.toDataURL("image/jpeg", 0.7);
  }
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const record = await publicationStore.save(
        snapshot,
        code,
        activeRevision,
        thumbnail,
      );
      if (code === activeCode && record) activeRevision = record.revision;
      saveError = null;
      $("#save-status").textContent = "Guardado en este navegador";
      $("#publication-status").textContent = code
        ? `#${code} · Guardado`
        : "Borrador guardado";
    })
    .catch((error) => {
      saveError = error;
      console.error(error);
      $("#save-status").textContent =
        "Sin guardado automático · Usa Guardar proyecto";
      notice(error.message, true);
    });
  return saveQueue;
}
async function flushPublication() {
  await saveDraft();
  if (saveError) throw saveError;
}
async function openPublication(code, reuseDraft = false, imported = null) {
  if (busy) throw new Error("Espera a que termine la operación actual.");
  if (!publicationStore)
    throw new Error(
      "El almacenamiento local no está disponible. Reinicia la app.",
    );
  if (!validCode(code))
    throw new Error(
      "Usa un código de hasta 24 letras, números, guiones o guiones bajos.",
    );
  busy = true;
  $("main").inert = true;
  $(".app-header").inert = true;
  try {
    descriptions.set(descriptions.get());
    await flushPublication();
    const record = await publicationStore.read(`publication:${code}`);
    if (
      imported &&
      record &&
      !(await confirmReplace(
        "Reemplazar publicación guardada",
        `Ya existe #${code}. ¿Reemplazar sus datos con el archivo importado?`,
      ))
    )
      return false;
    const branding = Object.fromEntries(
      ["navy", "accent", "secondary", "logoSize", "logoPosition"].map((key) => [
        key,
        state.settings[key],
      ]),
    );
    const next =
      imported ||
      record?.project ||
      (reuseDraft
        ? structuredClone(legacyDraft || serialize())
        : {
            version: 1,
            settings: {
              ...defaults,
              ...branding,
              reference: code,
              bedrooms: "",
              bathrooms: "",
              area: "",
            },
            photos: [],
            logo: state.logo,
            description: {
              ...descriptions.get(),
              source: "",
              output: "",
              reference: code,
            },
          });
    next.settings.reference = code;
    next.description = { ...next.description, reference: code };
    await hydrate(next);
    activeCode = code;
    activeRevision = record?.revision || 0;
    $("#reference").readOnly = true;
    $("#active-publication-code").textContent = `#${code}`;
    descriptions.show(false);
    showTab("property");
    await flushPublication();
    publications.showEditor();
    notice(
      `Publicación #${code} abierta. Fotos y descripción se guardan juntas.`,
    );
    return true;
  } finally {
    busy = false;
    $("main").inert = false;
    $(".app-header").inert = false;
  }
}
function changed(structure = false) {
  if (database) {
    $("#save-status").textContent = "Guardando cambios…";
    $("#publication-status").textContent = "Guardando cambios…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 400);
  }
  if (structure) {
    updatePhotoList();
    syncControls();
  }
  requestRender();
}
async function hydrate(project) {
  const clean = validateProject(project);
  const photos = [];
  for (const photo of clean.photos)
    photos.push({ ...photo, image: await loadImage(photo.src) });
  const logoImage = clean.logo ? await loadImage(clean.logo) : null;
  state = { settings: clean.settings, photos, logo: clean.logo, logoImage };
  descriptions.set({
    ...clean.description,
    operation: clean.settings.operation,
    reference: clean.settings.reference,
  });
  selected = 0;
  syncControls();
  updatePhotoList();
  render();
}
function syncControls() {
  $$("[data-field]").forEach((input) => {
    input.value = state.settings[input.dataset.field];
  });
  $("#logo-size-output").textContent = `${state.settings.logoSize} px`;
  $("#remove-logo").hidden = !state.logo;
  $("#logo-swatch").replaceChildren();
  if (state.logo) {
    const image = document.createElement("img");
    image.src = state.logo;
    image.alt = "Logo actual";
    $("#logo-swatch").append(image);
  } else $("#logo-swatch").innerHTML = icon("image");
}
function showTab(tab) {
  $$("[role=tab]").forEach((button) => {
    const active = button.dataset.tab === tab;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $$(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${tab}`;
  });
}
function selectPiece(index) {
  selected = Math.min(9, Math.max(0, index));
  render();
}
function requestRender() {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(render);
}
function render() {
  renderPiece($("#preview"), state, selected);
  $("#preview").setAttribute(
    "aria-label",
    `${selected === 0 ? "Portada" : `Fotografía ${selected + 1}`} del inmueble ${state.settings.reference || "sin código"}`,
  );
  $("#slide-counter").textContent =
    `${String(selected + 1).padStart(2, "0")} / 10`;
  $("#canvas-caption").textContent =
    `${String(selected + 1).padStart(2, "0")} — ${selected === 0 ? "PORTADA" : "FOTOGRAFÍA"}`;
  $("#previous").disabled = selected === 0;
  $("#next").disabled = selected === 9;
  const photo = state.photos[selected];
  $("#photo-count").textContent = state.photos.length;
  $("#pieces-summary").textContent = state.photos.length
    ? `1 portada${state.photos.length > 1 ? ` + ${state.photos.length - 1} fotografías` : ""} · ${state.photos.length}/10`
    : "1 portada + 9 fotografías";
  $("#download-one").disabled = !photo || !fontsReady;
  $("#export-all").disabled = !state.photos.length || !fontsReady;
  $("#export-all>span").textContent = state.photos.length
    ? `Descargar ${state.photos.length} ${state.photos.length === 1 ? "pieza" : "piezas"}`
    : "Descargar carrusel";
  $("#export-help").textContent = state.photos.length
    ? `PNG en alta resolución · ${state.photos.length} ${state.photos.length === 1 ? "pieza" : "piezas"} en un archivo ZIP${state.photos.length < 10 ? ` · Añade ${10 - state.photos.length} fotos para completar 10` : ""}`
    : "Carga 10 fotos para crear tu portada y 9 piezas con tu logo.";
  const filmstrip = $("#filmstrip");
  if (!filmstrip.children.length) {
    for (let i = 0; i < MAX_PHOTOS; i++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "thumbnail";
      button.setAttribute(
        "aria-label",
        i === 0 ? "Ver portada" : `Ver pieza ${i + 1}`,
      );
      const canvas = document.createElement("canvas");
      canvas.width = 108;
      canvas.height = 135;
      canvas.setAttribute("aria-hidden", "true");
      const number = document.createElement("span");
      number.className = "thumb-number";
      number.textContent = String(i + 1).padStart(2, "0");
      button.append(canvas, number);
      button.addEventListener("click", () => selectPiece(i));
      filmstrip.append(button);
    }
  }
  [...filmstrip.children].forEach((button, i) => {
    button.setAttribute("aria-pressed", String(selected === i));
    renderPiece(button.querySelector("canvas"), state, i);
  });
}
function updatePhotoList() {
  const list = $("#photo-list");
  list.replaceChildren();
  state.photos.forEach((photo, index) => {
    const row = document.createElement("div");
    row.className = "photo-item";
    const image = document.createElement("img");
    image.src = photo.src;
    image.alt = `Foto ${index + 1}`;
    const name = document.createElement("div");
    name.className = "photo-name";
    const title = document.createElement("strong");
    title.textContent = photo.name;
    const subtitle = document.createElement("small");
    subtitle.textContent =
      index === 0
        ? "01 · Portada"
        : `${String(index + 1).padStart(2, "0")} · Fotografía`;
    name.append(title, subtitle);
    const actions = document.createElement("div");
    actions.className = "photo-actions";
    for (const [action, label] of [
      ["up", "Mover antes"],
      ["down", "Mover después"],
      ["trash", "Quitar foto"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-button";
      button.innerHTML = icon(action);
      button.title = label;
      button.setAttribute("aria-label", `${label} ${index + 1}`);
      button.disabled =
        (action === "up" && index === 0) ||
        (action === "down" && index === state.photos.length - 1);
      button.addEventListener("click", () => {
        if (action === "trash") {
          state.photos.splice(index, 1);
          selected = Math.min(selected, Math.max(0, state.photos.length - 1));
        } else {
          const target = index + (action === "up" ? -1 : 1);
          [state.photos[index], state.photos[target]] = [
            state.photos[target],
            state.photos[index],
          ];
          selected = target;
        }
        changed(true);
      });
      actions.append(button);
    }
    row.append(image, name, actions);
    list.append(row);
  });
}
async function addPhotos(files) {
  if (!files.length) return;
  await task("Preparando tus fotografías…", async () => {
    const free = MAX_PHOTOS - state.photos.length;
    if (!free)
      throw new Error("Ya tienes 10 fotos. Quita una para añadir otra.");
    const errors = [],
      first = state.photos.length;
    let added = 0;
    for (const file of files) {
      if (state.photos.length >= MAX_PHOTOS) {
        errors.push("Se alcanzó el máximo de 10 fotos.");
        break;
      }
      try {
        state.photos.push(await fileImage(file));
        added++;
      } catch (error) {
        errors.push(error.message);
      }
    }
    selected = Math.min(first, Math.max(0, state.photos.length - 1));
    changed(true);
    saveDraft();
    notice(
      `${added} ${added === 1 ? "foto añadida" : "fotos añadidas"}.${errors.length ? ` ${errors.join(" ")}` : " Todas se muestran completas. Puedes cambiar su orden."}`,
      !!errors.length,
    );
  });
}
async function confirmReplace(title, description) {
  if (
    !state.photos.length &&
    !state.settings.reference &&
    !state.settings.location &&
    !state.logo &&
    !descriptions.hasContent()
  )
    return true;
  $("#confirm-title").textContent = title;
  $("#confirm-description").textContent = description;
  const dialog = $("#confirm-dialog");
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true },
    ),
  );
}

$$("[data-tab]").forEach((button) =>
  button.addEventListener("click", () => showTab(button.dataset.tab)),
);
$(".tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = $$("[data-tab]");
  let index = tabs.indexOf(document.activeElement);
  index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? 2
        : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
  showTab(tabs[index].dataset.tab);
  tabs[index].focus();
});
$("#go-photos").addEventListener("click", () => {
  showTab("photos");
  $("#tab-photos").focus();
});
$$("[data-field]").forEach((input) =>
  input.addEventListener("input", () => {
    state.settings = normalizeSettings({
      ...state.settings,
      [input.dataset.field]: input.value,
    });
    if (input.dataset.field === "logoSize")
      $("#logo-size-output").textContent = `${state.settings.logoSize} px`;
    if (input.dataset.field === "operation") {
      const caption = descriptions.get();
      descriptions.set({ ...caption, operation: state.settings.operation });
    }
    changed();
  }),
);
$("#previous").addEventListener("click", () => selectPiece(selected - 1));
$("#next").addEventListener("click", () => selectPiece(selected + 1));
$("#photos-input").addEventListener("change", (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  addPhotos(files);
});
for (const eventName of ["dragenter", "dragover"])
  $("#dropzone").addEventListener(eventName, (event) => {
    event.preventDefault();
    $("#dropzone").classList.add("dragover");
  });
for (const eventName of ["dragleave", "drop"])
  $("#dropzone").addEventListener(eventName, (event) => {
    event.preventDefault();
    $("#dropzone").classList.remove("dragover");
  });
$("#dropzone").addEventListener("drop", (event) =>
  addPhotos([...event.dataTransfer.files]),
);
// Avoid the browser navigating away when a file is dropped outside the upload target.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
$("#logo-input").addEventListener("change", (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  task("Preparando tu logo…", async () => {
    const logo = await fileImage(file, true);
    state.logo = logo.src;
    state.logoImage = logo.image;
    changed(true);
    saveDraft();
    notice("Tu logo ya aparece en todas las piezas.");
  });
});
$("#remove-logo").addEventListener("click", () => {
  state.logo = null;
  state.logoImage = null;
  changed(true);
});
$("#reset-colors").addEventListener("click", () => {
  for (const key of ["navy", "accent", "secondary"])
    state.settings[key] = defaults[key];
  changed(true);
});
$("#save-project").addEventListener("click", () => {
  if (busy) return;
  saveDraft();
  download(
    new Blob([JSON.stringify(serialize())], { type: "application/json" }),
    `${safeFilename(state.settings.reference || "nuevo")}.piezas`,
  );
  notice("Proyecto descargado con sus fotos, logo y ajustes.");
});
$("#open-project").addEventListener("click", () => $("#project-input").click());
$("#project-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 150 * 1024 * 1024)
    return notice("El proyecto supera los 150 MB permitidos.", true);
  try {
    const project = validateProject(JSON.parse(await file.text()));
    const code = project.settings.reference.trim();
    if (!validCode(code))
      throw new Error(
        "El archivo necesita un código válido para crear su publicación.",
      );
    await openPublication(code, false, project);
  } catch (error) {
    notice(error.message || "No se pudo abrir el proyecto.", true);
  }
});

$("#download-one").addEventListener("click", () =>
  task("Generando la pieza en alta resolución…", async () => {
    await loadPieceFonts();
    if (!state.photos[selected])
      throw new Error("Añade una foto a esta pieza primero.");
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    renderPiece(canvas, state, selected);
    download(
      await canvasBlob(canvas),
      `${safeFilename(state.settings.reference)}-${String(selected + 1).padStart(2, "0")}.png`,
    );
    notice("Pieza descargada en 1080 × 1350 px.");
  }),
);
$("#export-all").addEventListener("click", () =>
  task("Preparando tu carrusel…", async () => {
    publicationZipName(activeCode);
    await loadPieceFonts();
    if (!state.photos.length) throw new Error("Carga tus fotografías primero.");
    const files = {},
      canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    for (let i = 0; i < state.photos.length; i++) {
      notice(
        `Generando pieza ${i + 1} de ${state.photos.length}…`,
        false,
        true,
      );
      renderPiece(canvas, state, i);
      files[
        `${String(i + 1).padStart(2, "0")}-${i === 0 ? "portada" : "foto"}.png`
      ] = new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    download(
      new Blob([zipSync(files, { level: 0 })], { type: "application/zip" }),
      publicationZipName(activeCode),
    );
    notice(
      `Listo: ${state.photos.length} piezas exportadas en 1080 × 1350 px.`,
    );
  }),
);

async function loadDemo() {
  await task("Cargando tu ejemplo de Manga…", async () => {
    const images = [];
    for (let i = 1; i <= 10; i++)
      images.push(await loadImage(`/demo/${i}.png`));
    const canvas = document.createElement("canvas");
    canvas.width = 948;
    canvas.height = 695;
    canvas
      .getContext("2d")
      .drawImage(images[0], 66, 347, 948, 695, 0, 0, 948, 695);
    const first = canvas.toDataURL("image/png");
    canvas.width = 120;
    canvas.height = 120;
    canvas
      .getContext("2d")
      .drawImage(images[0], 894, 1158, 120, 120, 0, 0, 120, 120);
    const logo = canvas.toDataURL("image/png");
    const photos = [{ name: "Balcón · portada", src: first }];
    for (let i = 1; i < 10; i++) {
      canvas.width = images[i].naturalWidth;
      canvas.height = images[i].naturalHeight;
      canvas.getContext("2d").drawImage(images[i], 0, 0);
      photos.push({ name: `${i + 1}.png`, src: canvas.toDataURL("image/png") });
    }
    await hydrate({
      version: 1,
      settings: {
        ...defaults,
        location: "Manga",
        reference: "12238",
        bedrooms: "4",
        bathrooms: "5",
        area: "212",
      },
      logo,
      photos,
    });
    saveDraft();
    showTab("property");
    notice(
      "Ejemplo cargado. Estas fotos de referencia ya incluyen su logo; usa fotos originales para cambiarlo.",
    );
  });
}
$("#load-demo").addEventListener("click", async () => {
  if (
    !(await confirmReplace(
      "Cargar el ejemplo #12238",
      "El ejemplo reemplazará el proyecto abierto. Guarda una copia si quieres conservarlo.",
    ))
  )
    return;
  if (await openPublication("12238")) await loadDemo();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && saveTimer) saveDraft();
});

async function start() {
  $("main").inert = true;
  $(".app-header").inert = true;
  syncControls();
  try {
    await loadPieceFonts();
    fontsReady = true;
  } catch (error) {
    console.error(error);
    notice(
      "No se pudieron cargar las tipografías. Recarga la app para habilitar las descargas.",
      true,
      true,
    );
  }
  render();
  try {
    database = await openDatabase();
    publicationStore = createPublicationStore(database);
    legacyDraft = await publicationStore.read("legacy-uncoded-draft");
    const draft = await readDraft();
    if (draft) {
      await hydrate(draft);
      const code = state.settings.reference.trim();
      if (validCode(code)) {
        const record = await publicationStore.read(`publication:${code}`);
        if (record) {
          await hydrate(record.project);
          activeRevision = record.revision;
        }
        activeCode = code;
        if (!record) await flushPublication();
      } else {
        legacyDraft = draft;
        await publicationStore.archiveLegacy(draft);
      }
    }
    $("#resume-draft").hidden = !legacyDraft;
    await publications.refresh();
  } catch (error) {
    console.error(error);
    $("#save-status").textContent =
      "Usa Guardar proyecto para conservar tu trabajo";
    notice(
      "No se pudo recuperar el guardado local. Puedes abrir una copia .piezas o empezar un proyecto.",
      true,
    );
  } finally {
    $("main").inert = false;
    $(".app-header").inert = false;
  }
  $("#save-project").disabled = true;
  try {
    const response = await fetch("/demo/1.png", { method: "HEAD" });
    if (
      response.ok &&
      response.headers.get("content-type")?.startsWith("image/")
    )
      $("#load-demo").hidden = false;
  } catch {
    /* The example is optional and is never required to use the app. */
  }
}
start();
