<details>
<summary><b>🌐 اللغة: العربية</b> — انقر لاختيار لغة أخرى</summary>

[English](README.md) · [简体中文](README.zh-CN.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **[العربية](README.ar.md)** · [हिन्दी](README.hi.md) · [ਪੰਜਾਬੀ](README.pa.md) · [Tiếng Việt](README.vi.md) · [Bahasa Indonesia](README.id.md) · [اردو](README.ur.md) · [Монгол (Кирилл)](README.mn.md)

</details>


# MDeX v2.4.0 (macOS · Windows · Linux · Tauri v2)

> **MDeX** · يُنطق "em-dex" (/ˌemˈdɛks/) — الحرف M يتبعه "dex"، مقطعان لفظيان.

قارئ ومحرر Markdown متعدد اللغات يركّز على **الخصوصية والمساعدة عبر AI**. تتم معالجة كل ملف محلياً — **افتراضياً لا شبكة، لا رفع للملفات، لا مزامنة سحابية، بدون إعلانات، بدون قياس عن بعد**؛ الحفظ الذري (المقاوم للأعطال) يمنع فقدان البيانات عند الانهيار أو انقطاع التيار. اعتباراً من v2.0، يقدّم MDeX أيضاً ميزة اختيارية لتحرير بمساعدة الذكاء الاصطناعي — ويمكنه البقاء دون اتصال بالكامل: النموذج المحلي (مثل Ollama) لا يحتاج إلى إنترنت؛ فقط خدمة AI عبر الإنترنت (OpenAI / DeepSeek / Anthropic / GLM / Gemini / Kimi إلخ) تُجري الطلب، وذلك فقط عند تهيئتها وتشغيلها.

- واجهة أمامية بملف HTML واحد مكتفٍ ذاتياً (بدون Vue / React)؛ يوفر Tauri v2 القشرة الأصلية فقط (النوافذ، القوائم، حوارات الملفات).
- **صفر طلبات شبكة أثناء التشغيل**: `marked` / `KaTeX` / `highlight.js` / `DOMPurify` / `mermaid` / `jsPDF` / `html2canvas-pro` / `turndown` / `@retorquere/bibtex-parser` وجميع خطوط KaTeX بصيغة woff2 مُضمَّنة / مُضمَّنة بـ base64 داخل ملف `index.html` واحد.
- يدعم الصيغ `.md` / `.markdown` / `.html`؛ ويمكن تعيينه كالتطبيق الافتراضي لفتح `.md` — انقر مرتين للفتح.


---

## 🌐 Languages

تأتي الواجهة بـ **17 لغة**: English, 简体中文, Français, Deutsch, Español, Português, Italiano, Русский, 日本語, 한국어, العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл).

- بدِّل اللغة في أي وقت من قائمة اللغات في شريط الأدوات؛ ويتم تذكُّر اختيارك عبر الجلسات.
- **تُعرض العربية من اليمين إلى اليسار (RTL)** تلقائياً — ينعكس نص المتن، والعناوين، وعلامات القوائم، وكامل شريط الأدوات إلى اليمين؛ أما كتل الشيفرة المُضمَّنة، وصيغ الرياضيات LaTeX، والمصطلحات الإنجليزية، وأرقام الإصدارات فتبقى من اليسار إلى اليمين ولا تنعكس أبداً.
- تُرجم ملف README هذا نفسه إلى جميع اللغات الـ 17 — استخدم المُنتقي أعلى هذه الصفحة.

---

## ✨ الميزات

