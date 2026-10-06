# Unified Posts and Today Implementation Plan

> **For agentic workers:** Execute inline using executing-plans; each task ends with its verification. Steps use checkbox syntax for tracking.

**Goal:** Ship one filtered Posts feed with editable defaults and a Posts lane in Today.

**Architecture:** Retain the existing workbench, settings, storage, and card APIs. Broaden Hacker News retrieval with bounded, paginated high-score and recent pools, then deduplicate, filter, and apply one deterministic age-adjusted ranking. Share Posts fetches with Today and key the aggregate cache by its source filters.

**Tech Stack:** Native ES modules, localStorage, Vitest/jsdom, Playwright/Chromium, Manifest V3.

**Spec:** `docs/superpowers/specs/2026-10-05-unified-posts-and-today-design.md`

## Global Constraints

- Hacker News is the only Posts source; no new dependencies or paid service.
- Posts cache lasts 15 minutes; an aggregate Today cache cannot extend it.
- Today permits 1–12 cards total and 0–4 per lane; the factory mix includes 2 Posts.
- Preserve favorites, comments, notes, snapshots, and safe article links.
- Existing card styling and accessible drawer/filter controls remain the UI pattern.
- No Chrome Web Store publication or remote push.

### Task 1: Unified filter schema and durable migration

**Files:** `src/workbenches.js`, `src/settings.js`, `tests/settings.test.js`, `tests/settings-ui.test.js`, `tests/backup.test.js`.

**Interfaces:** `normalizeWorkbenchFilters('posts', values)` returns `{ time, topic, minPoints, minComments }` with string-valued controls. `normalizeTodayMix(value)` adds missing Posts without exceeding the 12-card limit.

- [x] Add regression tests for migration and the new factory mix:
  ```js
  expect(normalizeSettings({ filters: { posts: { rank: 'top', time: 'month', topic: 'rag' } } }).filters.posts)
    .toEqual({ time: 'month', topic: 'rag', minPoints: '0', minComments: '0' });
  expect(normalizePreferences({ todayMix: { code: 4, models: 4, datasets: 0, papers: 4 } }).todayMix.posts).toBe(0);
  ```
- [x] Run `npm test -- tests/settings.test.js tests/backup.test.js` and confirm new assertions fail before implementing.
- [x] Replace rank controls with time/topic/minimum-points/minimum-comments selects; add `POSTS_CACHE_TTL = 15 * 60 * 1000`. Increment settings version to 4. Add `posts: 2` to factory Today mix and clamp only newly added legacy Posts to remaining capacity.
- [x] Test explicit zero Posts, malformed new fields, migration near 12 cards, and backup round-trip with a saved Post/article link.
- [x] Run the settings and backup tests, then commit the schema/migration change together with dependent UI updates in Task 3.

### Task 2: Broader retrieval, relevance, cache, and Today composition

**Files:** `src/services/query.js`, `src/services/normalizers.js`, `src/services/feeds.js`, `src/services/startup.js`, `tests/query.test.js`, `tests/normalizers.test.js`, `tests/feeds.test.js`, `tests/startup.test.js`.

**Interfaces:** `buildPostsUrl(filters, now, { order, page })` builds an empty-query story request with time and engagement thresholds; `order` is `points` or `recent`. `fetchSection('posts', filters, options)` returns one normalized age-ranked list and status. `composeTodayCards(lanes, mix, userState)` accepts `lanes.posts`.

- [x] Replace obsolete rank-query tests with numeric-filter and pagination assertions:
  ```js
  const url = new URL(buildPostsUrl({ time: 'day', minPoints: '20', minComments: '5' }, now));
  expect(url.searchParams.get('numericFilters')).toBe(`created_at_i>${seconds - 86400},points>=20,num_comments>=5`);
  expect(url.searchParams.has('query')).toBe(false);
  ```
- [x] Add tests for page-two candidates, deduplication across both pools, thresholds, deterministic ranking, ambiguous relevance, 15-minute expiry, and Today filter-sensitive caches. Run the focused suites to validate these cases.
- [x] Fetch up to 1,000 high-scoring and 1,000 recent candidates in 200-item pages, stopping when pagination ends. Freeze `now` for each fetch. Deduplicate IDs and normalize/filter using that clock. Sort by hot score, points, publication time, then ID; retain 24 cards. Expose bounded retrieval through status metadata and document it.
- [x] Tighten ambiguous title words, recognize generation phrases and trusted AI domains, and use meaningful topic-specific matching for Posts.
- [x] Add Posts source revision to Posts/Today cache keys. Key Today by current source filters and use a 15-minute aggregate TTL when Posts are enabled. Do not use disabled Posts results in composition or source status. Preserve existing other-lane behavior.
- [x] Run `npm test -- tests/query.test.js tests/normalizers.test.js tests/feeds.test.js tests/startup.test.js`.

### Task 3: Editable defaults and end-to-end behavior

**Files:** `src/ui/settings.js`, `src/app.js`, `tests/settings-ui.test.js`, `tests/e2e/posts-workbench.spec.js`, `tests/e2e/startup-cache.spec.js`, `README.md`, `docs/testing.md`, `scripts/check-live-sources.mjs`.

**Interfaces:** Settings selects use `data-post-default` and update both `filterDefaults.posts` and current Posts filters. Today reloads when affected defaults or lane allocations change.

- [x] Render a labeled Posts section using the workbench control definitions:
  ```js
  WORKBENCHES.posts.controls.map(({ id, label, options }) =>
    // Render a labeled select with data-post-default=id and filterDefaults.posts[id].
    selectPostDefault(id, label, options, filterDefaults.posts[id]));
  ```
- [x] Remove special rank/time visibility logic in `activeWorkbench`. Add `savePostsDefaults` handling; preserve focus after re-render and reload active Posts/Today. Settings factory restores/reset keep their displayed defaults consistent with storage.
- [x] Add Posts stepper label and update the legacy browser startup fixture to supply two Posts and assert eight Today cards/cache reuse.
- [x] Replace Posts browser tests with one-list ranking/filtering, Settings persistence/default restores, Today hidden replacement/zero allocation, favorite/note/Library persistence, backup, outage, and mobile overflow checks. Run using a temporary config on unused port 4189.
- [x] Update README and the live contract script to describe rolling windows, unified ranking, 15-minute Posts cache, editable defaults, and bounded candidate coverage.
- [x] Run `npm run check`, `npm test`, the browser suite, and release packaging smoke test. Inspect desktop/mobile Posts and Settings screenshots. Fix failures, review the final diff, and commit the verified local change.

## Verification results

- Full Vitest suite: 20 files, 147 tests passed. After final relevance adjustments, 24 focused normalizer/feed tests passed again.
- Full Playwright suite: 34 tests passed on port 4189. The final Posts/startup run adds one reset/defaults regression and verifies 9 tests, covering 35 unique browser tests across the two runs.
- Extension structure check passed. Packaged extension smoke test passed; the final package is `dist/scout-lab-1.0.5.zip`.
- Live Posts check rendered 24 cards from 1,890 unique candidates with no page errors. The sample was bounded, as documented. Desktop and mobile feed/settings screenshots inspected in `.superpowers/review/`.
- Implementation uses local branch `codex/unified-posts`; no remote push or Web Store submission.
