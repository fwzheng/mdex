<details>
<summary><b>🌐 Idioma: Español</b> — haz clic para elegir otro idioma</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **[Español](README.es.md)** · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v1.3.0 (macOS · Windows · Linux · Totalmente Offline · Tauri v2)

> **MDeX** · se pronuncia "em-dex" (/ˌemˈdɛks/) — la letra M seguida de "dex", dos sílabas.

Un lector y editor de Markdown offline-first para uso en **entornos aislados / intranet / sin conexión**. Cada archivo se procesa localmente — **sin red, sin subidas, sin sincronización en la nube**.

- Un único frontend HTML autónomo (sin Vue / React); Tauri v2 proporciona únicamente el shell nativo (ventanas, menús, diálogos de archivos).
- **Cero peticiones de red en tiempo de ejecución**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` y todas las fuentes woff2 de KaTeX están incrustadas / embebidas en base64 dentro de un único `index.html`.
- Admite `.md` / `.markdown` / `.html`; puede configurarse como el manejador predeterminado de `.md` — doble clic para abrir.

> Adecuado para escenarios de **investigación / intranets / protección de privacidad**. Sin anuncios, sin telemetría, sin subida de datos.

---

## 🌐 Idiomas

La interfaz está disponible en **17 idiomas**: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- Cambia en cualquier momento desde el menú de idioma de la barra de herramientas; tu elección se recuerda entre sesiones.
- **El árabe se renderiza de derecha a izquierda (RTL)** automáticamente — el texto del cuerpo, los encabezados, los marcadores de lista y toda la barra de herramientas se reflejan hacia la derecha; los bloques de código incrustados, las fórmulas matemáticas en LaTeX, los términos en inglés y los números de versión permanecen de izquierda a derecha, sin reflejarse nunca.
- Este README está traducido a los 17 idiomas — usa el selector en la parte superior de esta página.

---

## ✨ Características

- **Multi-pestaña + multi-ventana**: abre varios archivos a la vez; los cambios sin guardar se marcan con un punto, y se te pregunta antes de cerrar; clic central en una pestaña para cerrarla. Un doble clic en un `.md` abre su propia ventana (un archivo por ventana); un doble clic en un archivo ya abierto **enfoca esa ventana** en lugar de volver a abrirla.
- **Vista previa dividida en vivo**: arrastra el divisor para cambiar el tamaño; el botón de la barra de herramientas alterna entre Dividido / Editor / Vista previa.
- **Clic para posicionar**: haz clic en el editor para desplazar la vista previa; haz clic en la vista previa para saltar con el cursor en el editor.
- **Buscar y reemplazar**: encontrar, reemplazar uno o todos, con conteo de coincidencias.
- **Matemáticas**: en línea `$…$` y en bloque `$$…$$` (también `\(...\)`, `\[...\]`), renderizadas por KaTeX; las ecuaciones largas se ajustan en los operadores o se reducen automáticamente.
- **Resaltado de código**: el lenguaje se autodetecta; los documentos grandes se resaltan de forma perezosa según el viewport para mantener la fluidez.
- **Diagramas Mermaid**: un bloque ` ```mermaid ` se renderiza como diagrama de flujo / secuencia / clases / estados / Gantt / circular, etc.; haz clic en un diagrama para abrir una ventana de visualización independiente (zoom / pan / pantalla completa) que se actualiza en vivo mientras editas.
- **Imágenes**: pegar / soltar / elegir — guardadas en una carpeta `<nombrearchivo>_images/` junto al documento con una referencia relativa limpia (sin base64 en línea); los borradores usan una carpeta temporal migrada al guardar; «Guardar como» aplana las imágenes hacia el destino; centradas por defecto.
- **Zoom de fuente**: amplía las fuentes del editor y la vista previa de forma independiente (controles −/porcentaje/+, o `⌘/Ctrl + =/−/0`); persiste entre reinicios.
- **Tablas**: tablas GFM; las tablas estrechas se centran al contenido, las anchas se desplazan horizontalmente sin recortes.
- **Citas (BibTeX)**: sintaxis `[@key]` / `\cite{key}`, estilo numérico; se genera una lista de Referencias al final, con saltos bidireccionales entre la `[n]` en el texto y la entrada; admite un bloque ` ```bibtex ` incrustado o un `.bib` cargado por separado.
- **Soporte HTML**: abre archivos `.html` para renderizarlos; convierte entre HTML y Markdown.
- **Tema / idioma**: oscuro / claro, **17 idiomas de interfaz** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — el árabe y el urdu se autoajustan de derecha a izquierda).
- **Borrador automático**: el contenido se guarda periódicamente y se restaura tras un cierre / fallo inesperado.
- **Conteo de palabras**: la barra de estado muestra caracteres / líneas / palabras en vivo, más la fila y columna actuales.
- **Arrastrar y soltar**: suelta un archivo `.md` sobre la ventana para abrirlo; suelta una imagen para insertarla.
- **Exportación**: guardar como Markdown / HTML / PDF (vectorial + ráster) / LaTeX.
- **Color del texto**: la paleta de la barra envuelve la selección en `<span style="color:…">`.
- **Atrás / Adelante**: historial unificado de documentos y posiciones del cursor; botones ◀ ▶, `Alt+←/→`.
- **Seguir enlaces**: un clic en un enlace de la vista previa abre el destino en una nueva pestaña (http en el navegador del sistema); el documento actual no se reemplaza.

---

## ⌨️ Atajos

Usa `⌘` en macOS, `Ctrl` en Windows / Linux.

| Atajo | Acción |
| --- | --- |
| `⌘/Ctrl + N` | Nuevo |
| `⌘/Ctrl + O` | Abrir archivo |
| `⌘/Ctrl + S` | Guardar |
| `⌘/Ctrl + Shift + S` | Guardar como |
| `⌘/Ctrl + W` | Cerrar pestaña |
| `⌘/Ctrl + Shift + W` | Cerrar ventana |
| `⌘/Ctrl + F` | Buscar |
| `⌘/Ctrl + H` | Reemplazar |
| `⌘/Ctrl + B` / `I` / `P` | Negrita / Cursiva / Código en línea |
| `⌘/Ctrl + K` | Insertar enlace |
| `Tab` | Sangría de 2 espacios |
| `Alt/Option + arrastrar` | Selección rectangular (columna) |
| `Alt/Option + Shift + ←↑↓→` | Extender selección de columna |
| `Esc` | Cancelar selección de columna |
| `⌘/Ctrl + =/−/0` | Zoom del último panel clicado (editor o vista previa): acercar / alejar / restablecer |

> Con varias ventanas abiertas, los atajos solo afectan a la ventana enfocada. Cuando la ventana del visor de imágenes está abierta, `⌘/Ctrl + =/−/0` amplía la imagen en su lugar.

---

## 📝 Hoja de referencia rápida

**Markdown**: encabezados `# / ## / ###`, negrita `**texto**`, cursiva `*texto*`, tachado `~~texto~~`, código en línea `` `código` ``, bloques de código (triple comilla invertida, con lenguaje opcional), cita `> texto`, listas `- / 1.`, lista de tareas `- [ ] / - [x]`, enlace `[texto](url)`, imagen `![alt](url)`, divisor `---`, tablas `| A | B |`.

