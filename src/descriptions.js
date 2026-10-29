import "./descriptions.css";
import {
  descriptionDefaults,
  normalizeDescription,
  plainCaption,
} from "./caption-model.js";

// Deliberately render a small text format, never model-provided HTML.
function renderCaption(target, text) {
  target.replaceChildren();
  for (const paragraph of text.split(/\n\s*\n/)) {
    const p = document.createElement("p");
    paragraph.split("\n").forEach((line, index) => {
      if (index) p.append(document.createElement("br"));
      for (const part of line.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g)) {
        if (part.startsWith("**") && part.endsWith("**")) {
          const strong = document.createElement("strong");
          strong.textContent = part.slice(2, -2);
          p.append(strong);
        } else if (/^https?:\/\//.test(part)) {
          const link = document.createElement("a");
          link.textContent = part;
          try {
            const url = new URL(part);
            if (["http:", "https:"].includes(url.protocol)) {
              link.href = url.href;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
            }
          } catch {
            /* Invalid URLs remain visible text. */
          }
          p.append(link);
        } else p.append(document.createTextNode(part));
      }
    });
    target.append(p);
  }
}
export function initDescriptions({ getProperty, onChange, notice }) {
  const $ = (selector) => document.querySelector(selector);
  let data = { ...descriptionDefaults },
    previous = "",
    editing = false,
    busy = false,
    controller,
    generation = 0;
  let config = {
      configured: false,
      model: "MiniMax-M3.1-Flash",
      remember: false,
    },
    available = false;
  const fields = {
    source: "#property-sheet",
    operation: "#caption-operation",
    city: "#caption-city",
    phone: "#caption-phone",
    brand: "#caption-brand",
  };
  async function api(route, input, signal) {
    let response;
    try {
      response = await fetch(`/api/ai/${route}`, {
        method: input === undefined ? "GET" : "POST",
        ...(input === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            }),
        signal,
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error(
        "No se pudo conectar con el servidor local. Abre la app con Iniciar Piezas.cmd.",
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        "El generador necesita el servidor local actualizado. Reinicia la app con Iniciar Piezas.cmd.",
      );
    }
    if (!response.ok)
      throw new Error(result.error || "No se pudo completar la solicitud.");
    return result;
  }
  function status() {
    $("#ai-connection").textContent = !available
      ? "Servidor local sin conexión"
      : config.configured
        ? `MiniMax configurado · ${config.model}`
        : "Añade tu clave de MiniMax para empezar";
    $("#ai-connection").classList.toggle(
      "connected",
      available && config.configured,
    );
  }
  async function refreshConfig() {
    try {
      config = await api("config");
      available = true;
    } catch {
      available = false;
    }
    status();
  }
  function showWorkspace(description) {
    $("#pieces-workspace").hidden = description;
    $("#description-workspace").hidden = !description;
    $("#show-description").setAttribute("aria-pressed", String(description));
    $("#show-pieces").setAttribute("aria-pressed", String(!description));
    if (description) refreshConfig();
  }
  $("#show-pieces").addEventListener("click", () => showWorkspace(false));
  $("#show-description").addEventListener("click", () => showWorkspace(true));
  function update() {
    const hasOutput = !!data.output.trim();
    $("#description-empty").hidden = hasOutput || busy;
    $("#description-output").hidden = !hasOutput || editing;
    $("#description-edit").hidden = !editing;
    $("#edit-description").setAttribute(
      "aria-label",
      editing ? "Terminar edición" : "Editar descripción",
    );
    $("#edit-description").setAttribute("aria-pressed", String(editing));
    renderCaption($("#description-output"), data.output);
    renderCaption($("#expanded-description-output"), data.output);
    $("#caption-length").textContent =
      `${plainCaption(data.output).length.toLocaleString("es-CO")} caracteres`;
    $("#sheet-count").textContent =
      `${data.source.length.toLocaleString("es-CO")} / 18.000 caracteres`;
    for (const id of [
      "copy-description",
      "expand-description",
      "edit-description",
      "caption-cta",
      "caption-shorter",
    ])
      $(`#${id}`).disabled = !hasOutput || busy;
    $("#edit-description").disabled = (!hasOutput && !editing) || busy;
    $("#description-edit").disabled = busy;
    for (const selector of Object.values(fields))
      $(selector).disabled = busy || selector === "#caption-operation";
    for (const id of ["configure-ai", "generate-description", "use-piece-data"])
      $(`#${id}`).disabled = busy;
    $("#cancel-description").hidden = !busy;
    $("#undo-description").hidden = !previous;
    $("#undo-description").disabled = busy;
    $("#description-result")?.setAttribute("aria-busy", String(busy));
    $("#generate-description span").textContent = busy
      ? "Generando…"
      : "Generar descripción";
  }
  function sync() {
    for (const [key, selector] of Object.entries(fields))
      $(selector).value = data[key];
    $("#description-edit").value = data.output;
    update();
  }
  for (const [key, selector] of Object.entries(fields))
    $(selector).addEventListener("input", (event) => {
      data[key] = event.target.value;
      update();
      onChange();
    });
  function openConfig() {
    $("#minimax-key").value = "";
    $("#minimax-key").placeholder = config.configured
      ? "Clave guardada · deja vacío para conservarla"
      : "sk-cp…";
    $("#minimax-model").value = config.model;
    $("#remember-minimax-key").checked = config.remember;
    $("#forget-minimax").hidden = !config.configured;
    $("#ai-settings-status").textContent = "";
    $("#ai-settings-dialog").showModal();
  }
  $("#configure-ai").addEventListener("click", async () => {
    await refreshConfig();
    openConfig();
  });
  $("#close-ai-settings").addEventListener("click", () =>
    $("#ai-settings-dialog").close(),
  );
  $("#ai-settings-dialog").addEventListener("close", () => {
    $("#minimax-key").value = "";
  });
  $("#ai-settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#save-minimax").disabled = true;
    $("#forget-minimax").disabled = true;
    $("#ai-settings-status").textContent = "Guardando en este equipo…";
    try {
      config = await api("config", {
        apiKey: $("#minimax-key").value,
        model: $("#minimax-model").value,
        remember: $("#remember-minimax-key").checked,
      });
      available = true;
      status();
      $("#ai-settings-dialog").close();
      notice(
        "Configuración guardada. La clave se validará con MiniMax al generar.",
      );
    } catch (error) {
      $("#ai-settings-status").textContent = error.message;
    } finally {
      $("#save-minimax").disabled = false;
      $("#forget-minimax").disabled = false;
    }
  });
  $("#forget-minimax").addEventListener("click", async () => {
    $("#forget-minimax").disabled = true;
    $("#save-minimax").disabled = true;
    try {
      config = await api("config", { clear: true });
      status();
      $("#ai-settings-dialog").close();
      notice("Clave eliminada de la sesión y del archivo local.");
    } catch (error) {
      $("#ai-settings-status").textContent = error.message;
    } finally {
      $("#forget-minimax").disabled = false;
      $("#save-minimax").disabled = false;
    }
  });
  async function generate(action) {
    if (busy) return;
    $("#description-error").hidden = true;
    if (data.source.trim().length < 40) {
      $("#description-error").textContent =
        "Pega la descripción y las especificaciones del inmueble (mínimo 40 caracteres).";
      $("#description-error").hidden = false;
      $("#property-sheet").focus();
      return;
    }
    // The server is authoritative; refresh before a request because another tab may have changed the key.
    const id = ++generation;
    busy = true;
    update();
    await refreshConfig();
    if (id !== generation) return;
    if (!config.configured || !available) {
      busy = false;
      update();
      openConfig();
      return;
    }
    controller = new AbortController();
    editing = false;
    const snapshot = {
      ...data,
      reference: getProperty().reference,
      operation: getProperty().operation,
      publicationCode: getProperty().reference,
    };
    $("#writing-status").textContent =
      action === "generate"
        ? "MiniMax está redactando tu publicación…"
        : "MiniMax está preparando una nueva versión…";
    update();
    try {
      const result = await api(
        "generate",
        { ...snapshot, action, current: snapshot.output },
        controller.signal,
      );
      if (id !== generation) return;
      previous = data.output;
      data.output = result.text;
      $("#description-edit").value = data.output;
      $("#writing-status").textContent = `Listo · ${result.model}`;
      onChange();
    } catch (error) {
      if (id !== generation) return;
      $("#writing-status").textContent =
        error.name === "AbortError"
          ? "Generación cancelada. Tu texto anterior se conserva."
          : "No se pudo generar la descripción.";
      if (error.name !== "AbortError") {
        $("#description-error").textContent = error.message;
        $("#description-error").hidden = false;
      }
    } finally {
      if (id === generation) {
        busy = false;
        controller = undefined;
        update();
      }
    }
  }
  $("#generate-description").addEventListener("click", () =>
    generate("generate"),
  );
  $("#caption-cta").addEventListener("click", () => generate("cta"));
  $("#caption-shorter").addEventListener("click", () => generate("shorter"));
  $("#cancel-description").addEventListener("click", () => controller?.abort());
  $("#edit-description").addEventListener("click", () => {
    editing = !editing;
    $("#description-edit").value = data.output;
    update();
    if (editing) $("#description-edit").focus();
  });
  $("#description-edit").addEventListener("input", (event) => {
    data.output = event.target.value;
    update();
    onChange();
  });
  $("#undo-description").addEventListener("click", () => {
    [data.output, previous] = [previous, data.output];
    $("#description-edit").value = data.output;
    update();
    onChange();
  });
  async function copy() {
    try {
      await navigator.clipboard.writeText(plainCaption(data.output));
      $("#writing-status").textContent =
        "Texto copiado con emojis y saltos de línea, sin marcas de Markdown.";
      notice("Descripción copiada.");
    } catch {
      editing = true;
      $("#description-edit").value = plainCaption(data.output);
      update();
      $("#description-edit").focus();
      $("#description-edit").select();
      notice(
        "No se pudo acceder al portapapeles. El texto está seleccionado: pulsa Ctrl+C.",
        true,
      );
    }
  }
  $("#copy-description").addEventListener("click", copy);
  $("#copy-expanded-description").addEventListener("click", copy);
  $("#expand-description").addEventListener("click", () => {
    renderCaption($("#expanded-description-output"), data.output);
    $("#expanded-description").showModal();
  });
  $("#close-expanded-description").addEventListener("click", () =>
    $("#expanded-description").close(),
  );
  $("#use-piece-data").addEventListener("click", () => {
    if (data.source.trim()) {
      notice(
        "La ficha ya tiene contenido. Vacía el campo si quieres empezar con los datos de las piezas.",
      );
      return;
    }
    const p = getProperty();
    data.reference = p.reference;
    data.operation = p.operation;
    data.source = [
      `Código ID: ${p.reference}`,
      `Tipo: ${p.propertyType}`,
      p.location ? `Ubicación: ${p.location}` : "",
      "Especificaciones",
      p.bedrooms !== "" ? `Habitaciones: ${p.bedrooms}` : "",
      p.bathrooms !== "" ? `Baños: ${p.bathrooms}` : "",
      p.area !== "" ? `Área construida: ${p.area} m²` : "",
    ]
      .filter(Boolean)
      .join("\n");
    sync();
    onChange();
    notice(
      "Datos copiados. Añade la descripción y las características que quieras destacar.",
    );
  });
  function set(value) {
    controller?.abort();
    generation++;
    busy = false;
    editing = false;
    previous = "";
    data = normalizeDescription(value);
    $("#description-error").hidden = true;
    $("#writing-status").textContent = "";
    sync();
  }
  sync();
  refreshConfig();
  return {
    show: showWorkspace,
    isBusy: () => busy,
    get: () => normalizeDescription(data),
    set,
    reset() {
      set({
        ...data,
        source: "",
        output: "",
        reference: "",
        operation: getProperty().operation,
      });
    },
    hasContent: () => !!(data.source.trim() || data.output.trim()),
  };
}
