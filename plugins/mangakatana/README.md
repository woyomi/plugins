# MangaKatana (English)

Live endpoints checked on 2026-10-23 with `witch.16743` (Witch):

- `/page/<page>?search=<query>&search_by=book_name`: search cards, or a
  redirect to a single series. The canonical link identifies redirected results.
- `/page/<page>`: latest updates. `/manga/page/<page>`: alphabetical directory
  (intentionally not labeled “Popular”). Next links determine pagination.
- `/manga/<slug.id>`: metadata and full chapter table.
- `/manga/<slug.id>/<chapter>`: inline JavaScript declares the image array used
  by `attr('data-src', array[index])`. The plugin reads URL string literals;
  it never evaluates remote JavaScript. Reader responses are not cached because
  their image URLs contain tokens.

Verified the first chapter's 78 image URLs and a successful first-image GET.
Images and covers declare the site Referer. Network access and throttling are
provided by the runtime. Tests use trimmed offline structural fixtures.

Request shapes cross-checked against the [Keiyoushi source](https://github.com/keiyoushi/extensions-source/tree/main/src/en/mangakatana).
