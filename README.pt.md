<details>
<summary><b>🌐 Idioma: Português</b> — clique para escolher outro idioma</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **[Português](README.pt.md)** · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v2.3.0 (macOS · Windows · Linux · Tauri v2)

> **MDeX** · pronuncia-se "em-dex" (/ˌemˈdɛks/) — a letra M seguida de "dex", duas sílabas.

Um leitor e editor Markdown multilíngue focado em **privacidade e assistência de AI**. Cada arquivo é processado localmente — **sem rede, sem uploads, sem sincronização na nuvem, sem anúncios, sem telemetria por padrão**; as gravações atómicas (à prova de falhas) evitam perda de dados em caso de falha ou corte de energia. A partir da v2.0, o MDeX também oferece edição auxiliada por IA opcional — e pode continuar totalmente offline: um modelo local (ex.: Ollama) não exige internet; apenas um serviço de AI online (OpenAI / DeepSeek / Anthropic / GLM / Gemini / Kimi, etc.) faz um pedido, e somente quando o configura e o aciona.

- Um único frontend HTML autossuficiente (sem Vue / React); o Tauri v2 fornece apenas a casca nativa (janelas, menus, diálogos de arquivo).
- **Zero requisições de rede em tempo de execução**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` e todas as fontes woff2 do KaTeX são embutidas / incorporadas em base64 num único `index.html`.
- Suporta `.md` / `.markdown` / `.html`; pode ser definido como o aplicativo padrão para `.md` — clique duas vezes para abrir.


---

## 🌐 Idiomas

A interface é disponibilizada em **17 idiomas**: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- Troque a qualquer momento pelo menu de idioma na barra de ferramentas; sua escolha é lembrada entre sessões.
- **O árabe é renderizado da direita para a esquerda (RTL)** automaticamente — o corpo do texto, os títulos, os marcadores de lista e toda a barra de ferramentas são espelhados para a direita; blocos de código embutidos, fórmulas matemáticas em LaTeX, termos em inglês e números de versão permanecem da esquerda para a direita, nunca espelhados.
- Este próprio README está traduzido para todos os 17 idiomas — use o seletor no topo desta página.

---

## ✨ Recursos

- **Multi-aba + multi-janela**: abra vários arquivos de uma vez; alterações não salvas são marcadas com um ponto, e você é avisado antes de fechar; clique do botão do meio numa aba fecha-a. Clicar duas vezes num `.md` abre sua própria janela (um arquivo por janela); clicar duas vezes num arquivo já aberto **foca essa janela** em vez de reabri-lo.
- **Pré-visualização dividida ao vivo**: arraste o divisor para redimensionar; o botão na barra de ferramentas alterna entre Dividido / Editor / Pré-visualização.
- **Clique para posicionar**: clique no editor para rolar a pré-visualização; clique na pré-visualização para saltar com o cursor no editor.
- **Buscar e substituir**: localizar, substituir uma ocorrência ou todas, com contagem de correspondências.
- **Matemática**: `$…$` em linha e `$$…$$` em bloco (também `\(...\)`, `\[...\]`), renderizados pelo KaTeX; equações longas quebram nos operadores ou encolhem automaticamente.
- **Realce de código**: linguagem detectada automaticamente; documentos grandes têm realce preguiçoso por viewport para se manter fluído.
- **Diagramas Mermaid**: um bloco ` ```mermaid ` é renderizado como fluxograma / sequência / classe / estado / Gantt / pizza, etc.; clique num diagrama para abrir uma janela de visualização autónoma (zoom / pan / ecrã inteiro) que se atualiza ao vivo enquanto edita.
- **Imagens**: colar / soltar / escolher — guardadas numa pasta `<nomeficheiro>_images/` ao lado do documento com uma referência relativa limpa (sem base64 embutido); os rascunhos usam uma pasta temporária migrada ao guardar; «Guardar como» achata as imagens para o destino; centradas por padrão.
- **Zoom de fonte**: amplie as fontes do editor e da pré-visualização independentemente (controlos −/percentagem/+, ou `⌘/Ctrl + =/−/0`); persiste entre reinícios.
- **Tabelas**: tabelas GFM; tabelas estreitas são centralizadas conforme o conteúdo, as largas rolam horizontalmente sem corte.
- **Citações (BibTeX)**: sintaxe `[@key]` / `\cite{key}`, estilo numérico; uma lista de Referências é gerada ao final, com saltos bidirecionais entre `[n]` no texto e a entrada; suporta um bloco ` ```bibtex ` embutido ou um `.bib` carregado separadamente.
- **Suporte a HTML**: abra arquivos `.html` para renderização; converta entre HTML e Markdown.
- **Tema / idioma**: escuro / claro, **17 idiomas de interface** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — o árabe e o urdu são automaticamente da direita para a esquerda).
- **Rascunho automático**: o conteúdo é salvo periodicamente e restaurado após um fechamento / travamento inesperado.
- **Contagem de palavras**: a barra de status mostra caracteres / linhas / palavras ao vivo, além da linha e coluna atuais.
- **Arrastar e soltar**: solte um arquivo `.md` sobre a janela para abri-lo; solte uma imagem para inseri-la.
- **Exportação**: salvar como Markdown / HTML / PDF (vetorial) / LaTeX.
- **Cor do texto**: a paleta da barra envolve a seleção em `<span style="color:…">`.
- **Edição auxiliada por IA**: selecione um trecho de texto e pressione `⌘/Ctrl + J` (ou o botão na barra de ferramentas) para que a IA refine, expanda ou reajuste o tom; funciona com serviços online (OpenAI / DeepSeek / Anthropic / GLM / Gemini / Kimi, etc.) e com um modelo local como o Ollama para uso totalmente offline; o resultado é pré-visualizado antes de substituir o original, e a chave de API é armazenada apenas localmente.
- **Voltar / Avançar**: histórico unificado de documentos e posições do cursor; botões ◀ ▶, `Alt+←/→`.
- **Seguir links**: clicar num link da pré-visualização abre o destino numa nova aba (http no navegador do sistema); o documento atual não é substituído.

---

## 📦 Instalação

### Prebuilt downloads
Download the installer for your platform from either source:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **Mirror site**: <https://www.spinss.cn/>

Platforms: macOS (`.dmg`, arm64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

---

### macOS

1. Open the `.dmg` file, **drag `MDeX.app` into `/Applications`**.
2. The app is **unsigned** (not notarized). On macOS 12+ - **especially macOS 26 (Tahoe)** - launching it fails with **"MDeX.app is damaged and can't be opened."** This is Gatekeeper, not real damage. Fix (choose one):

   **Option A - Terminal (recommended):**
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` (new in macOS 26) is SIP-protected and can't be permanently removed; re-signing resets the signature so Gatekeeper lets it run.

   **Option B - Finder right-click:**
   In Finder, **right-click** (or Control-click) `MDeX.app` -> **Open** -> confirm "Open" in the dialog. This bypasses the double-click Gatekeeper check.

   **Option C - System Settings:**
   Double-click the app (let it be blocked), then go to **System Settings -> Privacy & Security**, scroll down, click **"Open Anyway"** next to the "MDeX.app was blocked" message.

