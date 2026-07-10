<details>
<summary><b>🌐 언어: 한국어</b> — 다른 언어를 선택하려면 클릭하세요</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · **[한국어](README.ko.md)** · [العربية](README.ar.md)

</details>


# MDeX (macOS · Windows · Linux · 완전 오프라인 · Tauri v2)

> **MDeX** · "em-dex"(/ˌemˈdɛks/)로 발음 — 글자 M 뒤에 "dex"가 오는 2음절 단어입니다.

**폐쇄망 / 인트라넷 / 연결 끊김** 환경을 위한 오프라인 우선 Markdown 리더 및 에디터입니다. 모든 파일은 로컬에서 처리됩니다 — **네트워크 없음, 업로드 없음, 클라우드 동기화 없음**.

- 단일 자체 포함형 HTML 프론트엔드(Vue / React 없음); Tauri v2는 네이티브 셸(창, 메뉴, 파일 대화상자)만 제공합니다.
- **런타임 네트워크 요청 제로**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` 와 모든 KaTeX woff2 폰트가 단일 `index.html` 에 인라인 / base64 임베드됩니다.
- `.md` / `.markdown` / `.html` 지원; 기본 `.md` 처리기로 설정 가능 — 더블클릭으로 엽니다.

> 적합한 사용 사례: **연구 / 인트라넷 / 개인정보 보호** 시나리오. 광고 없음, 원격 측정 없음, 데이터 업로드 없음.

---

## 🌐 언어

인터페이스는 **11개 언어**로 제공됩니다: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية.

- 툴바의 언어 메뉴에서 언제든 전환할 수 있으며, 선택한 언어는 세션 간 유지됩니다.
- **아랍어는 자동으로 오른쪽에서 왼쪽(RTL)으로 렌더링**됩니다 — 본문 텍스트, 제목, 목록 마커와 툴바 전체가 오른쪽으로 미러링됩니다; 임베드된 코드 블록, LaTeX 수식, 영어 용어와 버전 번호는 좌에서 우로 유지되며 미러링되지 않습니다.
- 이 README 자체도 11개 언어 모두로 번역되어 있습니다 — 이 페이지 맨 위의 선택기를 사용하세요.

---

## ✨ 기능

- **멀티탭 + 멀티윈도우**: 여러 파일을 동시에 열 수 있습니다; 저장하지 않은 변경 사항은 점으로 표시되며, 닫기 전에 확인합니다; 탭을 가운데 클릭하면 닫힙니다. `.md` 파일을 더블클릭하면 전용 창이 열립니다(파일당 창 하나); 이미 열려 있는 파일을 더블클릭하면 다시 열지 않고 **해당 창에 포커스**를 맞춥니다.
- **실시간 분할 미리보기**: 구분선을 드래그해 크기를 조정; 툴바 버튼으로 분할 / 에디터 / 미리보기를 순환합니다.
- **클릭 위치 이동**: 에디터를 클릭하면 미리보기가 스크롤되고, 미리보기를 클릭하면 에디터의 커서가 이동합니다.
- **검색 및 바꾸기**: 찾기, 하나 또는 모두 바꾸기, 일치 수 표시.
- **수식**: 인라인 `$…$` 와 블록 `$$…$$`(`\(...\)`, `\[...\]` 도 지원), KaTeX로 렌더링; 긴 수식은 연산자에서 줄바꿈되거나 자동 축소됩니다.
- **코드 하이라이트**: 언어 자동 감지; 대용량 문서는 뷰포트 기반 지연 하이라이트로 부드럽게 유지됩니다.
- **Mermaid 다이어그램**: ` ```mermaid ` 블록이 순서도 / 시퀀스 / 클래스 / 상태 / 간트 / 파이 등으로 렌더링됩니다.
- **이미지**: 붙여넣기 / 드롭 / 선택 — base64로 자동 임베드; 상대 로컬 경로도 작동; 이미지는 기본적으로 가운데 정렬됩니다.
- **표**: GFM 표; 좁은 표는 내용에 맞게 가운데 정렬, 넓은 표는 잘림 없이 가로 스크롤됩니다.
- **인용(BibTeX)**: `[@key]` / `\cite{key}` 구문, 숫자 스타일; 끝에 참고문헌 목록이 생성되며, 본문 `[n]` 과 항목 간 양방향 이동; 임베드된 ` ```bibtex ` 블록 또는 별도로 로드한 `.bib` 지원.
- **HTML 지원**: `.html` 파일을 열어 렌더링; HTML과 Markdown 간 변환.
- **테마 / 언어**: 다크 / 라이트, **11개 UI 언어**(中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية — 아랍어는 자동으로 우에서 좌로).
- **자동 임시저장**: 콘텐츠가 주기적으로 저장되어 예기치 않은 종료 / 충돌 후 복원됩니다.
- **단어 수**: 상태 표시줄에 문자 / 줄 / 단어가 실시간으로 표시되며, 현재 행과 열도 표시됩니다.
- **드래그 앤 드롭**: `.md` 파일을 창에 드롭하면 열리고, 이미지를 드롭하면 삽입됩니다.
- **내보내기**: Markdown / HTML / PDF(벡터 + 래스터) / LaTeX로 저장.

---

## ⌨️ 단축키

macOS에서는 `⌘`, Windows / Linux에서는 `Ctrl` 를 사용하세요.

| 단축키 | 동작 |
| --- | --- |
| `⌘/Ctrl + N` | 새 파일 |
| `⌘/Ctrl + O` | 파일 열기 |
| `⌘/Ctrl + S` | 저장 |
| `⌘/Ctrl + Shift + S` | 다른 이름으로 저장 |
| `⌘/Ctrl + W` | 탭 닫기 |
| `⌘/Ctrl + Shift + W` | 창 닫기 |
| `⌘/Ctrl + F` | 찾기 |
| `⌘/Ctrl + H` | 바꾸기 |
| `⌘/Ctrl + B` / `I` / `E` | 굵게 / 기울임 / 인라인 코드 |
| `⌘/Ctrl + K` | 링크 삽입 |
| `Tab` | 2칸 들여쓰기 |
| `Alt/Option + 드래그` | 사각형(열) 선택 |
| `Alt/Option + Shift + ←↑↓→` | 열 선택 확장 |
| `Esc` | 열 선택 취소 |

> 여러 창이 열려 있을 때, 단축키는 포커스된 창에만 적용됩니다.

---

## 📝 치트 시트

**Markdown**: 제목 `# / ## / ###`, 굵게 `**text**`, 기울임 `*text*`, 취소선 `~~text~~`, 인라인 코드 `` `code` ``, 코드 블록(삼중 백틱, 언어 지정 가능), 인용 `> text`, 목록 `- / 1.`, 작업 목록 `- [ ] / - [x]`, 링크 `[text](url)`, 이미지 `![alt](url)`, 구분선 `---`, 표 `| A | B |`.