- **نوافذ متعددة وعلامات متعددة**: افتح عدة ملفات في آن واحد؛ التغييرات غير المحفوظة تُعلَّم بنقطة، ويُطلب منك التأكيد قبل الإغلاق؛ انقر زر الماوس الأوسط على علامة لإغلاقها. النقر المزدوج على ملف `.md` يفتح نافذة خاصة به (نافذة واحدة لكل ملف)؛ والنقر المزدوج على ملف مفتوح أصلاً **ينقل التركيز إلى تلك النافذة** بدلاً من فتحه من جديد.
- **معاينة مقسَّمة حيَّة**: اسحب الفاصل لتغيير الحجم؛ زر شريط الأدوات يتنقل بين المقسَّم / المحرر / المعاينة.
- **النقر للتموضع**: انقر في المحرر لتمرير المعاينة؛ وانقر في المعاينة للقفز بالمؤشر في المحرر.
- **البحث والاستبدال**: بحث، واستبدال فردي أو شامل، مع عدد التطابقات.
- **الرياضيات**: سطري `$…$` وكتلي `$$…$$` (أيضاً `\(...\)`, `\[...\]`)، يُعرض عبر KaTeX؛ المعادلات الطويلة تُلتف عند عوامل التشغيل أو تتقلص تلقائياً.
- **تلوين الشيفرة**: يُكتشف اللغة تلقائياً؛ المستندات الكبيرة تُلوَّن بكسلًا حسب الإطار الظاهر لتبقى سلسة.
- **مخططات Mermaid**: كتلة ` ```mermaid ` تُعرض كمخطط انسيابي / تسلسل / أصناف / حالات / Gantt / دائري، وغيرها؛ انقر على مخطط لفتح نافذة عرض مستقلة (تكبير / تحريك / ملء الشاشة) تتحدث مباشرة أثناء التحرير.
- **الصور**: لصق / إفلات / اختيار — تُحفَظ في مجلد `<اسم الملف>_images/` بجانب المستند مع مرجع نسبي نظيف (بدون base64 مضمَّن); المسودات تستخدم مجلداً مؤقتاً يُرحَّل عند الحفظ; «حفظ باسم» يُسطِّح الصور إلى الهدف; تُوسَّط افتراضياً.
- **تكبير الخط**: كبِّر خطوط المحرر والمعاينة بشكل مستقل (عناصر تحكم −/نسبة مئوية/+، أو `⌘/Ctrl + =/−/0`); يبقى عبر إعادة التشغيل.
- **الجداول**: جداول GFM؛ الجداول الضيقة تُوسَّط حسب المحتوى، والعريضة تُمرَّر أفقياً دون قص.
- **الاستشهادات (BibTeX)**: الصياغة `[@key]` / `\cite{key}`، بنمط رقمي؛ ويُولَّد قائمة المراجع في النهاية، مع قفزات ثنائية الاتجاه بين `[n]` في النص والبند المقابل؛ ويدعم كتلة ` ```bibtex ` مُضمَّنة أو ملف `.bib` يُحمَّل على حدة.
- **دعم HTML**: افتح ملفات `.html` للعرض؛ وحوِّل بين HTML وMarkdown.
- **السمة / اللغة**: داكنة / فاتحة، **17 لغة واجهة** (中文, English, Français, Deutsch, Русский, Italiano, 日本語, 한국어, Español, Português, العربية — العربية, हिन्दी, ਪੰਜਾਬੀ, Tiếng Việt, Bahasa Indonesia, اردو, Монгол (Кирилл) — العربية والأردية تلقائياً من اليمين إلى اليسار).
- **المسودة التلقائية**: يُحفظ المحتوى دورياً ويُستعاد بعد إغلاق غير متوقع / انهيار.
- **عدّ الكلمات**: يعرض شريط الحالة الأحرف / الأسطر / الكلمات لحظياً، إضافة إلى الصف والعمود الحاليين.
- **السحب والإفلات**: أفلت ملف `.md` على النافذة لفتحه؛ وأفلت صورة لإدراجها.
- **التصدي**: احفظ بصيغة Markdown / HTML / PDF (متجه) / LaTeX.
- **لون النص**: لوحة الشريط تحيط التحديد بـ `<span style="color:…">`.
- **تحرير بمساعدة الذكاء الاصطناعي**: حدِّد بعض النص واضغط `⌘/Ctrl + J` (أو زر شريط الأدوات) لينقَّحه الذكاء الاصطناعي أو يوسِّعه أو يُعدِّل نبرته؛ يعمل مع الخدمات عبر الإنترنت (OpenAI / DeepSeek / Anthropic / GLM / Gemini / Kimi إلخ) ومع نموذج محلي مثل Ollama للاستخدام دون اتصال بالكامل؛ تُعاين النتيجة قبل أن تستبدل الأصل، ولا يُخزَّن مفتاح API إلا محلياً.
- **رجوع / للأمام**: سجل موحد للمستندات ومواضع المؤشر؛ زرّا ◀ ▶، `Alt+←/→`.
- **اتباع الروابط**: النقر على رابط في المعاينة يفتح الهدف في تبويب جديد (http في متصفح النظام)؛ لا يُستبدل المستند الحالي.

---

## 📦 التثبيت

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

## ⌨️ اختصارات لوحة المفاتيح

