<details>
<summary><b>🌐 Ngôn ngữ: Tiếng Việt</b> — nhấp để chọn ngôn ngữ khác</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [العربية](README.ar.md) · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · **[Tiếng Việt](README.vi.md)** · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v2.2.1 (macOS · Windows · Linux · Tauri v2)

> **MDeX** · đọc là "em-dex" (/ˌemˈdɛks/) — chữ M theo sau là "dex", gồm hai âm tiết.

Một trình đọc & soạn thảo Markdown đa ngôn ngữ tập trung vào **quyền riêng tư và hỗ trợ AI**. Mọi tệp đều được xử lý cục bộ — **mặc định không mạng, không tải lên, không đồng bộ đám mây, không quảng cáo, không đo lường từ xa**; lưu nguyên tử (chống sự cố) tránh mất dữ liệu khi sập chương trình hoặc mất điện. Kể từ v2.0, MDeX cũng cung cấp tính năng chỉnh sửa có hỗ trợ AI tùy chọn — và có thể vẫn hoàn toàn ngoại tuyến: một mô hình cục bộ (ví dụ Ollama) không cần internet; chỉ dịch vụ AI trực tuyến (OpenAI / DeepSeek / Anthropic / GLM / Gemini / Kimi v.v.) mới tạo yêu cầu mạng, và chỉ khi bạn cấu hình và kích hoạt nó.

