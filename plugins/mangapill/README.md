# MangaPill (en)

Public HTML endpoints verified on 2026-10-23 with Witch Craft Works (`4812`):

- `/search?q=<query>&page=<page>`: manga cards; next-page URLs, not the mere
  presence of a button, determine whether another search page exists.
- `/manga/<numeric-id>`: metadata and full chapter list; cosmetic title slugs
  are unnecessary. `/chapters/<numeric-id-pair>` similarly opens a chapter.
- `/chapters`: recent updates. The homepage's Trending Mangas section is a
  separate, finite discovery list. Neither home list is paginated.
- `picture img[data-src]` holds ordered reader images. Covers are lazy-loaded
  too. Images declare the site Referer.

Verified 53 pages in the first chapter and an image GET returning HTTP 200.
The live Trending heading is nested in a wrapper, unlike the reference
extension's older selector; the plugin scopes cards to its enclosing grid.
All requests use the runtime fetch/throttling. No login or challenge bypass.

Reference: [Keiyoushi MangaPill](https://github.com/keiyoushi/extensions-source/tree/main/src/en/mangapill).
Tests use trimmed offline fixtures.
