<details>
<summary><b>🌐 Idioma: Português</b> — clique para escolher outro idioma</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · **[Português](README.pt.md)** · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v1.3.3 (macOS · Windows · Linux · Totalmente Offline · Tauri v2)

> **MDeX** · pronuncia-se "em-dex" (/ˌemˈdɛks/) — a letra M seguida de "dex", duas sílabas.

Um leitor e editor Markdown offline-first para uso em **ambientes isolados / intranet / desconectados**. Cada arquivo é processado localmente — **sem rede, sem uploads, sem sincronização na nuvem, sem anúncios, sem telemetria, sem upload de dados**.

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
- **Voltar / Avançar**: histórico unificado de documentos e posições do cursor; botões ◀ ▶, `Alt+←/→`.
- **Seguir links**: clicar num link da pré-visualização abre o destino numa nova aba (http no navegador do sistema); o documento atual não é substituído.

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

## 📦 Instalação

### Downloads pré-compilados
Baixe o instalador para sua plataforma de qualquer uma das fontes:

- **GitHub Releases**: <https://github.com/fwzheng/mdex/releases>
- **Site espelho**: <https://www.spinss.cn/>

macOS (`.dmg`, universal arm64 + x86_64), Windows (`.exe`, NSIS installer), Linux (`.deb` / `.rpm` / `.AppImage`).

### Abrindo o aplicativo não assinado no macOS (contornar o Gatekeeper)

Este aplicativo **não** é assinado pelo desenvolvedor / não tem notarização (cenários offline normalmente não conseguem notarizar online). No macOS 12+, **especialmente macOS 26 (Tahoe)**, iniciá-lo direto do `.dmg` — ou de um build recém-copiado — falha com **"MDeX.app is damaged and can't be opened."** Isso é o Gatekeeper, não dano real. Corrija no Terminal:

1. **Primeiro arraste `MDeX.app` do `.dmg` para `/Applications`** — nunca o execute direto do dmg (isso aciona App Translocation e o atributo `com.apple.provenance`, a verdadeira causa de "danificado" no macOS 26).
2. Limpe os atributos e assine novamente:
   ```bash
   xattr -cr /Applications/MDeX.app
   codesign --force --deep --sign - /Applications/MDeX.app
   ```
   > `com.apple.provenance` é protegido pelo SIP e **não pode** ser removido nem com `sudo`; reassinar reinicia a assinatura para que o Gatekeeper permita a execução. `spctl` ainda reporta `rejected` para assinatura ad hoc — esperado, e isso **não** bloqueia `open`.
3. Inicie com `open /Applications/MDeX.app` (ou duplo clique). O primeiro início ainda pode pedir confirmação uma vez — confirme em **Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim**, ou clique com o botão direito no app → **Abrir**.

---

## 🛠️ Compilar a partir do código-fonte

Código-fonte: <https://github.com/fwzheng/mdex>. Siga as instruções de build no repositório (setup, dependências e comandos estão documentados lá).

---

## 📁 Estrutura do projeto

```
markdown/
├── app-shell.html          # fonte do frontend (HTML+CSS+JS, toda a lógica do app)
├── tools/
│   ├── fetch-vendor.mjs    # uma vez: baixa deps para vendor/ (online apenas aqui)
│   └── build-html.mjs      # embute vendor em dist/index.html (fontes KaTeX → base64)
├── dist/index.html         # saída do build: arquivo único totalmente offline (Tauri frontendDist)
├── vendor/                 # cache de downloads (.gitignore)
├── package.json            # @tauri-apps/cli + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + tauri-plugin-dialog / single-instance
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # janela 1200×750, CSP estrito, ícones, associação .md, hooks de menu
    ├── capabilities/default.json
    ├── icons/              # conjunto completo de ícones de `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menus + IO de arquivo + roteamento multi-janela
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
| Textos da UI / documento de ajuda | `I18N` / `HELP_STRINGS` em `app-shell.html` |
| Versões de dependências | `VERSIONS` no topo de `tools/fetch-vendor.mjs` (depois `npm run fetch -- --force`) |

---

## 📄 Licença

O código próprio deste projeto é de código aberto sob a **Apache License 2.0**.

Componentes de terceiros: o projeto utiliza alguns componentes de terceiros (incluindo, mas não se limitando a marked, KaTeX, highlight.js, DOMPurify, jsPDF, html2canvas-pro, turndown, mermaid, @retorquere/bibtex-parser e Tauri, etc.); seus avisos de direitos autorais e licença estão detalhados nos respectivos arquivos-fonte. Esses componentes são distribuídos sob as licenças MIT, BSD-3-Clause, Apache-2.0, MPL-2.0 e outras de código aberto.

Requisitos de distribuição: segundo a licença Apache-2.0, redistribuir este projeto exige manter os arquivos LICENSE e NOTICE; se você modificar algum arquivo-fonte, deve indicar claramente as alterações no arquivo correspondente.

---

## 📬 Contato

Para problemas ou sugestões: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
