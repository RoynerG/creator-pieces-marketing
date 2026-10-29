export function initDesktop({ flush, notice }) {
  const desktop = window.piezasDesktop;
  if (!desktop) return;
  document.body.classList.add("desktop-app");
  const bar = document.querySelector("#desktop-status"),
    message = document.querySelector("#desktop-update-message"),
    install = document.querySelector("#install-update");
  bar.hidden = false;
  const show = (state) => {
    message.textContent = state.message;
    install.hidden = state.status !== "ready";
    document.querySelector("#check-updates").disabled = [
      "checking",
      "downloading",
    ].includes(state.status);
  };
  desktop.info().then((info) => {
    document.querySelector("#desktop-version").textContent =
      `Piezas ${info.version} · SQLite`;
    show(info.update);
  });
  desktop.onUpdate(show);
  document
    .querySelector("#check-updates")
    .addEventListener("click", () => desktop.checkUpdates());
  document
    .querySelector("#open-data-folder")
    .addEventListener("click", () => desktop.openDataFolder());
  install.addEventListener("click", async () => {
    install.disabled = true;
    try {
      await flush();
      const result = await desktop.installUpdate();
      if (result.error) throw new Error(result.error);
    } catch (error) {
      notice(error.message, true);
    } finally {
      install.disabled = false;
    }
  });
  desktop.onCloseRequested(async () => {
    try {
      await flush();
      desktop.readyToClose();
    } catch (error) {
      notice(
        `No se cerró la app para proteger tus cambios. ${error.message}`,
        true,
        true,
      );
    }
  });
  const choose = document.querySelector("#choose-library-folder");
  choose.hidden = false;
  choose.addEventListener("click", async () => {
    const folder = await desktop.chooseFolder();
    if (folder) {
      document.querySelector("#library-path").value = folder;
      document
        .querySelector("#library-form")
        .requestSubmit(
          document.querySelector("#library-form button[type=submit]"),
        );
    }
  });
}