**수식**: 인라인 `$E = mc^2$`; 블록 `$$\int_0^1 x\,dx$$`(여러 줄에 걸칠 수 있음). LaTeX 구문을 사용하며 KaTeX로 렌더링; 코드 블록 안의 `$`는 수식 구분 기호로 취급되지 않습니다. `align` / `aligned`, 행렬, `cases` 및 기타 일반 환경을 지원합니다.

**인용**: 본문에 `[@key]` 또는 `[@a; @b]`를 작성하고(LaTeX 호환 `\cite{key}`), ` ```bibtex ` 블록으로 라이브러리를 임베드하거나 "Refs" 버튼으로 `.bib`를 로드합니다. 끝에 참고문헌 목록이 생성되며, 본문의 `[n]`은 클릭 가능합니다.

---

## 📤 내보내기 (다른 이름으로 저장)

"다른 이름으로 저장"을 클릭하고 형식을 선택하세요:

- **Markdown (.md)**: 소스를 저장하고 현재 탭의 이름 / 경로를 갱신합니다.
- **HTML (.html)**: CSS와 코드 하이라이트가 인라인된 자체 포함형 HTML; 수식은 `$…$` 리터럴로 유지되며 인라인된 KaTeX로 자동 렌더링됩니다.
- **PDF 벡터**: 시스템 인쇄 대화상자, 벡터 출력, 모든 확대에서 선명. "PDF로 저장"을 선택하세요.
- **PDF 래스터**: PDF 파일을 직접 생성(대화상자 없음), 저해상도 / 중해상도 / 고해상도; 블록 경계에서 페이지 분할(수식 / 제목 / 코드가 끊어지지 않음).
- **LaTeX (.tex)**: 컴파일 가능한 `.tex` 소스로 변환(documentclass와 패키지 포함; 수식은 그대로 유지). 사본을 내보냅니다.

---

## 🔒 오프라인 및 보안

- **런타임 네트워크 요청 제로.** 빌드 결과물 `dist/index.html`은 자체 검사됩니다: `src=` / `href=` / `url()` / `@import` 외부 링크 없음.
- 엄격한 CSP(로컬 IPC만, WAN 없음); 모든 파일은 로컬에서 읽기/쓰기되며 업로드되지 않습니다.
- 확인: Wi-Fi를 끄거나 케이블을 뽑고 실행 — 수식, 이미지, 코드 하이라이트, Mermaid가 모두 작동합니다.
- `dist/index.html`에는 여전히 ~12개의 `https://github.com/…` 문자열이 보입니다; 이들은 모두 `marked` / `highlight.js` 등의 **라이선스 / 소스 주석** 안에 있는 일반 텍스트로, **요청을 절대 발생시키지 않습니다**; 오픈소스 라이선스를 존중하기 위해 그대로 유지합니다.

