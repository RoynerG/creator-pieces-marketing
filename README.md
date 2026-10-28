# Piezas · Estudio inmobiliario

App local en español para convertir diez fotos de un inmueble en un carrusel de **1080 × 1350 px**: una portada con datos y nueve fotografías con tu logo. Basada en las referencias del inmueble #12238.

## Abrir en Windows

1. Instala Node.js **22.12+** (también funciona con Node 24).
2. Abre **Iniciar Piezas.cmd** con doble clic. La primera vez instala las dependencias; requiere conexión.
3. La app se abre en **http://127.0.0.1:5173**. Mantén la ventana del servidor abierta mientras la usas. Para detenerlo, pulsa `Ctrl+C` en esa ventana.

Para desarrollo:

```sh
npm ci
npm run dev
```

El servidor escucha solamente en `127.0.0.1`. Después de instalar las dependencias, la app funciona sin conexión a Internet y sin servicios de pago. No hay fuentes externas, cuentas ni llamadas a servicios de imágenes.

## Crear las piezas

1. Completa negocio (venta/arriendo), tipo de inmueble, ubicación, código, habitaciones, baños y área. Deja un dato numérico vacío para ocultarlo en la portada.
2. En **Fotografías**, carga hasta 10 archivos JPG, PNG o WebP (25 MB por archivo). La primera foto es la portada. Para obtener diez piezas, carga diez fotos.
3. Usa las flechas para ordenar y las miniaturas para revisar. Todas las fotos se muestran completas, sin zoom ni recortes, conservando su proporción. Si sobra espacio, se rellena con el color principal de la marca.
4. En **Tu marca**, carga el logo y ajusta colores, tamaño y posición. En la portada el logo se mantiene en la franja derecha, con un tamaño máximo de 170 px; en las fotos puede ir a izquierda o derecha.
5. Pulsa **Descargar 10 piezas**. Obtendrás un ZIP con `01-portada.png` y `02-foto.png` a `10-foto.png`. También puedes descargar una pieza individual. Con menos fotos se exportan solo las piezas completas, sin duplicar ni inventar fotografías.

La interfaz muestra el estado de carga y exportación, tiene navegación por teclado y se adapta a pantallas pequeñas. No utiliza IA para modificar el inmueble.

## Guardar y retomar

- El borrador (fotos, logo y datos) se guarda automáticamente en **IndexedDB del navegador**. El navegador puede borrar sus datos; no es una copia de seguridad.
- **Guardar proyecto** descarga un archivo `.piezas` con todo el proyecto. **Abrir proyecto guardado** permite retomarlo en otro navegador/equipo. Tamaño máximo de importación: 150 MB.
- **Nuevo proyecto** conserva la marca y limpia los datos y las fotos del inmueble después de confirmar.
- Las fotos cargadas se normalizan a un máximo de 3000 px en su lado mayor y JPEG de alta calidad para limitar el uso de memoria. Los logos conservan transparencia en PNG. Los PNG finales siempre tienen 1080 × 1350 px.

## Ejemplo local

El botón **Ver ejemplo #12238** aparece si existe `public/demo/1.png` y los archivos `2.png` a `10.png`. Estas referencias son opcionales y están excluidas de Git. La app reconstruye la portada a partir de la fotografía y el logo visibles en `1.png`.

**Las referencias 2–10 ya traen el logo incrustado.** Sirven para comprobar el formato; para trabajar con otro logo carga las fotografías originales sin marca. Quitar o mover el logo de la app no elimina el que ya viene dentro de una fotografía.

## Comprobaciones y build

```sh
npm test
npm run build
npm run preview
```

Pruebas unitarias: fotos completas sin deformación en ambos formatos, validación de proyectos, compatibilidad con borradores anteriores, portabilidad de ajustes y nombres de descarga. La aplicación usa el mismo renderizador Canvas para la vista previa y los PNG exportados.

La compilación genera `dist/`. Si están presentes, también copia los ejemplos locales a `dist/demo/`; exclúyelos antes de distribuir una compilación que no deba contener esas fotos. Abre el build mediante un servidor HTTP, no haciendo doble clic en `index.html`.

## Estructura

- `src/main.js`: editor, fotos, proyectos, borrador y exportación ZIP.
- `src/render.js`: plantilla Canvas 2D, iconos y texto adaptable.
- `src/model.js`: datos, validación y ajuste proporcional de fotos completas.
- `src/styles.css`: diseño adaptable del editor.
- `tests/model.test.js`: pruebas con el runner nativo de Node.

Tecnologías: JavaScript, Canvas 2D, IndexedDB, Vite y fflate. Sin backend ni base de datos remota.