3. Launch with `open /Applications/MDeX.app` or double-click. The first launch may still prompt once - confirm via **System Settings -> Privacy & Security -> Open Anyway**, or right-click -> **Open**.

> **Note:** Every time you update MDeX (reinstall a new version), repeat step 2. The only permanent fix is Apple Notarization ($99/year Developer certificate).

---

### Windows

1. Download `MDeX_x.x.x_win.exe` and double-click to run.
2. **SmartScreen** may show "Windows protected your PC" (because the app is unsigned). Click **"More info"** -> **"Run anyway"**.
3. Follow the NSIS installer wizard to complete installation.
4. Launch from the Start Menu or desktop shortcut.

> If Windows Defender quarantines the file, restore it: **Windows Security -> Virus & threat protection -> Protection history -> Allow on device**.

---

### Linux

**Debian / Ubuntu (.deb):**
```bash
sudo dpkg -i MDeX_x.x.x_amd64.deb
# If missing dependencies:
sudo apt-get install -f
```
Then launch from the application menu or run `mdex` in terminal.

**Fedora / RHEL (.rpm):**
```bash
sudo rpm -i MDeX_x.x.x_x86_64.rpm
```

**AppImage (all distros):**
```bash
chmod +x MDeX_x.x.x_amd64.AppImage
./MDeX_x.x.x_amd64.AppImage
```
> If AppImage won't launch, install FUSE: `sudo apt install libfuse2` (Debian/Ubuntu) or `sudo dnf install fuse` (Fedora).