**Matemáticas**: en línea `$E = mc^2$`; en bloque `$$\int_0^1 x\,dx$$` (puede ocupar varias líneas). Usa sintaxis LaTeX, renderizada por KaTeX; el `$` dentro de bloques de código no se trata como delimitador matemático. Admite `align` / `aligned`, matrices, `cases` y otros entornos comunes.

**Citas**: escribe `[@key]` o `[@a; @b]` en el texto (compatible con LaTeX `\cite{key}`), incrusta la biblioteca mediante un bloque ` ```bibtex ` o carga un `.bib` con el botón "Refs". Se genera una lista de Referencias al final; la `[n]` en el texto es clicable.

---

## 📤 Exportación (Guardar como)

Haz clic en "Guardar como" y elige un formato:

- **Markdown (.md)**: guarda el código fuente y actualiza el nombre / ruta de la pestaña actual.
- **HTML (.html)**: HTML autónomo con CSS incrustado + resaltado de código; las fórmulas se mantienen como literales `$…$`, auto-renderizadas por KaTeX incrustado.
- **PDF vectorial**: diálogo de impresión del sistema, salida vectorial, nítido en cualquier nivel de zoom. Elige "Guardar como PDF".
- **PDF ráster**: genera un archivo PDF directamente (sin diálogo), con resolución baja / media / alta; paginado en los límites de bloque (sin ecuaciones / encabezados / código partidos).
- **LaTeX (.tex)**: convertido a un código fuente `.tex` compilable (con documentclass y paquetes; las fórmulas se mantienen tal cual). Exporta una copia.

---

## 🔒 Offline y seguridad

- **Cero peticiones de red en tiempo de ejecución.** La salida de compilación `dist/index.html` se auto-verifica: sin enlaces externos `src=` / `href=` / `url()` / `@import`.
- CSP estricta (solo IPC local, sin WAN); todos los archivos se leen / escriben localmente, nada se sube.
- Verificación: apaga el Wi-Fi / desconecta el cable y ejecuta la app — las matemáticas, imágenes, resaltado de código y Mermaid siguen funcionando.
- `dist/index.html` todavía muestra algo menos de una docena de cadenas `https://github.com/…`; todas viven dentro de **comentarios de licencia / código fuente** de `marked` / `highlight.js` etc. — texto plano que **nunca dispara una petición**; se dejan intactas para respetar las licencias de código abierto.

