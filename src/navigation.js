import "./navigation.css";

export function initNavigation({
  beforeLeave,
  refresh,
  create,
  openProject,
  configureAI,
  showDescription,
  hasPublication,
  notice,
}) {
  const $ = (selector) => document.querySelector(selector);
  const views = {
    inicio: "app-home",
    publicaciones: "publications-home",
    fotos: "photos-home",
    configuracion: "settings-home",
    publicacion: "publication-editor",
  };
  let current = "inicio",
    descriptionIntent = false,
    navigating = false;
  function display(route, historyMode = "push") {
    current = route;
    for (const [key, id] of Object.entries(views))
      $("#" + id).hidden = key !== route;
    $("#save-project").hidden = route !== "publicacion";
    $("#save-project").disabled = route !== "publicacion";
    document.querySelectorAll(".main-nav [data-route]").forEach((button) => {
      if (
        button.dataset.route === route ||
        (route === "publicacion" && button.dataset.route === "publicaciones")
      )
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (historyMode !== "none")
      history[historyMode + "State"]({}, "", "#" + route);
    const heading = $("#" + views[route]).querySelector("h1, h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }
  async function go(route, historyMode = "push") {
    if (navigating) return;
    if (!views[route] || (route === "publicacion" && !hasPublication()))
      route = "inicio";
    navigating = true;
    try {
      if (!(await beforeLeave())) {
        history.replaceState({}, "", "#" + current);
        return;
      }
      await refresh();
      display(route, historyMode);
    } catch (error) {
      history.replaceState({}, "", "#" + current);
      notice(error.message, true);
    } finally {
      navigating = false;
    }
  }
  document.querySelectorAll("[data-route]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.preventDefault();
      descriptionIntent = button.dataset.intent === "description";
      $("#publication-purpose").textContent = descriptionIntent
        ? "Elige una publicación para crear o editar su descripción."
        : "Encuentra cada inmueble con sus fotos, piezas y descripción.";
      go(button.dataset.route);
    }),
  );
  document.querySelectorAll("[data-action='new']").forEach((button) =>
    button.addEventListener("click", () => {
      descriptionIntent = false;
      create();
    }),
  );
  document
    .querySelectorAll("[data-action='import']")
    .forEach((button) => button.addEventListener("click", openProject));
  $("#settings-configure-ai").addEventListener("click", configureAI);
  document
    .querySelectorAll("[data-proxy]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        $("#" + button.dataset.proxy).click(),
      ),
    );
  window.addEventListener("popstate", () => go(location.hash.slice(1), "none"));
  return {
    go,
    start() {
      display(
        views[location.hash.slice(1)] && location.hash !== "#publicacion"
          ? location.hash.slice(1)
          : "inicio",
        "replace",
      );
    },
    editor() {
      display("publicacion");
      showDescription(descriptionIntent);
      descriptionIntent = false;
    },
  };
}