---

## 📦 설치

### 사전 빌드된 다운로드
[Releases](./)에서 플랫폼에 맞는 설치 파일을 받으세요: macOS(`.dmg`, universal arm64 + x86_64), Windows(`.exe` / `.msi`), Linux(`.deb` / `.AppImage`).

### macOS에서 서명되지 않은 앱 열기(Gatekeeper 우회)
이 앱은 개발자 서명 / 공증이 되어 있지 않습니다(오프라인 시나리오에서는 보통 온라인 공증이 불가능). 최초 실행이 차단되면 — 다음 중 하나를 선택하세요:

- **CLI(권장)**: `.app`을 응용 프로그램으로 드래그한 뒤,
  ```bash
  xattr -dr com.apple.quarantine "/Applications/MDeX.app"
  ```
- **GUI**: Finder에서 `.app`을 우클릭 → "열기" → 대화상자에서 다시 "열기"; 또는 "시스템 설정 → 개인정보 보호 및 보안" → 아래로 스크롤 → "그래도 열기".

---

## 🛠️ 소스에서 빌드

### 일회성 설정(macOS)
```bash
xcode-select --install                       # Xcode command-line tools
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # both needed for universal
npm install                                  # Tauri cli
npm run fetch                                # download frontend deps into vendor/ (online only here)
```

### 로컬 개발
```bash
npm run tauri dev        # builds dist/index.html, then launches the app window
```

### 빌드
```bash
# Apple Silicon only (faster)
npm run tauri build

# Universal binary (Apple Silicon + Intel, for distribution)
npm run tauri build -- --target universal-apple-darwin
```

출력:
```
src-tauri/target/universal-apple-darwin/release/bundle/
├── macos/MDeX.app
└── dmg/MDeX_1.1.0_universal.dmg
```

### Windows / Linux / 크로스 플랫폼
- **네이티브 Windows 빌드**(NSIS `.exe` 설치 파일 생성): [BUILD-WINDOWS.md](./BUILD-WINDOWS.md) 참조.
- **Linux / macOS Intel / 기타 크로스 플랫폼**: [BUILD-CROSS.md](./BUILD-CROSS.md) 참조.

프론트엔드 `dist/index.html`은 플랫폼 간 변경이 필요 없습니다; 대상 OS에서 번들링만 조정하면 됩니다(`tauri.conf.json`의 `bundle.targets`에 `nsis` / `deb` / `appimage` 추가, 그리고 WebView2 / webkit2gtk 등 시스템 의존성).

---

## 📁 프로젝트 구조

```
markdown/
├── app-shell.html          # frontend source (HTML+CSS+JS, all app logic)
├── tools/
│   ├── fetch-vendor.mjs    # one-time: download deps into vendor/ (online only here)
│   └── build-html.mjs      # inline vendor into dist/index.html (KaTeX fonts → base64)
├── dist/index.html         # build output: fully offline single file (Tauri frontendDist)
├── vendor/                 # download cache (.gitignore)
├── package.json            # @tauri-apps/cli + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + tauri-plugin-dialog / single-instance
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # 1200×750 window, strict CSP, icons, .md association, menu hooks
    ├── capabilities/default.json
    ├── icons/              # full icon set from `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menus + file IO + multi-window routing
```

---

## 🎨 커스터마이징

| 변경 항목 | 위치 |
| --- | --- |
| 앱 이름 / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| 창 크기 | `tauri.conf.json` → `app.windows[0]`(기본 1200×750) |
| 아이콘 | 소스 이미지를 교체한 뒤 `npm run icon` |
| 테마 색상 / 글꼴 | `app-shell.html` 상단의 `:root` CSS 변수 |
| 메뉴 항목 | `src-tauri/src/lib.rs`의 `build_menu()` |
| UI 문자열 / 도움말 문서 | `app-shell.html`의 `I18N` / `HELP_STRINGS` |
| 의존성 버전 | `tools/fetch-vendor.mjs` 상단의 `VERSIONS`(이후 `npm run fetch -- --force`) |

---

## 📄 라이선스

이 프로젝트 자체 코드는 **Apache License 2.0**로 오픈소스화됩니다.

- 전체 라이선스 텍스트: [LICENSE](./LICENSE).
- 제3자 구성 요소 고지: [NOTICE](./NOTICE)(marked / KaTeX / highlight.js / DOMPurify / jsPDF / html2canvas-pro / turndown / mermaid / @retorquere/bibtex-parser 와 Tauri 등, 각각 MIT / BSD-3-Clause / Apache-2.0 / MPL-2.0).
- Apache-2.0에 따라 재배포 시 LICENSE와 NOTICE를 유지해야 하며, 수정된 파일의 변경 사항을 표시해야 합니다.

---

## 📬 연락처

문제나 제안 사항: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
