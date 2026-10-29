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

El servidor escucha solamente en `127.0.0.1`. Después de instalar las dependencias, el editor de imágenes funciona sin conexión a Internet y sin servicios de pago. El generador opcional de descripciones requiere Internet y una clave de MiniMax Coding Plan. No hay fuentes externas ni llamadas a servicios de imágenes.

## Crear las piezas

1. Completa negocio (venta/arriendo), tipo de inmueble, ubicación, código, habitaciones, baños y área. Deja un dato numérico vacío para ocultarlo en la portada.
2. En **Fotografías**, carga hasta 10 archivos JPG, PNG o WebP (25 MB por archivo). La primera foto es la portada. Para obtener diez piezas, carga diez fotos.
3. Usa las flechas para ordenar y las miniaturas para revisar. Todas las fotos se muestran completas, sin zoom ni recortes, conservando su proporción. Si sobra espacio, se rellena con el color principal de la marca.
4. En **Tu marca**, carga el logo y ajusta colores, tamaño y posición. En la portada el logo se mantiene en la franja derecha, con un tamaño máximo de 170 px; en las fotos puede ir a izquierda o derecha.
5. Pulsa **Descargar 10 piezas**. Obtendrás un ZIP con `01-portada.png` y `02-foto.png` a `10-foto.png`. También puedes descargar una pieza individual. Con menos fotos se exportan solo las piezas completas, sin duplicar ni inventar fotografías.

La interfaz muestra el estado de carga y exportación, tiene navegación por teclado y se adapta a pantallas pequeñas. No utiliza IA para modificar el inmueble.

### Tipografías de las piezas

- **Poppins Bold (700):** negocio y tipo de inmueble. El negocio usa 66,67 px, equivalente a los 50 pt del ejemplo.
- **Poppins ExtraLight (200):** ubicación, 46,67 px (35 pt).
- **Montserrat Bold (700):** código, 40 px (30 pt).
- **Montserrat Medium (500):** habitaciones, baños y área, 28 px.

Las fuentes se distribuyen localmente con los paquetes Fontsource y se incluyen en el build; no necesitan estar instaladas en Windows ni se descargan de Google al usar la app. La vista previa y la exportación esperan a que estén cargadas. Los tamaños se reducen automáticamente si un texto largo no cabe. La interfaz del editor conserva su tipografía del sistema.

## Generar descripciones con MiniMax

1. Abre **Crear descripción → Configurar MiniMax**. Introduce tu clave de suscripción **Coding Plan** (prefijo `sk-cp`) y elige un modelo incluido en tu plan. Por defecto se usa `MiniMax-M2.7`.
2. La clave queda en la memoria del servidor. Opcionalmente, **Recordar la clave en este equipo** la guarda sin cifrar en `.local/minimax.json`, excluido de Git y bloqueado en el servidor web. **Olvidar clave** elimina ambos. Nunca se devuelve al navegador ni se incluye en proyectos exportados. Configúrala por separado en cada PC.
3. Pega la ficha completa: descripción, especificaciones y características. Revisa negocio, ciudad, teléfono, web y marca. **Usar datos de las piezas** inicia una ficha cuando el campo está vacío.
4. Pulsa **Generar descripción**. La tarjeta presenta título, párrafo, características con emojis, amenidades, código, contacto y hashtags. El código se toma de la ficha; el teléfono y la web se añaden tal como los escribiste.
5. Puedes **copiar**, **ampliar** o **editar** el texto. Los dos botones inferiores solicitan un llamado a la acción más directo o una versión más breve. **Volver al texto anterior** permite comparar la última modificación. Copiar elimina las marcas `**` de Markdown y conserva emojis y saltos de línea.

Solo se envía texto a MiniMax al generar o ajustar. Las fotografías no se envían. Cada solicitud consume la cuota del plan; los errores de autenticación, cuota o conexión se muestran sin reemplazar la versión anterior. Puedes cancelar una solicitud en curso. Revisa siempre la exactitud del texto antes de publicarlo.

La integración utiliza el [endpoint oficial compatible con OpenAI de MiniMax](https://platform.minimax.io/docs/api-reference/text-openai-api) desde el servidor local. No acepta claves de pago por uso ni cambia automáticamente de modalidad. El generador requiere `npm run dev` o `npm run preview` en este repositorio; un alojamiento de archivos estáticos por sí solo no ejecuta la integración.

## Guardar y retomar

- El borrador (fotos, logo, datos, ficha y descripción redactada) se guarda automáticamente en **IndexedDB del navegador**. El navegador puede borrar sus datos; no es una copia de seguridad.
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

Pruebas: fotos completas sin deformación, proyectos portables, formato de publicaciones, privacidad de claves, solicitudes locales, persistencia opcional y errores/cuota/tiempos de espera de MiniMax. La API externa se simula en las pruebas; no requieren una clave ni consumen cuota. La aplicación usa el mismo renderizador Canvas para la vista previa y los PNG exportados.

La compilación genera `dist/`. Si están presentes, también copia los ejemplos locales a `dist/demo/`; exclúyelos antes de distribuir una compilación que no deba contener esas fotos. Abre el build mediante un servidor HTTP, no haciendo doble clic en `index.html`.

## Estructura

- `src/main.js`: editor, fotos, proyectos, borrador y exportación ZIP.
- `src/render.js`: plantilla Canvas 2D, iconos y texto adaptable.
- `src/model.js`: datos, validación y ajuste proporcional de fotos completas.
- `src/styles.css`: diseño adaptable del editor.
- `src/descriptions.js` y `src/descriptions.css`: generador, edición y acciones de texto.
- `src/caption-model.js`: datos portables de la descripción, sin credenciales.
- `server/captions.js` y `server/minimax.js`: integración local, formato y configuración de MiniMax.
- `vite.config.js`: integración del servidor y bloqueo del directorio privado.
- `tests/model.test.js`: pruebas con el runner nativo de Node.

Tecnologías: JavaScript, Canvas 2D, IndexedDB, Vite y fflate. Servidor local Node.js para MiniMax; sin base de datos remota.