استخدم `⌘` على macOS، و`Ctrl` على Windows / Linux.

| الاختصار | الإجراء |
| --- | --- |
| `⌘/Ctrl + N` | جديد |
| `⌘/Ctrl + O` | فتح ملف |
| `⌘/Ctrl + S` | حفظ |
| `⌘/Ctrl + Shift + S` | حفظ باسم |
| `⌘/Ctrl + W` | إغلاق العلامة |
| `⌘/Ctrl + Shift + W` | إغلاق النافذة |
| `⌘/Ctrl + F` | بحث |
| `⌘/Ctrl + H` | استبدال |
| `⌘/Ctrl + B` / `I` / `R` | عريض / مائل / شيفرة سطرية |
| `⌘/Ctrl + K` | إدراج رابط |
| `Tab` | إزاحة بمسافتين |
| `Alt/Option + سحب` | تحديد مستطيلي (عمودي) |
| `Alt/Option + Shift + ←↑↓→` | توسيع التحديد العمودي |
| `Esc` | إلغاء التحديد العمودي |
| `⌘/Ctrl + =/−/0` | تكبير آخر جزء تم النقر عليه (المحرر أو المعاينة): تكبير / تصغير / إعادة ضبط |
| `⌘/Ctrl + J` | تحرير بمساعدة الذكاء الاصطناعي |

> عند فتح عدة نوافذ، تؤثر الاختصارات على النافذة المُركَّزة فقط. عندما تكون نافذة عارض الصور مفتوحة، يقوم `⌘/Ctrl + =/−/0` بتكبير الصورة بدلاً من ذلك.

---

## 📝 ورقة مرجعية

**Markdown**: العناوين `# / ## / ###`، عريض `**text**`، مائل `*text*`، يتوسطه خط `~~text~~`، شيفرة سطرية `` `code` ``، كتل شيفرة (ثلاث علامات خلفية، مع لغة اختيارية)، اقتباس `> text`، قوائم `- / 1.`، قائمة مهام `- [ ] / - [x]`، رابط `[text](url)`، صورة `![alt](url)`، فاصل `---`، جداول `| A | B |`.

**الرياضيات**: سطري `$E = mc^2$`؛ كتلي `$$\int_0^1 x\,dx$$` (قد يمتد على عدة أسطر). يستخدم صياغة LaTeX، ويُعرض عبر KaTeX؛ الرمز `$` داخل كتل الشيفرة لا يُعامل كفاصل رياضي. يدعم بيئات شائعة مثل `align` / `aligned` والمصفوفات و`cases` وغيرها.

**الاستشهادات**: اكتب `[@key]` أو `[@a; @b]` في النص (متوافق مع `\cite{key}` في LaTeX)، واضمِّن المكتبة عبر كتلة ` ```bibtex ` أو حمِّل ملف `.bib` عبر زر "Refs". تُولَّد قائمة المراجع في النهاية؛ ويمكن النقر على `[n]` في النص.

---

## 📤 التصدي (حفظ باسم)

انقر "حفظ باسم" واختر الصيغة:

- **Markdown (.md)**: احفظ المصدر وحدِّث اسم / مسار العلامة الحالية.
- **HTML (.html)**: ملف HTML مكتفٍ ذاتياً بـ CSS مُضمَّن وتلوين شيفرة؛ تُحفظ الرياضيات كنص `$…$` حرفي، يُعرض تلقائياً عبر KaTeX مُضمَّن.
- **PDF متجه**: حوار طباعة النظام، خرج متجه، حاد عند أي مستوى تكبير. اختر "حفظ كـ PDF".
- **LaTeX (.tex)**: يُحوَّل إلى مصدر `.tex` قابل للترجمة (مع documentclass والحزم؛ تُحفظ الرياضيات كما هي). يُصدِّر نسخة.

---

## 🔒 العمل دون اتصال والأمان

- **صفر طلبات شبكة أثناء التشغيل.** مخرجات البناء `dist/index.html` تُفحص ذاتياً: لا روابط خارجية `src=` / `href=` / `url()` / `@import`.
- CSP صارم (IPC محلي فقط، بلا WAN)؛ تُقرأ وتُكتب جميع الملفات محلياً، ولا يُرفع أي شيء.
- للتحقق: أوقف الـ Wi-Fi / افصل الكابل وشغِّل التطبيق — الرياضيات، والصور، وتلوين الشيفرة، وMermaid تعمل جميعاً.
- لا يزال `dist/index.html` يُظهر حوالي عشر سلاسل `https://github.com/…`؛ وجميعها داخل **تعليقات الترخيص / المصدر** لكل من `marked` / `highlight.js` وغيرها — نص عادي **لا يُطلِب أي طلب أبداً**؛ وتُركت سليمة احتراماً لتراخيص المصادر المفتوحة.

