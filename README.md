# woyomi-plugins

Plugin repository for [woyomi](https://woyomi.rgw.app): source
plugins plus the pipeline that builds a hostable plugin repo. The main
woyomi project ships no sources and hosts no content — this is where the
source plugins live.

## Layout

```
plugins/animefire       AnimeFire (anime, pt-BR)
plugins/animesonlinecc  Animes Online CC (anime, pt-BR)
plugins/animesorion     Animes Orion (anime + movies, pt-BR)
plugins/betteranime     Better Anime (anime, pt-BR)
plugins/subanimes       SubAnimes (anime, pt-BR)
plugins/mugiwaras       Mugiwaras (manga, pt-BR)
plugins/mangadex        MangaDex (manga, multi-language; official public API)
plugins/comick          Comick (manga, multi-language)
plugins/tsundoku        Tsundoku Traduções (manga + novel, pt-BR)
scripts/build-repo.mjs  merges all plugin dists into repo/
```

Each plugin is a pnpm workspace package depending on the published
`@woyomi/core` SDK and built by `@woyomi/plugin-builder`.

## Usage

Requires Node >= 22 and pnpm 11.8.0.

```sh
pnpm install
pnpm build      # build every plugin -> plugins/<name>/dist (IIFE + manifest + sha256)
pnpm test       # unit tests (offline, inline fixtures)
pnpm build:repo       # build all + merge dists into repo/ (index.json + bundles)
```

## Distributing

- **GitHub Pages (automatic):** every push to `main` rebuilds all plugins
  and deploys the merged `repo/` directory to GitHub Pages
  (`.github/workflows/deploy-repo.yml`). The hosted plugin repository URL
  is **https://woyomi.github.io/plugins/** — add it in the app's Plugins
  screen (Plugins → add repo URL).
- **Manual static hosting:** run `pnpm build:repo` and host the generated `repo/`
  directory anywhere static.
- **woyomi server:** run `apps/server` from the woyomi repo with
  `PLUGIN_REPO_DIR=<this repo>` — the `/repo` endpoint aggregates
  `plugins/*/dist` and serves the same index format.

Bump a plugin's `version` in its `package.json` before rebuilding so clients
see updates (installs are sha256- and apiVersion-gated).

## Adding a plugin

1. Create `plugins/<yoursource>` with a `package.json` named
   `@woyomi/plugin-<yoursource>` (use an existing plugin as a template).
2. Implement the `Source` interface (see the woyomi README's plugin guide)
   and register via `globalThis.__media_plugin_register`.
3. `pnpm build && pnpm test`, then `pnpm build:repo` to publish.

## License

All rights reserved. This repository is published as a plugin distribution
point for woyomi and is not part of the main woyomi project.