---

## ⌨️ Atalhos

Use `⌘` no macOS, `Ctrl` no Windows / Linux.

| Atalho | Ação |
| --- | --- |
| `⌘/Ctrl + N` | Novo |
| `⌘/Ctrl + O` | Abrir arquivo |
| `⌘/Ctrl + S` | Salvar |
| `⌘/Ctrl + Shift + S` | Salvar como |
| `⌘/Ctrl + W` | Fechar aba |
| `⌘/Ctrl + Shift + W` | Fechar janela |
| `⌘/Ctrl + F` | Localizar |
| `⌘/Ctrl + H` | Substituir |
| `⌘/Ctrl + B` / `I` / `R` | Negrito / Itálico / Código em linha |
| `⌘/Ctrl + K` | Inserir link |
| `Tab` | Recuar 2 espaços |
| `Alt/Option + arrastar` | Seleção retangular (coluna) |
| `Alt/Option + Shift + ←↑↓→` | Estender seleção em coluna |
| `Esc` | Cancelar seleção em coluna |
| `⌘/Ctrl + =/−/0` | Zoom no último painel clicado (editor ou pré-visualização): aumentar / diminuir / redefinir |
| `⌘/Ctrl + J` | Edição auxiliada por IA |

> Com várias janelas abertas, os atalhos afetam apenas a janela em foco. Quando a janela do visualizador de imagens está aberta, `⌘/Ctrl + =/−/0` amplia a imagem em vez disso.

---

## 📝 Guia rápido

**Markdown**: títulos `# / ## / ###`, negrito `**texto**`, itálico `*texto*`, tachado `~~texto~~`, código em linha `` `código` ``, blocos de código (três crases, com linguagem opcional), citação `> texto`, listas `- / 1.`, lista de tarefas `- [ ] / - [x]`, link `[texto](url)`, imagem `![alt](url)`, divisor `---`, tabelas `| A | B |`.

**Matemática**: em linha `$E = mc^2$`; em bloco `$$\int_0^1 x\,dx$$` (pode ocupar várias linhas). Usa sintaxe LaTeX, renderizada pelo KaTeX; o `$` dentro de blocos de código não é tratado como delimitador matemático. Suporta `align` / `aligned`, matrizes, `cases` e outros ambientes comuns.

**Citações**: escreva `[@key]` ou `[@a; @b]` no texto (compatível com LaTeX via `\cite{key}`), embuta a biblioteca por meio de um bloco ` ```bibtex ` ou carregue um `.bib` com o botão "Refs". Uma lista de Referências é gerada ao final; `[n]` no texto é clicável.

---

## 📤 Exportação (Salvar como)

Clique em "Salvar como" e escolha um formato:

- **Markdown (.md)**: salva a fonte e atualiza o nome / caminho da aba atual.
- **HTML (.html)**: HTML autossuficiente com CSS embutido + realce de código; a matemática é mantida como literal `$…$`, renderizada automaticamente pelo KaTeX embutido.
- **PDF vetorial**: diálogo de impressão do sistema, saída vetorial, nítida em qualquer zoom. Escolha "Salvar como PDF".
- **LaTeX (.tex)**: convertido para um fonte `.tex` compilável (com documentclass e pacotes; a matemática é mantida como está). Exporta uma cópia.

---

## 🔒 Offline e segurança

- **Zero requisições de rede em tempo de execução.** A saída de build `dist/index.html` é autoverificada: sem links externos `src=` / `href=` / `url()` / `@import`.
- CSP estrito (apenas IPC local, sem WAN); todos os arquivos são lidos / gravados localmente, nada é enviado.
- Verifique: desligue o Wi-Fi / desconecte o cabo e inicie — matemática, imagens, realce de código e Mermaid seguem funcionando.
- O `dist/index.html` ainda mostra cerca de uma dúzia de strings `https://github.com/…`; todas elas residem dentro de **comentários de licença / fonte** de `marked` / `highlight.js` etc. — texto puro que **nunca dispara uma requisição`; mantidos intactos para respeitar as licenças open-source.

