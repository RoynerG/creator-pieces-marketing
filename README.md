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

## Publicaciones por código y carpeta de fotos

La pantalla inicial muestra **Mis publicaciones** y **Tu carpeta de fotos**. Cada código reúne sus datos, fotografías, logo, ficha y descripción. Puedes buscar por código o ubicación.

- **Nueva publicación** pide el código (por ejemplo, `12238`). Si ya existe, abre esa publicación sin vaciarla. Las publicaciones nuevas conservan la marca y el contacto, y empiezan con fotos, ficha y datos del inmueble vacíos.
- **Publicaciones** guarda el trabajo antes de volver al listado. El código identifica la publicación y no se cambia desde el editor.
- La carpeta predeterminada es `OneDrive\Personales\Freelancer\Go\Fotos` dentro de la carpeta del usuario de Windows. Puedes indicar otra ruta absoluta en **Cambiar carpeta de origen → Conectar carpeta**. Esta ruta se guarda solo en `.local/photo-library.json`, fuera de Git.
- Cada subcarpeta tiene el código del inmueble: `Fotos\12238\1.jpeg`, `Fotos\12238\2.jpeg`, etc. Pulsa el código para crear/abrir su publicación y seleccionar las fotos. Desde una publicación, usa **Fotografías → Elegir desde la carpeta del inmueble**.
- Puedes seleccionar hasta completar 10 imágenes. Se añaden en el orden en que las seleccionas y puedes reordenarlas en el editor. Los originales no se modifican. Si un archivo de OneDrive está solo en la nube, debe estar disponible para descargar en ese equipo.
- El acceso a las imágenes es local y está limitado a la carpeta configurada. Se admiten JPG, PNG y WebP, hasta 25 MB por archivo. Las fotos importadas quedan incorporadas al proyecto; mover el original no elimina la copia guardada.

## Crear las piezas

1. Crea o abre una publicación por código. Completa negocio (venta/arriendo), tipo de inmueble, ubicación, habitaciones, baños y área. Deja un dato numérico vacío para ocultarlo en la portada.
2. En **Fotografías**, carga hasta 10 archivos JPG, PNG o WebP (25 MB por archivo). La primera foto es la portada. Para obtener diez piezas, carga diez fotos.
3. Usa las flechas para ordenar y las miniaturas para revisar. Todas las fotos se muestran completas, sin zoom ni recortes, conservando su proporción. Si sobra espacio, se rellena con el color principal de la marca.
4. En **Tu marca**, carga el logo y ajusta colores, tamaño y posición. En la portada el logo se mantiene en la franja derecha, con un tamaño máximo de 170 px; en las fotos puede ir a izquierda o derecha.
5. Pulsa **Descargar 10 piezas**. Obtendrás un ZIP llamado solo con el código, por ejemplo **`12238.zip`**, con `01-portada.png` y `02-foto.png` a `10-foto.png`. También puedes descargar una pieza individual. Con menos fotos se exportan solo las piezas completas, sin duplicar ni inventar fotografías.

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
3. Dentro de la publicación, pega la ficha completa: descripción, especificaciones y características. Revisa ciudad, teléfono y marca. El negocio se toma de los datos del inmueble. **Usar datos de las piezas** inicia una ficha cuando el campo está vacío.
4. Pulsa **Generar descripción**. La tarjeta presenta título, párrafo, características con emojis, amenidades, código, teléfono y hashtags, **sin enlaces web**. Si el código de la ficha no coincide con el de la publicación, la app pide corregirlo antes de enviar la solicitud. Los enlaces de descripciones antiguas también se retiran al abrirlas.
5. Puedes **copiar**, **ampliar** o **editar** el texto. Los dos botones inferiores solicitan un llamado a la acción más directo o una versión más breve. **Volver al texto anterior** permite comparar la última modificación. Copiar elimina las marcas `**` de Markdown y conserva emojis y saltos de línea.

Solo se envía texto a MiniMax al generar o ajustar. Las fotografías no se envían. Cada solicitud consume la cuota del plan; los errores de autenticación, cuota o conexión se muestran sin reemplazar la versión anterior. Puedes cancelar una solicitud en curso. Revisa siempre la exactitud del texto antes de publicarlo.

La integración utiliza el [endpoint oficial compatible con OpenAI de MiniMax](https://platform.minimax.io/docs/api-reference/text-openai-api) desde el servidor local. No acepta claves de pago por uso ni cambia automáticamente de modalidad. El generador requiere `npm run dev` o `npm run preview` en este repositorio; un alojamiento de archivos estáticos por sí solo no ejecuta la integración.

## Guardar y retomar

- Cada publicación (fotos, logo, datos, ficha y descripción redactada) se guarda automáticamente por código en **IndexedDB del navegador**. El navegador puede borrar sus datos; no es una copia de seguridad. Si otra pestaña modifica el mismo código, se bloquea la escritura obsoleta para evitar sobrescribirla: guarda una copia `.piezas` y recarga.
- **Guardar proyecto** descarga un archivo `.piezas` con todo el proyecto. **Abrir proyecto guardado** permite retomarlo en otro navegador/equipo. Tamaño máximo de importación: 150 MB.
- El borrador anterior se migra a una publicación si ya tiene un código válido. Si no, se conserva una copia recuperable mediante **Guardar borrador anterior por código**. Los archivos `.piezas` anteriores siguen siendo compatibles; necesitan un código válido al importarlos. Importar un código existente pide confirmar su reemplazo.
- Para usarlo en otra PC, copia/clona el repositorio, configura allí la carpeta de fotos y abre cada archivo `.piezas` que quieras trasladar. Ni los proyectos guardados en el navegador ni las fotos originales se suben a GitHub.
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
- `src/publications.js`, `src/publications.css` y `src/publications-store.js`: listado, biblioteca de fotos y guardado por código.
- `server/library.js`: lectura de la carpeta local y configuración de su ruta.
- `server/captions.js` y `server/minimax.js`: integración local, formato y configuración de MiniMax.
- `vite.config.js`: integración del servidor y bloqueo del directorio privado.
- `tests/model.test.js`: pruebas con el runner nativo de Node.

Tecnologías: JavaScript, Canvas 2D, IndexedDB, Vite y fflate. Servidor local Node.js para MiniMax; sin base de datos remota.
