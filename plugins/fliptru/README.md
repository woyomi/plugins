# Fliptru (pt-BR)

Brazilian creator-published comics from https://fliptru.com.br. Represented as
`manga` in the SDK, which has no separate comics media type.

Public endpoints checked on 2026-10-23:

- `/search/?term=<query>`: a finite JSON autocomplete list; only comic results
  are accepted. Author suffixes and `/info` are removed.
- `/comics/all?page=<page>`: recent comics; `#loadMoreComics a` signals more.
- `/most_popular_list/`: a finite popular list.
- `/comic/<slug>`: ComicSeries JSON-LD, with HTML metadata fallbacks.
- `/comic/<slug>/chapters?order=asc`: chapter fragments. Follow the
  `#chapters-load-more a[data-url]` cursor until exhausted, deduplicating chapter
  IDs. Pagination is restricted to this comic's same-origin chapter endpoint;
  repeated pages fail rather than looping.
- `/comic/<slug>/<chapter>`: ordered reader images. The live site uses
  `.comic-page-image`, whereas the reference extension still uses
  `.comic_page_image`; both are supported. Age/login-restricted chapters are
  not unlocked; missing reader images produce an explicit error.

Verified Smoke (`smoke-ccgf`, chapter `001`) with six reader images and an
image GET returning HTTP 200. Sense Life was also used to check chapter-list
pagination. All requests use runtime fetch/throttling; no login or bypass.

Reference: [Keiyoushi Fliptru](https://github.com/keiyoushi/extensions-source/tree/main/src/pt/fliptru).
Tests use offline JSON/HTML fixtures, including pagination and both reader
markup variants.
