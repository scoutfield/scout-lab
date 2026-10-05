# Browser Acceptance Matrix

Use this matrix for release verification in the unpacked Chrome extension or the local extension preview. Record evidence in the pull request; do not mark a case passed from unit-test results alone.

## Environments

Run the affected cases in each supported viewport:

| Viewport | Size |
| --- | --- |
| Wide desktop | 1440 x 900 |
| Compact desktop | 900 x 900 |
| Mobile | 390 x 844 |

For theme or layout changes, repeat the affected cases with System, Light, and Dark themes and Comfortable and Compact density.

## Shell And Navigation

- [ ] Today, Code, Models, Datasets, Papers, Posts, and Library tabs open the correct workbench; Learn is absent.
- [ ] Today shows Search and Refresh without Topic, Reset filters, or an empty filter bar.
- [ ] The active tab, page title, source label, filters, and grid update together.
- [ ] Search filters the current cards and clearing search restores them.
- [ ] Reset filters restores the saved defaults for the current workbench.
- [ ] Save as default persists current filters after reload.
- [ ] Refresh fetches the active query without showing cards from the previous query.
- [ ] Settings opens, traps focus, closes with its button and Escape, and restores focus.
- [ ] No unexpected horizontal page overflow, clipped controls, overlapping text, or layout shift appears.
- [ ] Keyboard navigation reaches every interactive control with a visible focus state.

## Source Workbenches

- [ ] Automated Code smoke tests pass: `npm run test:e2e`.
- [ ] Today honors its configured source counts and labels unavailable slots clearly.
- [ ] Code exposes no mode switch; time range, spoken language, programming language, and search controls change the visible query meaning.
- [ ] Code identifies GitHub Trending as live, shows an update time, and links to the exact source query.
- [ ] English and Chinese spoken-language choices match the corresponding GitHub Trending pages.
- [ ] In the unpacked Chrome extension, Code loads GitHub Trending directly without the local preview server or a CORS/CSP error.
- [ ] Code cards show repository identity, description, language, total stars, period stars, and destination link.
- [ ] Models exposes the seven Hugging Face sort choices in source order and each returns the expected ranking.
- [ ] Models Task exposes all 52 model-visible Hugging Face tasks under Multimodal, Natural Language Processing, Audio, Computer Vision, Reinforcement Learning, Tabular, and Other groups.
- [ ] Selecting a task from each group loads matching results, while All tasks removes the pipeline restriction.
- [ ] Models task and parameter-size filters, Base models only, and Inference available work independently and together.
- [ ] Models More filters supports library or format, license, access, compatible app, and updated date without viewport overflow.
- [ ] Quantizations, fine-tunes, adapters, and merges are grouped beneath the base model, and every variant link opens the matching Hugging Face page.
- [ ] Model cards show task, parameter count, library or format, license, access, inference status, updated date, downloads, likes, and trending score when supplied by Hugging Face.
- [ ] Datasets exposes all nine Hugging Face sorts, exact grouped tasks, exact row buckets, and all nine modalities.
- [ ] Dataset format, type, language, license, access, topic, and search filters work independently and in combination.
- [ ] Most rows and Least rows preserve Hugging Face page ordering and show source-provided row metadata.
- [ ] Dataset descriptions decode source HTML entities and remain readable within the card clamp.
- [ ] Community Papers Trending and Recent both remain inside the selected day/week/month cohort.
- [ ] Papers source mode, category, time, sort, topic, and search controls work.
- [ ] Papers switch correctly between community papers and raw arXiv entries.
- [ ] Posts is one score-ranked list with no Hot, Top, Rising, or Trending sort; Today, This week, and This month change the results for both sources.
- [ ] Posts defaults to Reddit; the Subreddit selector appears only for Reddit; switching source keeps the time range.
- [ ] Hacker News posts load AI stories; Discuss opens the HN thread and Article opens the original link.
- [ ] Settings > Reddit communities changes which subreddits All my subreddits covers, and an empty field restores the defaults.
- [ ] Raw arXiv loads in the local preview without a CORS error, and PDF/Code links resolve to their displayed paper.