---

## 🛠️ Compilar a partir do código-fonte

Código-fonte: <https://github.com/fwzheng/mdex>. Siga as instruções de build no repositório (setup, dependências e comandos estão documentados lá).

---

## 📁 Estrutura do projeto

```
markdown/
├── app-shell.html          # shell do frontend (HTML+CSS); a lógica do app está em src/app.js
├── src/
│   ├── app.js              # lógica da aplicação (// @ts-check; embutida em dist pelo build-html.mjs)
│   ├── i18n.js            # 17-language UI strings (pure data; window.I18N, split from app.js)
│   ├── help.js            # help-document data (HELP_STRINGS + SK/sc/CITE_HELP_*, window.HELP_DATA)
│   └── globals.d.ts        # declarações de tipos vendor / Window para verificação de tipos
├── tsconfig.json           # config de verificação de tipos (tsc --noEmit; sem bundler)
├── tools/
│   ├── fetch-vendor.mjs    # uma vez: baixa deps para vendor/ + bloqueio de integridade (online apenas aqui)
│   ├── build-html.mjs      # embute vendor + src/app.js + i18n.js + help.js em dist/index.html (fontes KaTeX → base64)
│   └── test-pure.mjs       # testes de funções puras do frontend (npm test)
├── dist/index.html         # saída do build: arquivo único autossuficiente (Tauri frontendDist)
├── vendor/                 # cache de downloads + integrity.json (.gitignore)
├── package.json            # @tauri-apps/cli + typescript(dev) + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + dialog / single-instance + encoding_rs
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # janela 1200×750, CSP estrito, ícones, associação .md, hooks de menu
    ├── capabilities/default.json
    ├── icons/              # conjunto completo de ícones de `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menus + IO de arquivo + roteamento multi-janela + escrita atômica / propriedade de arquivos
```

---

## 🎨 Personalização

| Para alterar | Onde |
| --- | --- |
| Nome do app / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| Tamanho da janela | `tauri.conf.json` → `app.windows[0]` (padrão 1200×750) |
| Ícones | troque a imagem de origem, depois `npm run icon` |
| Cores / fontes do tema | variáveis CSS `:root` no topo de `app-shell.html` |
| Itens de menu | `build_menu()` em `src-tauri/src/lib.rs` |
| Textos da UI / documento de ajuda | `I18N` / `HELP_STRINGS` em `src/app.js` |
| Versões de dependências | `VERSIONS` no topo de `tools/fetch-vendor.mjs` (depois `npm run fetch -- --force`) |

---

## 📄 Licença

O código próprio deste projeto é de código aberto sob a **Apache License 2.0**.

Componentes de terceiros: o projeto utiliza alguns componentes de terceiros (incluindo, mas não se limitando a marked, KaTeX, highlight.js, DOMPurify, jsPDF, html2canvas-pro, turndown, mermaid, @retorquere/bibtex-parser e Tauri, etc.); seus avisos de direitos autorais e licença estão detalhados nos respectivos arquivos-fonte. Esses componentes são distribuídos sob as licenças MIT, BSD-3-Clause, Apache-2.0, MPL-2.0 e outras de código aberto.

Requisitos de distribuição: segundo a licença Apache-2.0, redistribuir este projeto exige manter os arquivos LICENSE e NOTICE; se você modificar algum arquivo-fonte, deve indicar claramente as alterações no arquivo correspondente.

---

## 📬 Contato

Para problemas ou sugestões: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