- Một giao diện diện HTML khép kín đơn lẻ (không dùng Vue / React); Tauri v2 chỉ cung cấp lớp vỏ gốc (cửa sổ, menu, hộp thoại tệp).
- **Không có yêu cầu mạng khi chạy**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` và toàn bộ font woff2 của KaTeX đều được nhúng / base64-nhúng vào một `index.html` duy nhất.
- Hỗ trợ `.md` / `.markdown` / `.html`; có thể đặt làm trình mở mặc định cho `.md` — nhấp đúp để mở.


---

## 🌐 Ngôn ngữ

Giao diện được cung cấp bằng **17 ngôn ngữ**: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- Chuyển đổi bất kỳ lúc nào từ menu ngôn ngữ trên thanh công cụ; lựa chọn của bạn được ghi nhớ giữa các phiên.
- **Tiếng Ả Rập và tiếng Urdu được hiển thị từ phải sang trái (RTL)** tự động — văn bản thân bài, tiêu đề, ký hiệu danh sách và toàn bộ thanh công cụ lật sang bên phải; các khối mã nhúng, công thức LaTeX, thuật ngữ tiếng Anh và số phiên bản vẫn giữ từ trái sang phải, không bị lật.
- Tệp README này cũng được dịch sang toàn bộ 17 ngôn ngữ — hãy dùng bộ chọn ở ngay đầu trang này.

---

## ✨ Tính năng

- **Đa thẻ + đa cửa sổ**: mở nhiều tệp cùng lúc; thay đổi chưa lưu được đánh dấu bằng một dấu chấm và bạn sẽ được hỏi trước khi đóng; nhấp chuột giữa vào thẻ để đóng. Nhấp đúp vào một tệp `.md` sẽ mở cửa sổ riêng (mỗi tệp một cửa sổ); nhấp đúp vào tệp đang mở sẽ **tiêu điểm sang cửa sổ đó** thay vì mở lại.
- **Xem trước chia đôi trực tiếp**: kéo vạch phân cách để đổi kích thước; nút trên thanh công cụ luân chuyển giữa Chia đôi / Soạn thảo / Xem trước.
- **Nhấp để định vị**: nhấp trong trình soạn thảo để cuộn phần xem trước; nhấp trong phần xem trước để nhảy con trỏ trong trình soạn thảo.
- **Tìm & thay thế**: tìm, thay thế một hoặc tất cả, kèm số lượng khớp.
- **Toán học**: inline `$…$` và khối `$$…$$` (cả `\(...\)`, `\[...\]`), được render bởi KaTeX; công thức dài sẽ xuống dòng tại toán tử hoặc tự thu nhỏ.
- **Tô sáng mã**: ngôn ngữ được phát hiện tự động; tài liệu lớn được tô sáng lười theo vùng nhìn để giữ mượt mà.
- **Sơ đồ Mermaid**: một khối ` ```mermaid ` được render thành flowchart / sequence / class / state / Gantt / pie, v.v.; nhấp vào sơ đồ để mở cửa sổ xem độc lập (zoom / pan / toàn màn hình) cập nhật trực tiếp khi bạn chỉnh sửa.
- **Hình ảnh**: dán / thả / chọn — lưu vào thư mục `<têntệp>_images/` cạnh tài liệu với tham chiếu tương đối sạch (không base64 nội tuyến); bản nháp dùng thư mục tạm được di chuyển khi lưu; «Lưu thành» làm phẳng hình ảnh vào đích; căn giữa theo mặc định.
- **Thu phóng font**: thu phóng font trình soạn thảo và xem trước độc lập (điều khiển −/phần trăm/+, hoặc `⌘/Ctrl + =/−/0`); giữ lại qua các lần khởi động lại.
- **Bảng**: bảng GFM; bảng hẹp được căn giữa theo nội dung, bảng rộng cuộn ngang không bị cắt.
- **Trích dẫn (BibTeX)**: cú pháp `[@key]` / `\cite{key}`, kiểu số; danh sách Tài liệu tham khảo được tạo ở cuối, với liên kết hai chiều giữa `[n]` trong văn bản và mục tương ứng; hỗ trợ khối ` ```bibtex ` nhúng hoặc một tệp `.bib` tải riêng.
- **Hỗ trợ HTML**: mở tệp `.html` để render; chuyển đổi hai chiều giữa HTML và Markdown.
- **Giao diện / ngôn ngữ**: tối / sáng, **17 ngôn ngữ UI** (English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — tiếng Ả Rập và tiếng Urdu tự động từ phải sang trái).
- **Bản nháp tự động**: nội dung được lưu định kỳ và khôi phục sau khi đóng / sập đột ngột.
- **Đếm từ**: thanh trạng thái hiển thị ký tự / dòng / từ trực tiếp, cùng hàng & cột hiện tại.
- **Kéo-thả**: thả một tệp `.md` lên cửa sổ để mở; thả một hình ảnh để chèn.
- **Xuất**: lưu dưới dạng Markdown / HTML / PDF (vector) / LaTeX.
- **Màu chữ**: bảng màu trên thanh công cụ bọc vùng chọn trong `<span style="color:…">`.
- **Chỉnh sửa có hỗ trợ AI**: chọn một đoạn văn bản và nhấn `⌘/Ctrl + J` (hoặc nút trên thanh công cụ) để AI tinh chỉnh, mở rộng hoặc đổi giọng điệu; hoạt động với các dịch vụ trực tuyến (OpenAI / DeepSeek / Anthropic / GLM / Gemini / Kimi, v.v.) và với mô hình cục bộ như Ollama để dùng hoàn toàn ngoại tuyến; kết quả được xem trước trước khi thay thế bản gốc, và khóa API chỉ được lưu cục bộ.
- **Lùi / Tiến**: lịch sử thống nhất qua tài liệu và vị trí con trỏ; nút ◀ ▶, `Alt+←/→`.
- **Mở liên kết**: nhấp liên kết trong xem trước sẽ mở đích trong tab mới (http trong trình duyệt hệ thống); tài liệu hiện tại không bị thay thế.

---

## 📦 Cài đặt

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

## ⌨️ Phím tắt

Dùng `⌘` trên macOS, `Ctrl` trên Windows / Linux.

| Phím tắt | Hành động |
| --- | --- |
| `⌘/Ctrl + N` | Mới |
| `⌘/Ctrl + O` | Mở tệp |
| `⌘/Ctrl + S` | Lưu |
| `⌘/Ctrl + Shift + S` | Lưu thành |
| `⌘/Ctrl + W` | Đóng thẻ |
| `⌘/Ctrl + Shift + W` | Đóng cửa sổ |
| `⌘/Ctrl + F` | Tìm |
| `⌘/Ctrl + H` | Thay thế |
| `⌘/Ctrl + B` / `I` / `R` | Đậm / Nghiêng / Mã inline |
| `⌘/Ctrl + K` | Chèn liên kết |
| `Tab` | Thụt lề 2 khoảng trắng |
| `Alt/Option + kéo` | Chọn hình chữ nhật (cột) |
| `Alt/Option + Shift + ←↑↓→` | Mở rộng chọn cột |
| `Esc` | Hủy chọn cột |
| `⌘/Ctrl + =/−/0` | Thu phóng khung cuối cùng được nhấp (trình soạn thảo hoặc xem trước): phóng to / thu nhỏ / đặt lại |
| `⌘/Ctrl + J` | Chỉnh sửa có hỗ trợ của AI |

> Khi có nhiều cửa sổ đang mở, phím tắt chỉ tác động lên cửa sổ đang được tiêu điểm. Khi cửa sổ trình xem hình ảnh đang mở, `⌘/Ctrl + =/−/0` thu phóng hình ảnh.

---

## 📝 Bảng tham chiếu nhanh

**Markdown**: tiêu đề `# / ## / ###`, đậm `**text**`, nghiêng `*text*`, gạch ngang `~~text~~`, mã inline `` `code` ``, khối mã (ba dấu backtick, kèm ngôn ngữ tùy chọn), trích dẫn `> text`, danh sách `- / 1.`, danh sách công việc `- [ ] / - [x]`, liên kết `[text](url)`, hình ảnh `![alt](url)`, vạch phân cách `---`, bảng `| A | B |`.