## Card Actions And Links

- [ ] Clicking a card destination opens the expected source URL.
- [ ] Foreground link mode opens in the current tab.
- [ ] Background link mode requests a background tab without changing the current page.
- [ ] Favorite toggles immediately and persists after reload.
- [ ] Hide removes the card, persists after reload, and can be restored through the hidden-items flow.
- [ ] Comment creates, edits, and removes a note without changing the source content.
- [ ] Card actions remain usable on desktop, compact desktop, and mobile.

## Library Review

- [ ] Library makes no network request and shows Search without Refresh.
- [ ] Favoriting or commenting on any source card adds it immediately to Library.
- [ ] A hidden but favorited or annotated card remains visible in Library and can be unhidden there.
- [ ] All, Favorites, and Notes views work independently and in combination with content-type and source filters.
- [ ] Recently updated, Recently saved, and Title sorts produce stable ordering.
- [ ] Library search includes card metadata and personal comment text.
- [ ] Removing the favorite while retaining a comment keeps the item; clearing the final comment removes it.
- [ ] Library cards and notes persist after reload, cache expiry, source failure, export, and import.
- [ ] The empty Library state explains how automatic membership works.
- [ ] Library cards and controls have no overflow at all supported viewports.

## Long-Session Reading Comfort

- [ ] Comfortable density shows three columns on wide desktop, two on medium widths, and one on mobile.
- [ ] Comfortable card titles are at least 18px and summaries are at least 15px with generous line spacing.
- [ ] Badges, tags, metrics, metadata, and action text are at least 12px in Comfortable density.
- [ ] Comfortable summaries expose up to four lines without changing footer alignment.
- [ ] Compact density remains visibly denser and shows four columns on wide desktop.
- [ ] Light cards are near-white rather than pure white; dark page and card surfaces remain charcoal rather than pure black.
- [ ] Muted and summary text remains clearly readable in Light, Dark, and System themes during sustained reading.

## Settings And Persistence

- [ ] Theme changes immediately; System follows the operating-system theme without reload.
- [ ] No wrong-theme flash appears during startup.
- [ ] Density changes the grid and control spacing without clipping content.
- [ ] Startup workbench opens on a fresh page and persists after reload.
- [ ] Today composition steppers enforce their minimum, maximum, and total constraints.
- [ ] Reset preferences restores product defaults while preserving favorites, hidden items, comments, and snapshots.
- [ ] Export downloads valid JSON without caches or an iCloud directory handle.
- [ ] Import rejects malformed, oversized, or unsupported files without partial writes.
- [ ] Export then import round-trips supported preferences, annotations, daily notes, and snapshots.
- [ ] A version-1 backup is rejected without changing local data.

## Archive And Resilience

- [ ] Connect archive folder requires an explicit user gesture.
- [ ] Save today writes readable Markdown with source-specific fields to the selected folder.
- [ ] A cold new-tab startup prepares Today, Code, Models, Datasets, Papers, and Posts without duplicate overlapping source requests.
- [ ] Opening warmed tabs or another new tab within six hours reuses exact matching cache entries.
- [ ] Expired entries and newly parameterized filter queries fetch fresh source data.
- [ ] Manual Refresh bypasses the active query cache without invalidating unrelated cached queries.
- [ ] Cached content renders before a successful refresh when available.
- [ ] A Code network or parser failure shows no repository cards, plus Retry and the exact GitHub Trending link.
- [ ] Legacy GitHub Search caches and snapshots never appear as Trending.
- [ ] A partial Today source failure does not hide successful source results.
- [ ] No Scout Lab console errors, failed local assets, or new extension permission warnings appear.

## Destination Spot Check

Open at least one visible destination from each source and confirm the page resolves to the same item shown on the card:

- [ ] GitHub repository
- [ ] Hugging Face model
- [ ] Hugging Face dataset
- [ ] Hugging Face paper or arXiv abstract
- [ ] Curated learning resource
