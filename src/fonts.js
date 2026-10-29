import "@fontsource/poppins/latin-200.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-700.css";

// Canvas must measure and paint with the actual local fonts, including on a cold start.
let loading;
export function loadPieceFonts() {
  loading ??= Promise.all(
    [
      '200 46.667px "Poppins"',
      '400 28px "Poppins"',
      '700 66.667px "Poppins"',
      '500 28px "Montserrat"',
      '700 40px "Montserrat"',
    ].map(async (font) => {
      const faces = await document.fonts.load(
        font,
        "Manga #12238 4 habs. 5 baños 212 m²",
      );
      if (!faces.length || faces.some((face) => face.status !== "loaded")) {
        throw new Error(
          "No se pudieron cargar las tipografías. Recarga la app antes de descargar las piezas.",
        );
      }
    }),
  ).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