**Toán học**: inline `$E = mc^2$`; khối `$$\int_0^1 x\,dx$$` (có thể trải dài nhiều dòng). Sử dụng cú pháp LaTeX, render bởi KaTeX; `$` bên trong khối mã không được xử lý như dấu phân cách toán. Hỗ trợ các môi trường phổ biến như `align` / `aligned`, ma trận, `cases`, v.v.

**Trích dẫn**: viết `[@key]` hoặc `[@a; @b]` trong văn bản (tương thích `\cite{key}` của LaTeX), nhúng thư viện qua khối ` ```bibtex ` hoặc tải tệp `.bib` bằng nút "Refs". Danh sách Tài liệu tham khảo được tạo ở cuối; `[n]` trong văn bản có thể nhấp được.

---

## 📤 Xuất (Lưu thành)

Nhấp "Lưu thành" và chọn định dạng:

- **Markdown (.md)**: lưu mã nguồn và cập nhật tên / đường dẫn của thẻ hiện tại.
- **HTML (.html)**: HTML khép kín kèm CSS nhúng + tô sáng mã; công thức toán được giữ dạng literal `$…$`, tự render bởi KaTeX nhúng sẵn.
- **PDF vector**: hộp thoại in của hệ thống, xuất vector, sắc nét ở mọi mức thu phóng. Chọn "Lưu thành PDF".
- **LaTeX (.tex)**: chuyển đổi thành mã nguồn `.tex` có thể biên dịch (kèm documentclass và các gói; công thức toán giữ nguyên). Xuất một bản sao.

---

## 🔒 Ngoại tuyến & bảo mật

- **Không có yêu cầu mạng khi chạy.** Đầu ra build `dist/index.html` được tự kiểm tra: không có liên kết ngoài `src=` / `href=` / `url()` / `@import`.
- CSP nghiêm ngặt (chỉ IPC cục bộ, không WAN); mọi tệp đều được đọc / ghi cục bộ, không có gì tải lên.
- Xác minh: tắt Wi-Fi / rút cáp và khởi động — toán, hình ảnh, tô sáng mã và Mermaid đều hoạt động.
- `dist/index.html` vẫn hiển thị khoảng một tá chuỗi `https://github.com/…`; tất cả đều nằm trong **chú thích giấy phép / nguồn** của `marked` / `highlight.js` v.v. — văn bản thuần túy **không bao giờ tạo yêu cầu mạng**; giữ nguyên để tôn trọng giấy phép mã nguồn mở.