---

## 🛠️ البناء من المصدر

الكود المصدري: <https://github.com/fwzheng/mdex>. اتبع تعليمات البناء في المستودع (الإعداد والتبعيات والأوامر موثقة هناك).

---

## 📁 بنية المشروع

```
markdown/
├── app-shell.html          # frontend shell (HTML+CSS); app logic lives in src/app.js
├── src/
│   ├── app.js              # application logic (// @ts-check; inlined into dist by build-html.mjs)
│   ├── i18n.js            # 17-language UI strings (pure data; window.I18N, split from app.js)
│   ├── help.js            # help-document data (HELP_STRINGS + SK/sc/CITE_HELP_*, window.HELP_DATA)
│   └── globals.d.ts        # vendor / Window type declarations for type-checking
├── tsconfig.json           # type-check config (tsc --noEmit; no bundler)
├── tools/
│   ├── fetch-vendor.mjs    # one-time: download deps into vendor/ + integrity lock (online only here)
│   ├── build-html.mjs      # inline vendor + src/app.js + i18n.js + help.js into dist/index.html (KaTeX fonts → base64)
│   └── test-pure.mjs       # frontend pure-function tests (npm test)
├── dist/index.html         # build output: self-contained single file (Tauri frontendDist)
├── vendor/                 # download cache + integrity.json (.gitignore)
├── package.json            # @tauri-apps/cli + typescript(dev) + scripts
└── src-tauri/
    ├── Cargo.toml          # tauri 2 + dialog / single-instance + encoding_rs
    ├── build.rs            # tauri_build::build()
    ├── tauri.conf.json     # 1200×750 window, strict CSP, icons, .md association, menu hooks
    ├── capabilities/default.json
    ├── icons/              # full icon set from `cargo tauri icon`
    └── src/{main.rs, lib.rs}   # menus + file IO + multi-window routing + atomic write / file ownership
```

---

## 🎨 التخصيص

| لتغيير | أين |
| --- | --- |
| اسم التطبيق / مُعرِّف الحزمة | `src-tauri/tauri.conf.json` ← `productName` / `identifier` |
| حجم النافذة | `tauri.conf.json` ← `app.windows[0]` (الافتراضي 1200×750) |
| الأيقونات | استبدل الصورة المصدرية، ثم `npm run icon` |
| ألوان السمة / الخطوط | متغيرات CSS في `:root` أعلى `app-shell.html` |
| عناصر القائمة | `build_menu()` في `src-tauri/src/lib.rs` |
| نصوص الواجهة / وثيقة المساعدة | `I18N` / `HELP_STRINGS` في `src/app.js` |
| إصدارات الاعتمادات | `VERSIONS` أعلى `tools/fetch-vendor.mjs` (ثم `npm run fetch -- --force`) |

---

## 📄 الترخيص

شيفرة المشروع نفسها مفتوحة المصدر تحت **Apache License 2.0**.

مكوِّنات الطرف الثالث: يستخدم المشروع بعض مكوِّنات الطرف الثالث (بما في ذلك على سبيل المثال لا الحصر marked وKaTeX وhighlight.js وDOMPurify وjsPDF وhtml2canvas-pro وturndown وmermaid و@retorquere/bibtex-parser وTauri وغيرها)؛ تُفصَّل إشعارات حقوق النشر والترخيص في ملفات المصدر الخاصة بكلٍّ منها. تُوزَّع هذه المكوِّنات تحت تراخيص MIT وBSD-3-Clause وApache-2.0 وMPL-2.0 وتراخيص مفتوحة المصدر أخرى.

متطلبات التوزيع: وفقًا لترخيص Apache-2.0، تتطلب إعادة توزيع هذا المشروع الاحتفاظ بملفي LICENSE وNOTICE؛ وإذا عدَّلت أي ملف مصدر فيجب الإشارة إلى التغييرات بوضوح في الملف المقابل.

---

## 📬 التواصل

للمشاكل أو الاقتراحات: **fw@spinss.cn**
