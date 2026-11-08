# Extension and Android validation — 2026-11-08

## Scope and results

- `git pull --ff-only`: already up to date at `e7dd7aa`; existing local work preserved.
- All 14 extensions: offline tests, strict typechecks, bundle builds, repository index generation.
- Live built bundles: search, first home section, details, episodes, and first episode/chapter resolution, directly and through `../woyomi`'s Engine. The Engine comparison reuses captured network responses. MangaDex's 14 language sources were included.
- Actual app UI: all 14 extensions installed and all 27 sources returned search results in both Chromium (using the woyomi scrape proxy) and the native API 36 Android emulator (native networking, no scrape proxy).
- Native MangaPill: opened One Piece, loaded 1,214 chapter entries, opened chapter 1, and verified decoded reader images through the native loopback/header proxy (57-page chapter). This was actual image loading, not only URL extraction.
- `../woyomi`: build, tests, typecheck, lint, and fixture pipeline smoke test passed.

## Fixes

| Area | Fix |
| --- | --- |
| Repository HTTP server | Malformed percent encoding previously terminated the process. Invalid paths now return 400; `/repo` prefix matching no longer accepts `/repoindex.json`. Added three HTTP regression tests. |
| SubAnimes 0.1.5 | Updated homepage and metadata selectors. Resolve streams using each embedded player's actual origin rather than the obsolete hardcoded CDN. Resolve relative playlist URLs against the master URL. Added three regression tests; live home/details/stream resolution passes. |
| MangaDex 0.1.1 | Skip external-only, unavailable, and zero-page chapters before deduplication so a hosted alternative can be selected. Reject empty chapter content instead of opening a blank reader. Fall back to original images when data-saver images are absent. Added regression coverage. |
| Animes Orion 0.2.2 | Movies were incorrectly labeled anime and omitted from supported media types. Search, home, details, source, and manifest now consistently declare movies; regression assertions added. |
| Android manifest (`../woyomi`) | Explicitly mark touchscreen hardware optional, matching the existing optional Leanback/TV launcher declaration. |
| Android system bars (`../woyomi`) | Use light system-bar icons for the always-dark web UI, even when the Android system theme is light. Rebuilt, installed, and visually verified. |

## Remaining live limitations

- **Animes Orion:** the sampled Violet Evergarden movie only offers WatchPlay and Premium players, which the current resolver does not support. Its Blogger resolver cannot play that title. Search/home/details/episode listing work; no speculative player decoder was added.
- **Manhastro:** both `api2.manhastro.net` and the website's current `api.manhastro.net` return an apparently unfiltered catalog for `nome=one` despite echoing the filter in metadata. Playback/page resolution works, but search relevance needs an upstream API correction or a separately designed catalog-search fallback.
- **MangaDex:** some sampled language/title pairs have no locally hosted readable chapters. Previously some produced empty reader pages; they are now excluded. An empty list is not evidence that an entire language source is broken.
- **Mugiwaras:** live chapter resolution passes. The initial Node harness 403 was caused by joining multiple `set-cookie` headers incorrectly; the harness now preserves separate cookies just like the native provider. No source change was required.

## Android permissions and compatibility

- Built debug APK/AAB successfully for **x86_64** and **arm64-v8a**; ran x86_64 on API 36. Minimum SDK is 24; target/compile SDK is 36.
- Installed permission audit: `INTERNET` and AndroidX's app-scoped non-exported receiver permission only. No broad storage/media, camera, microphone, location, or notification permission is requested. Internal downloads and FileProvider sharing do not require broad storage access.
- Network security trusts system certificates, denies general cleartext, and permits localhost/127.0.0.1 for the native stream/offline server. Local repository installation over the permitted loopback worked.
- APK 16 KB ZIP alignment check passes; both ARM64 and x86_64 native library LOAD segments have `0x4000` alignment.
- Phone UI plus resized tablet (~1067×1707 CSS px) and landscape (~1280×720 CSS px) layouts checked on the same emulator; no document-level horizontal overflow observed. Resizing is **not** a separate physical tablet/TV test. Emulator size/density overrides were reset.
- Not certified: real OEM devices, API 24–35 runtime behavior, old WebViews, actual Android TV/D-pad-only navigation, 32-bit ABIs, release signing, DRM/codec coverage, or every episode on every upstream site. No physical device was connected.

## Reproduce

```sh
pnpm test
pnpm typecheck
pnpm build:repo
WOYOMI_CORE=../woyomi/packages/core/dist/index.js REPORT=/tmp/opencode/woyomi-live.json pnpm test:live
```

Use `PLUGINS=subanimes` or another comma-separated subset to retest a source.
Live smoke checks resolve content but do not download complete videos. Local
screenshots and raw live reports from this run are in `/tmp/opencode/woyomi-*`.
