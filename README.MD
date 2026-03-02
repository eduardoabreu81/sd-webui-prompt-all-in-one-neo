# ✏️ Prompt All-in-One Neo

<div align="center">

[![Forge Neo](https://img.shields.io/badge/Forge-Neo-blue)](https://github.com/Haoming02/sd-webui-forge-classic/tree/neo)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/eduardoabreu81/sd-webui-prompt-all-in-one-neo?style=flat-square)](https://github.com/eduardoabreu81/sd-webui-prompt-all-in-one-neo/stargazers)

> **Extension for [Stable Diffusion WebUI Forge - Neo](https://github.com/Haoming02/sd-webui-forge-classic/tree/neo)**

</div>

> ⚠️ **This is a fork.** All core functionality was created by [Physton](https://github.com/Physton) in the original [sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one). This Neo fork exists solely to maintain compatibility with Forge Neo and to apply community-reported UX fixes that were never merged upstream. If you are not running Forge Neo, **please use the original extension instead**.

<div align="center">

### [🇺🇸 English](README.MD) | [🇷🇺 Русский](README_RU.MD) | [🇨🇳 简体中文](README_CN.MD) | [🇯🇵 日本語](README_JP.MD) | [🇰🇷 한국어](README_KR.MD) | [🇨🇳 繁體中文](README_TW.MD)

</div>

---

## 📋 Table of Contents

- [Neo Versioning](#-neo-versioning)
- [What's New](#-whats-new--v011)
- [Release Story](#-release-story)
- [Roadmap](#️-roadmap)
- [Features](#-features)
- [Demo](#-demo)
- [Installation](#-installation)
- [Language Support](#-language-support)
- [Translation APIs](#-translation-apis)
- [Credits](#-credits)

---

## 🔢 Neo Versioning

Neo uses semantic versioning:

- `X` = Major updates (breaking changes or major architecture shifts)
- `Y` = Minor updates (new features and UX improvements)
- `Z` = Bug fixes, regressions, and stability patches

---

## 🆕 What's New — v0.1.1

> **UX Improvement Batch** — three upstream issues fixed: runtime crash on extra networks load, inconsistent weight display format, and residual space after LoRA tokens.

- **🐛 Extra networks crash fix** — `get_extra_networks` was iterating `ui_extra_networks.extra_pages` directly; in Forge Neo other threads can modify it concurrently, causing `RuntimeError: dictionary changed size during iteration`; now takes a `list()` snapshot before iterating ⭐
- **🔢 Consistent weight format** — new `formatWeight()` helper always renders integer weights with one decimal place (e.g. `1` → `1.0`, `1.1` stays `1.1`); prevents the weight input field from shifting width when toggling through values like `1.9 → 2.0 → 2.1` ⭐
- **🔇 No residual space after LoRA** — `autoRemoveLoraBeforeComma` and `autoRemoveLoraAfterComma` now always set `splitSymbol = ''`; previously they set `' '` when `autoRemoveSpace` was off, leaving a stray space after every LoRA token ⭐

---

## 📖 Release Story

### v0.1.1
> **Theme: UX Improvement Batch** — three community-reported issues from the upstream physton repo fixed.

- [x] `get_extra_networks.py`: wrap `ui_extra_networks.extra_pages` with `list()` to take a snapshot before iterating — prevents `RuntimeError: dictionary changed size during iteration` (#250)
- [x] `common.js`: add `formatWeight(n)` — `Number.isInteger(n) ? n.toFixed(1) : String(n)` — ensures integer weights always emit at least one decimal digit (#341)
- [x] `phystonPrompt.vue` / `tagMixin.js`: replace all `':' + tag.weightNum` with `':' + common.formatWeight(tag.weightNum)` so the new format is applied consistently everywhere a weight is embedded in a tag string
- [x] `phystonPrompt.vue`: `autoRemoveLoraBeforeComma` branch: `splitSymbol = (this.autoRemoveSpace ? '' : ' ')` → `splitSymbol = ''` — always removes the separator before a LoRA token, regardless of the global space setting (#294)
- [x] `phystonPrompt.vue`: `autoRemoveLoraAfterComma` branch: same fix as above for the trailing-separator case (#294)

### v0.1.0
> **Theme: Forge Neo Baseline** — critical compatibility fixes to make the extension load and run on Forge Neo.

- [x] `get_token_counter.py`: removed `from modules.sd_hijack import model_hijack` — `modules/sd_hijack.py` was deleted in Forge Neo; replaced with `sd_models.model_data.sd_model.get_prompt_lengths_on_ui(prompt)` which is the API Forge Neo exposes for token counting
- [x] `get_token_counter.py`: removed `from modules_forge import forge_version` and the forge/non-forge branching — unified to a single try/except pattern that works on all platforms
- [x] `on_app_started.py`: `cmd_opts.data_dir` was removed from Forge Neo's `cmd_args.py`; replaced with `getattr(cmd_opts, 'data_dir', None)` to fail gracefully on Neo while keeping backwards compatibility with older forks
- [x] `.gitignore`: added `.specstory/` to prevent IDE session files from being committed

---

## 🗺️ Roadmap

### v0.1.0 — Forge Neo Baseline *(complete)*
- Remove `modules.sd_hijack` dependency ✅
- Safe `cmd_opts.data_dir` fallback ✅

### v0.1.1 — UX Improvement Batch *(complete)*
- Dictionary iteration crash fix (#250) ✅
- Consistent weight decimal format (#341) ✅
- Residual space after LoRA tokens (#294) ✅

### v0.2.0 — UX Improvements II *(planned)*
- Debounce on initialization to reduce UI lag on load (#328/#289)
- LoRA tag blinking fix when filename ≠ metadata alias (#269)
- Export / import favorites list (#330)
- Visual BREAK / AND separator in the tag area (#278)

### v0.3.0 — Quality Presets *(planned)*
User-defined per-checkpoint quality tag presets, auto-injected at the start of the prompt.
- Register presets manually in a new "Quality Presets" panel; name matched against active checkpoint filename via case-insensitive substring (e.g. `"pony"` matches all Pony family models)
- When a checkpoint is loaded and a matching preset exists, its tags are injected at **position 0** of both positive and negative prompts
- **Auto-insert mode**: tags injected automatically on every generation without user interaction
- **Suggested mode**: a non-intrusive banner appears offering one-click insertion — user can accept or dismiss
- Positive and negative tags are configured independently per preset
- Embeddings (e.g. `<embedding:EasyNegative>`) can be included in the preset alongside plain tags
- Duplicate-safe: if preset tags are already at the start of the prompt, no re-injection occurs
- Reads `modelspec.trigger_phrase` and `modelspec.title` from `.safetensors` metadata when available to pre-populate the form; falls back to filename when metadata is absent
- Stored in `storage/quality_presets.json`

### v0.4.0 — Settings Migration *(planned)*
Move persistent, non-immediate-effect settings from the frontend panel into **Forge Settings → Prompt All-in-One Neo** using `script_callbacks.on_ui_settings` + `shared.opts`, consistent with how Forge extensions manage configuration.
- API keys (Baidu, DeepL, Microsoft, OpenAI, etc.) — sensitive data out of the visible panel
- Default translation service
- Default UI language
- Weight step size
- Auto-translate on type (default on/off)
- Auto-remove space (default on/off)

### v1.0.0 — First Stable Release *(planned)*
- All known regressions resolved
- Quality Presets and Settings migration complete
- Full Forge Neo compatibility guarantee

---

## 🎯 Features

> ⭐ = added or fixed in this Neo fork · everything else is original work by [Physton](https://github.com/Physton)

### ✏️ Prompt Editing

- **Intuitive tag interface** — displays prompt tokens as individual styled chips with bilingual (source ↔ translated) comparison
- **Drag to reorder** — rearrange tags by dragging without retyping
- **One-click weight adjustment** — increase or decrease tag weight with `(` `)` brackets; configurable step size
- **Consistent weight format** — integer weights always display with one decimal place (e.g. `1.0`), preventing input-field layout shifts ⭐
- **NovelAI symbol mode** — switch between `()` and `{}` weight notation
- **Disable/enable tags** without deleting them
- **One-click delete** per tag or via batch box-select
- **BREAK / AND keyword support** — special tokens render correctly in the tag list

### 🔤 Translation

- **Auto-translate** — translates prompt/negative prompt automatically as you type
- **Batch translation** — translate all tags at once with one click
- **Dozens of translation services** — Google, Baidu, DeepL, Microsoft, OpenAI, Alibaba, Tencent, Yandex, and many more
- **API key optional** — most free services work without registration
- **Offline translation** — mBART-50 model supported for air-gapped environments
- **Translation history** — per-tag translated value stored and shown inline

### 🗂️ History & Favorites

- **Automatic history** — every prompt change is recorded
- **Favorites** — bookmark individual tags or entire prompts; one-click restore
- **Batch favorite** — box-select multiple tags and favorite them all at once

### 🔍 Extra Networks

- **LoRA / LyCORIS / Textual Inversion detection** — recognized tokens are highlighted with distinct colors
- **Existence check** — missing LoRA/embedding names are flagged visually
- **Popup info panel** — hover a LoRA tag to see its metadata, preview image, and trained keywords
- **No residual space after LoRA tokens** ⭐
- **Fixed extra-networks crash on concurrent load** ⭐

### 🤖 ChatGPT Integration

- **Generate prompts with ChatGPT** — describe your scene in plain language and get a prompt back
- **Configurable model and API key** — works with any OpenAI-compatible endpoint

### ⚙️ Format & Settings

- **Prompt format options** — comma spacing, trailing comma removal, LoRA separator behavior, newline handling
- **Blacklist** — tags that are automatically filtered out
- **Hotkeys** — configurable keyboard shortcuts per action
- **Custom themes** — override CSS via built-in extension system
- **Token counter** — live token count and max-length indicator using Forge Neo's native `get_prompt_lengths_on_ui` API ⭐

---

## 🎬 Demo

*All demos below are from the original [physton/sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one) — full credit to [Physton](https://github.com/Physton).*

- **Switch language**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.switch_language.gif)

- **Translation API settings**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.translate_setting.gif)

- **Show/Hide panel**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.fold.gif)

- **Automatic translation**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.auto_translate.gif)

- **One-click translation**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.translate.gif)

- **Elegant input**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.elegant_input.gif)

- **Quick weight adjustment**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.quick_adjust.gif)

- **Favorite and History**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.history_favorite.gif)

- **Use ChatGPT to generate prompts**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.chatgpt.gif)

- **LoRA / LyCORIS / Textual Inversion highlighting**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.keyword_detection.gif)

- **Prompt format options**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.prompt_format.gif)

- **Batch operations**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.batch_operation.gif)

- **Custom theme / extension styles**

  ![](https://s1.imagehub.cc/images/2023/06/06/demo.custom_theme.gif)

- **One-click keyword addition**

  ![](https://s1.imagehub.cc/images/2023/08/15/demo.group_tags.gif)

---

## 📦 Installation

### For Forge Neo

1. Open Forge Neo WebUI
2. Navigate to **Extensions** → **Install from URL**
3. Paste: `https://github.com/eduardoabreu81/sd-webui-prompt-all-in-one-neo`
4. Click **Install** and reload WebUI

### Requirements

- ✅ [Stable Diffusion WebUI Forge - Neo](https://github.com/Haoming02/sd-webui-forge-classic/tree/neo)
- ✅ Python 3.10+

> ⚠️ **Not using Forge Neo?** Use the [original physton extension](https://github.com/Physton/sd-webui-prompt-all-in-one) instead. This fork will not work correctly on Automatic1111 or Forge Classic.

---

## 🌐 Language Support

The UI itself is available in 12 languages:

<details>
<summary>UI Supported languages</summary>

`简体中文` `繁體中文` `English` `Русский` `日本語` `한국어` `Français` `Deutsch` `Español` `Português` `Italiano` `العربية`

</details>

Translation supports 100+ languages:

<details>
<summary>Translation Supported languages</summary>

`简体中文 (中国)` `繁體中文 (中國香港)` `繁体中文 (中國台灣)` `English (US)` `Afrikaans (South Africa)` `Shqip (Shqipëria)` `አማርኛ (ኢትዮጵያ)` `العربية (السعودية)` `Հայերեն (Հայաստան)` `অসমীয়া (ভাৰত)` `Azərbaycan dili (Latın, Azərbaycan)` `বাংলা (বাংলাদেশ)` `Башҡорт (Россия)` `Euskara (Espainia)` `Bosanski (Latinski, Bosna i Hercegovina)` `Български (България)` `Català (Espanya)` `Hrvatski (Hrvatska)` `Čeština (Česká republika)` `Dansk (Danmark)` `Nederlands (Nederland)` `Eesti (Eesti)` `Filipino (Pilipinas)` `Suomi (Suomi)` `Français (France)` `Français (Canada)` `Galego (España)` `ქართული (საქართველო)` `Deutsch (Deutschland)` `Ελληνικά (Ελλάδα)` `ગુજરાતી (ભારત)` `עברית (ישראל)` `हिन्दी (भारत)` `Magyar (Magyarország)` `Bahasa Indonesia (Indonesia)` `Gaeilge (Éire)` `Italiano (Italia)` `日本語 (日本)` `ಕನ್ನಡ (ಭಾರತ)` `Қазақ (Қазақстан)` `ភាសាខ្មែរ (កម្ពុជា)` `한국어 (대한민국)` `Кыргызча (Кыргызстан)` `ລາວ (ລາວ)` `Latviešu (Latvija)` `Lietuvių (Lietuva)` `Македонски (Северна Македонија)` `Bahasa Melayu (Latin, Malaysia)` `മലയാളം (ഇന്ത്യ)` `Malti (Malta)` `Māori (Aotearoa)` `मराठी (भारत)` `Монгол (Кирилл, Монгол улс)` `မြန်မာ (မြန်မာ)` `नेपाली (नेपाल)` `Norsk bokmål (Norge)` `فارسی (ایران)` `Polski (Polska)` `Português (Brasil)` `Português (Portugal)` `Română (România)` `Русский (Россия)` `Српски (ћирилица, Србија)` `Slovenčina (Slovensko)` `Slovenščina (Slovenija)` `Soomaali (Soomaaliya)` `Español (España)` `Kiswahili (Kenya)` `Svenska (Sverige)` `தமிழ் (இந்தியா)` `తెలుగు (భారత)` `ไทย (ไทย)` `Türkçe (Türkiye)` `Українська (Україна)` `اردو (پاکستان)` `O'zbekcha (Lotin, O'zbekiston)` `Tiếng Việt (Việt Nam)` `Cymraeg (Y Deyrnas Unedig)` `isiZulu (iNingizimu Afrika)` and more…

</details>

---

## 🌐 Translation APIs

### No API Key Required

Free to use, but may be rate-limited or unstable. If translation fails, switch to another service.

### API Key Required

Most have a free tier — register and obtain a key:

| Service | Free Tier |
|---|---|
| DeepL | ✅ |
| Microsoft Translator | ✅ |
| OpenAI | ❌ |
| Baidu | ✅ |
| Alibaba | ✅ |
| Tencent | ✅ |
| Yandex | ✅ |
| Caiyun | ✅ |
| Niutrans | ✅ |
| iFlytek | ✅ |
| Volcengine | ✅ |
| Amazon Translate | ✅ |

### Offline

- **mBART-50** — downloads a local model on first use (~1.5 GB); works without internet access after download

---

## 📄 Credits

### Original Project — all core functionality

> This fork would not exist without the extensive work of [Physton](https://github.com/Physton). Every feature in this extension was originally designed, built, and maintained by him. Please consider giving a ⭐ to the original repository.

**[sd-webui-prompt-all-in-one](https://github.com/Physton/sd-webui-prompt-all-in-one)** by **[Physton](https://github.com/Physton)**

- Intuitive tag-based prompt interface
- Auto-translate and batch translation with 100+ languages
- History, favorites, blacklist, hotkeys
- ChatGPT integration
- LoRA / LyCORIS / embedding detection and metadata popup
- Custom themes and extension system
- Full multilingual UI (12 languages)

### Neo Fork — Forge Neo compatibility + upstream fixes

**[sd-webui-prompt-all-in-one-neo](https://github.com/eduardoabreu81/sd-webui-prompt-all-in-one-neo)** by **[Eduardo Abreu](https://github.com/eduardoabreu81)**

- Forge Neo compatibility: removed `modules.sd_hijack` dependency, token counter via `get_prompt_lengths_on_ui`
- Safe `cmd_opts.data_dir` fallback for Forge Neo's modified arg set
- UX fixes from upstream community issues: #250, #294, #341

### Special Thanks

- **[Forge Neo](https://github.com/Haoming02/sd-webui-forge-classic/tree/neo)** by [Haoming02](https://github.com/Haoming02)
- All contributors who reported and diagnosed upstream issues

---

## 📜 License

MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions are welcome:
- 🐛 Report bugs
- 💡 Suggest new features
- 🔧 Submit pull requests
- 📖 Improve documentation

---

<div align="center">

Made with ❤️ for the Stable Diffusion community

**[Report Bug](https://github.com/eduardoabreu81/sd-webui-prompt-all-in-one-neo/issues)** • **[Request Feature](https://github.com/eduardoabreu81/sd-webui-prompt-all-in-one-neo/issues)**

Original extension by **[Physton](https://github.com/Physton/sd-webui-prompt-all-in-one)** — please ⭐ the original repo if you find this useful.

</div>
