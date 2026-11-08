# Weeb Central

English manga, manhwa and manhua from https://weebcentral.com.

## Research

Endpoints checked on 2026-10-23 using Witch Hat Atelier
(`01J76XYC2K8QWFZZRYYCZMN6EF`):

- `/search/data` returns HTML cards, with a fixed 32-item offset and an HTMX
  button when another page exists. `sort=Popularity` and `sort=Latest Updates`
  supply the discovery sections; `sort=Best Match` supplies search.
- `/series/<id>` works without the cosmetic title slug and includes metadata.
- `/series/<id>/full-chapter-list` returns every chapter, newest first; the
  regular series page only includes a shortened preview list.
- `/chapters/<id>/images?is_prev=False&reading_style=long_strip` returns ordered
  reader images. Images carry a Referer for runtime image proxy compatibility.

Cross-checked request parameters with the [Keiyoushi extension](https://github.com/keiyoushi/extensions-source/tree/main/src/en/weebcentral/src/eu/kanade/tachiyomi/extension/en/weebcentral).
The implementation parses the site's HTML using the host-provided DOMParser;
linkedom is only a test dependency. Upstream uses one request per two seconds;
request pacing belongs to the host runtime. No login or challenge bypass is
implemented. Availability may vary by network (requests without a User-Agent
returned HTTP 403 during research).

Tests use trimmed inline fixtures matching these responses and run offline.