---

## 📦 Instalación

### Descargas precompiladas
Descarga el instalador para tu plataforma desde cualquiera de las dos fuentes:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **Sitio espejo**: <https://www.spinss.cn/>

macOS (`.dmg`, universal arm64 + x86_64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

### Abrir la app sin firmar en macOS (omitir Gatekeeper)

Esta app **no** está firmada por el desarrollador ni notarizada (los escenarios offline normalmente no pueden notalizar en línea). En macOS 12+, **especialmente macOS 26 (Tahoe)**, iniciarla directamente desde el `.dmg` — o desde una compilación recién copiada — falla con **"MDeX.app is damaged and can't be opened."** Eso es Gatekeeper, no un daño real. Arréglalo en Terminal:

1. **Primero arrastra `MDeX.app` del `.dmg` a `/Applications`** — nunca la ejecutes directamente desde el dmg (eso activa App Translocation y el atributo `com.apple.provenance`, la verdadera causa de "dañada" en macOS 26).
2. Borra los atributos y vuelve a firmar:
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` está protegido por SIP y **no puede** eliminarse ni con `sudo`; volver a firmar reinicia la firma para que Gatekeeper permita ejecutarla. `spctl` sigue mostrando `rejected` para el firmado ad hoc — es esperado, y **no** bloquea `open`.
3. Inicia con `open /Applications/MDeX.app` (o doble clic). El primer inicio puede seguir mostrando un aviso — confirma en **Configuración del Sistema → Privacidad y Seguridad → Abrir de todos modos**, o clic derecho sobre la app → **Abrir**.

---

## 🛠️ Compilar desde el código fuente

Código fuente: <https://github.com/fwzheng/mdex>. Sigue las instrucciones de compilación del repositorio (configuración, dependencias y comandos documentados allí).

---

## 📁 Estructura del proyecto

```
markdown/
├── app-shell.html          # código fuente del frontend (HTML+CSS+JS, toda la lógica de la app)
├── tools/
│   ├── fetch-vendor.mjs    # una vez: descarga dependencias en vendor/ (solo aquí en línea)
│   └── build-html.mjs      # incrusta vendor en dist/index.html (fuentes KaTeX → base64)
├── dist/index.html         # salida de compilación: archivo único totalmente offline (Tauri frontendDist)
├── vendor/                 # caché de descargas (.gitignore)
├── package.json            # @tauri-apps/cli + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + tauri-plugin-dialog / single-instance
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # ventana 1200×750, CSP estricta, iconos, asociación .md, hooks de menú
    ├── capabilities/default.json
    ├── icons/              # conjunto completo de iconos desde `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menús + E/S de archivos + enrutamiento multi-ventana
```

---

## 🎨 Personalización

| Para cambiar | Dónde |
| --- | --- |
| Nombre de la app / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| Tamaño de la ventana | `tauri.conf.json` → `app.windows[0]` (predeterminado 1200×750) |
| Iconos | sustituye la imagen fuente, luego `npm run icon` |
| Colores del tema / fuentes | variables CSS en `:root` al inicio de `app-shell.html` |
| Elementos del menú | `build_menu()` en `src-tauri/src/lib.rs` |
| Cadenas de UI / doc de ayuda | `I18N` / `HELP_STRINGS` en `app-shell.html` |
| Versiones de dependencias | `VERSIONS` al inicio de `tools/fetch-vendor.mjs` (luego `npm run fetch -- --force`) |

---

## 📄 Licencia

El código propio de este proyecto es de código abierto bajo **Apache License 2.0**.

Componentes de terceros: el proyecto utiliza algunos componentes de terceros (incluidos, entre otros, marked, KaTeX, highlight.js, DOMPurify, jsPDF, html2canvas-pro, turndown, mermaid, @retorquere/bibtex-parser y Tauri, etc.); sus avisos de copyright y licencia se detallan en los archivos fuente respectivos. Dichos componentes se distribuyen bajo las licencias MIT, BSD-3-Clause, Apache-2.0, MPL-2.0 y otras de código abierto.

Requisitos de distribución: según la licencia Apache-2.0, redistribuir este proyecto exige conservar los archivos LICENSE y NOTICE; si modifica algún archivo fuente, debe indicar claramente los cambios en el archivo correspondiente.

---

## 📬 Contacto

Para problemas o sugerencias: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
