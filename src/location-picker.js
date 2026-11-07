import { MAIN_BARRIOS, OTHER_BARRIOS, searchBarrios } from "./barrios.js";

export function initLocationPicker({ onChange }) {
  const input = document.querySelector("#location"),
    list = document.querySelector("#location-list");
  let value = "",
    options = [],
    active = -1,
    open = false;
  function addHeading(text) {
    const heading = document.createElement("li");
    heading.className = "location-heading";
    heading.setAttribute("role", "presentation");
    heading.textContent = text;
    list.append(heading);
  }
  function addOption(name, label = name) {
    const index = options.length,
      option = document.createElement("li");
    option.id = `location-option-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(name === value));
    option.textContent = label;
    // Keeps focus in the search field so blur does not close the list first.
    option.addEventListener("mousedown", (event) => event.preventDefault());
    option.addEventListener("click", () => choose(name));
    list.append(option);
    options.push({ name, element: option });
  }
  function highlight(index) {
    options[active]?.element.classList.remove("active");
    active = index;
    const current = options[active]?.element;
    current?.classList.add("active");
    current?.scrollIntoView({ block: "nearest" });
    if (current) input.setAttribute("aria-activedescendant", current.id);
    else input.removeAttribute("aria-activedescendant");
  }
  function show(query) {
    const text = query.trim();
    list.replaceChildren();
    options = [];
    active = -1;
    if (text) {
      const matches = searchBarrios(text);
      matches.forEach((name) => addOption(name));
      if (!matches.includes(text)) addOption(text, `Usar “${text}”`);
      highlight(0);
    } else {
      addHeading("Principales");
      MAIN_BARRIOS.forEach((name) => addOption(name));
      addHeading("Todos los barrios");
      OTHER_BARRIOS.forEach((name) => addOption(name));
    }
    open = true;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function close() {
    open = false;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  function choose(name) {
    value = name;
    input.value = name;
    close();
    onChange(name);
  }
  function reopen() {
    input.select();
    show("");
  }
  input.addEventListener("focus", reopen);
  // The field keeps focus after choosing, so clicking it fires no focus event.
  input.addEventListener("click", () => {
    if (!open) reopen();
  });
  input.addEventListener("input", () => show(input.value));
  input.addEventListener("blur", () => {
    close();
    input.value = value;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
      input.value = value;
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return reopen();
      const step = event.key === "ArrowDown" ? 1 : -1;
      if (options.length)
        highlight((active + step + options.length) % options.length);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (options[active]) choose(options[active].name);
    }
  });
  return {
    set(location) {
      value = location;
      if (document.activeElement !== input) input.value = location;
    },
  };
}