---

## 🛠️ Build từ mã nguồn

Mã nguồn: <https://github.com/fwzheng/mdex>. Làm theo hướng dẫn build trong kho mã nguồn (thiết lập, phụ thuộc và lệnh được ghi trong đó).

---

## 📁 Cấu trúc dự án

```
markdown/
├── app-shell.html          # vỏ giao diện (HTML+CSS); logic ứng dụng nằm trong src/app.js
├── src/
│   ├── app.js              # logic ứng dụng (// @ts-check; được nhúng vào dist bởi build-html.mjs)
│   ├── i18n.js            # 17-language UI strings (pure data; window.I18N, split from app.js)
│   ├── help.js            # help-document data (HELP_STRINGS + SK/sc/CITE_HELP_*, window.HELP_DATA)
│   └── globals.d.ts        # khai báo kiểu vendor / Window cho kiểm tra kiểu
├── tsconfig.json           # cấu hình kiểm tra kiểu (tsc --noEmit; không bundler)
├── tools/
│   ├── fetch-vendor.mjs    # một lần: tải deps vào vendor/ + khóa toàn vẹn (chỉ bước này cần mạng)
│   ├── build-html.mjs      # nhúng vendor + src/app.js + i18n.js + help.js vào dist/index.html (font KaTeX → base64)
│   └── test-pure.mjs       # kiểm thử hàm thuần giao diện (npm test)
├── dist/index.html         # đầu ra build: tệp đơn độc lập (Tauri frontendDist)
├── vendor/                 # bộ nhớ đệm tải về + integrity.json (.gitignore)
├── package.json            # @tauri-apps/cli + typescript(dev) + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + dialog / single-instance + encoding_rs
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # cửa sổ 1200×750, CSP nghiêm ngặt, biểu tượng, liên kết .md, móc menu
    ├── capabilities/default.json
    ├── icons/              # bộ biểu tượng đầy đủ từ `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menu + IO tệp + định tuyến đa cửa sổ + ghi nguyên tử / sở hữu tệp
```

---

## 🎨 Tùy biến

| Để thay đổi | Vị trí |
| --- | --- |
| Tên ứng dụng / Bundle ID | `src-tauri/tauri.conf.json` → `productName` / `identifier` |
| Kích thước cửa sổ | `tauri.conf.json` → `app.windows[0]` (mặc định 1200×750) |
| Biểu tượng | thay ảnh nguồn, rồi `npm run icon` |
| Màu giao diện / font | biến CSS `:root` ở đầu `app-shell.html` |
| Mục menu | `build_menu()` trong `src-tauri/src/lib.rs` |
| Chuỗi UI / tài liệu trợ giúp | `I18N` / `HELP_STRINGS` trong `src/app.js` |
| Phiên bản dependency | `VERSIONS` ở đầu `tools/fetch-vendor.mjs` (rồi `npm run fetch -- --force`) |

---

## 📄 Giấy phép

Mã nguồn riêng của dự án này là mã nguồn mở theo **Apache License 2.0**.

Thành phần bên thứ ba: dự án sử dụng một số thành phần bên thứ ba (bao gồm nhưng không giới hạn marked, KaTeX, highlight.js, DOMPurify, jsPDF, html2canvas-pro, turndown, mermaid, @retorquere/bibtex-parser và Tauri, v.v.); thông báo bản quyền và giấy phép chi tiết nằm trong các tệp nguồn tương ứng. Các thành phần này tương ứng dưới các giấy phép MIT, BSD-3-Clause, Apache-2.0, MPL-2.0 và các giấy phép nguồn mở khác.

Yêu cầu phân phối: theo giấy phép Apache-2.0, khi phân phối lại dự án này phải giữ lại các tệp LICENSE và NOTICE; nếu bạn sửa đổi tệp nguồn, phải ghi rõ thay đổi trong tệp tương ứng.

---

## 📬 Liên hệ

Về vấn đề hoặc góp ý: **郑法伟 (Fawei Zheng) <fwzheng@bit.edu.cn>**
