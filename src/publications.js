import "./publications.css";
import { validCode } from "./publications-store.js";
export function initPublications({
  getStore,
  getActive,
  getPhotoCount,
  open,
  home,
  onEditor,
  importPhotos,
  notice,
}) {
  const $ = (selector) => document.querySelector(selector);
  let saved = [],
    folders = [],
    reuseDraft = false,
    selected = new Map(),
    available = [],
    loading = false;
  async function api(route, input) {
    const response = await fetch(
      `/api/library/${route}`,
      input
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }
        : {},
    );
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Reinicia la app para conectar la carpeta local.");
    }
    if (!response.ok)
      throw new Error(data.error || "No se pudo acceder a las fotos.");
    return data;
  }
  function showEditor() {
    onEditor();
    $("#publications-home").hidden = true;
    $("#publication-editor").hidden = false;
    $("#save-project").disabled = false;
    $("#active-publication-code").textContent = `#${getActive()}`;
    $("#reference").readOnly = true;
    $("#caption-operation").disabled = true;
    $("#active-publication-code").scrollIntoView({ block: "nearest" });
  }
  function render() {
    const query = $("#publication-search").value.trim().toLowerCase();
    $("#publication-list").replaceChildren();
    $("#publication-count").textContent = saved.length;
    const matches = saved.filter((item) =>
      `${item.code} ${item.location}`.toLowerCase().includes(query),
    );
    $("#publications-empty").hidden = matches.length > 0;
    $("#publications-empty").textContent = query
      ? "No hay publicaciones que coincidan con tu búsqueda."
      : "Crea tu primera publicación o abre una carpeta por código.";
    for (const item of matches) {
      const button = document.createElement("button");
      button.className = "publication-card";
      button.type = "button";
      if (item.thumbnail) {
        const img = document.createElement("img");
        img.src = item.thumbnail;
        img.alt = "";
        button.append(img);
      } else {
        const cover = document.createElement("div");
        cover.className = "publication-card-cover";
        cover.textContent = `#${item.code}`;
        button.append(cover);
      }
      const info = document.createElement("div");
      info.className = "publication-card-info";
      const title = document.createElement("strong");
      title.textContent = `#${item.code}`;
      const location = document.createElement("span");
      location.textContent = item.location || "Ubicación por completar";
      const status = document.createElement("small");
      status.textContent = `${item.photos}/10 fotos · ${item.description ? "Descripción lista" : "Sin descripción"}`;
      const date = document.createElement("small");
      date.textContent = `Editado ${new Date(item.updatedAt).toLocaleDateString("es-CO")}`;
      info.append(title, location, status, date);
      button.append(info);
      button.addEventListener("click", async () => {
        try {
          await open(item.code);
        } catch (error) {
          notice(error.message, true);
        }
      });
      $("#publication-list").append(button);
    }
    $("#library-folders").replaceChildren();
    const folderQuery = $("#folder-search").value.trim().toLowerCase();
    const folderMatches = folders.filter((code) =>
      code.toLowerCase().includes(folderQuery),
    );
    $("#folder-empty").hidden = folderMatches.length > 0;
    for (const code of folderMatches) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-button";
      const strong = document.createElement("strong");
      strong.textContent = `#${code}`;
      const span = document.createElement("span");
      span.textContent = saved.some((item) => item.code === code)
        ? "Abrir publicación"
        : "Crear publicación";
      button.append(strong, span);
      button.addEventListener("click", async () => {
        try {
          if (await open(code)) await browsePhotos();
        } catch (error) {
          notice(error.message, true);
        }
      });
      $("#library-folders").append(button);
    }
  }
  async function refreshFolders() {
    $("#refresh-library").disabled = true;
    $("#library-status").textContent = "Leyendo carpetas…";
    try {
      const result = await api("folders");
      folders = result.folders;
      $("#library-path").value = result.directory;
      $("#library-status").textContent =
        `${folders.length} carpetas · ${result.directory}`;
    } catch (error) {
      folders = [];
      $("#library-status").textContent = error.message;
      $("#library-settings").open = true;
    } finally {
      $("#library-config-status").textContent =
        $("#library-status").textContent;
      $("#refresh-library").disabled = false;
      render();
    }
  }
  async function refresh() {
    saved = (await getStore()?.list()) || [];
    render();
    try {
      const config = await api("config");
      $("#library-path").value = config.directory;
    } catch (error) {
      $("#library-status").textContent = error.message;
    }
    await refreshFolders();
  }
  $("#publication-search").addEventListener("input", render);
  $("#folder-search").addEventListener("input", render);
  $("#refresh-library").addEventListener("click", refreshFolders);
  $("#library-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      await api("config", { directory: $("#library-path").value });
      await refreshFolders();
      notice("Carpeta de fotos configurada.");
    } catch (error) {
      $("#library-status").textContent = error.message;
      $("#library-config-status").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  function showNew(reuse = false) {
    reuseDraft = reuse;
    $("#new-publication-code").value = "";
    $("#publication-form-error").textContent = "";
    $("#publication-dialog").showModal();
    $("#new-publication-code").focus();
  }
  $("#new-project").addEventListener("click", () => showNew());
  $("#resume-draft").addEventListener("click", () => showNew(true));
  $("#cancel-publication").addEventListener("click", () =>
    $("#publication-dialog").close(),
  );
  $("#publication-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = $("#new-publication-code").value.trim();
    if (!validCode(code)) {
      $("#publication-form-error").textContent = "Escribe un código válido.";
      return;
    }
    event.submitter.disabled = true;
    try {
      if (await open(code, reuseDraft)) {
        $("#publication-dialog").close();
        if (reuseDraft) $("#resume-draft").hidden = true;
      }
    } catch (error) {
      $("#publication-form-error").textContent = error.message;
    } finally {
      event.submitter.disabled = false;
    }
  });
  $("#back-publications").addEventListener("click", async () => {
    try {
      await home();
    } catch (error) {
      notice(error.message, true);
    }
  });
  function updateSelection() {
    const capacity = 10 - getPhotoCount();
    $("#library-selection-count").textContent =
      `${selected.size} seleccionadas · ${capacity} espacios disponibles`;
    $("#import-library-photos").disabled = !selected.size || loading;
    for (const checkbox of $("#library-photo-list").querySelectorAll("input"))
      checkbox.disabled =
        loading || (!checkbox.checked && selected.size >= capacity);
  }
  async function browsePhotos() {
    selected = new Map();
    available = [];
    loading = false;
    $("#photo-library-title").textContent = `Fotos de #${getActive()}`;
    $("#photo-library-status").textContent = "Leyendo imágenes…";
    $("#library-photo-list").replaceChildren();
    updateSelection();
    $("#photo-library-dialog").showModal();
    try {
      const result = await api(
        `photos?code=${encodeURIComponent(getActive())}`,
      );
      available = result.files;
      $("#photo-library-status").textContent = available.length
        ? `${available.length} imágenes. Selecciona hasta ${10 - getPhotoCount()}. La primera será la portada.`
        : "Esta carpeta no contiene imágenes JPG, PNG o WebP.";
      for (const file of available) {
        const label = document.createElement("label");
        label.className = "library-photo";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = file.name;
        const image = document.createElement("img");
        image.src = file.url;
        image.alt = "";
        image.loading = "lazy";
        image.addEventListener("error", () => {
          image.hidden = true;
          label.classList.add("image-unavailable");
        });
        const title = document.createElement("span");
        title.textContent = file.name;
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.set(file.name, file);
          else selected.delete(file.name);
          updateSelection();
        });
        label.append(checkbox, image, title);
        $("#library-photo-list").append(label);
      }
      updateSelection();
    } catch (error) {
      $("#photo-library-status").textContent =
        `${error.message} Puedes cambiar la ruta desde Configuración o cargar archivos manualmente.`;
    }
  }
  $("#browse-property-photos").addEventListener("click", browsePhotos);
  $("#close-photo-library").addEventListener("click", () => {
    if (!loading) $("#photo-library-dialog").close();
  });
  $("#photo-library-dialog").addEventListener("cancel", (event) => {
    if (loading) event.preventDefault();
  });
  $("#import-library-photos").addEventListener("click", async () => {
    loading = true;
    updateSelection();
    $("#close-photo-library").disabled = true;
    try {
      const files = [];
      for (const file of selected.values()) {
        $("#photo-library-status").textContent = `Preparando ${file.name}…`;
        const response = await fetch(file.url);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error);
        }
        const blob = await response.blob();
        files.push(new File([blob], file.name, { type: blob.type }));
      }
      $("#photo-library-dialog").close();
      await importPhotos(files);
      $("#tab-photos").click();
    } catch (error) {
      $("#photo-library-status").textContent = error.message;
    } finally {
      loading = false;
      $("#close-photo-library").disabled = false;
      updateSelection();
    }
  });
  return { refresh, showEditor, showNew };
}
