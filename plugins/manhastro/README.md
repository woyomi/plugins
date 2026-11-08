# Manhastro (pt-BR)

Uses the site's JSON API at `https://api2.manhastro.net`. Checked live on
2026-10-23 with manga `34402` (Cultivando em Solitário na Torre):

- `/dados?page=<page>&nome=<query>&sort=views&order=desc`: paginated search;
  `meta.has_more` controls pagination.
- `/dados?manga_id=<id>`: series metadata. Brazilian title/description fields
  take precedence; original titles remain available as aliases.
- `/dados/<id>`: complete chapter list, not a paginated preview.
- `/paginas/<chapter-id>`: `data.chapter` contains `baseUrl`, `hash`, and an
  ordered filename list. The base URL contains an expiring token, so readers
  resolve pages afresh rather than caching those URLs.
- `/lancamentos` and `/rank/diario`: complete latest/daily-popular lists;
  duplicates are removed and requests for page 2+ return no items.

Verified 149 chapters, 33 pages in chapter `270378`, and a successful
first-image GET. Images and covers declare the site Referer. API timestamps
have no timezone, so the plugin does not invent one. Network access and
throttling are provided by the runtime. No login or challenge bypass is used.

Request shapes cross-checked against the [Keiyoushi source](https://github.com/keiyoushi/extensions-source/tree/main/src/pt/manhastro).
Tests use trimmed offline JSON fixtures, including localized metadata,
pagination, known response prefixes, and error cases.
