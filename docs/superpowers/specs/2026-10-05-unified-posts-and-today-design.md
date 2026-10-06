# Unified Posts feed, customization, and Today

Date: 2026-10-05
Status: Design approved in chat; written specification ready for review.

## Goal

Replace the separate Hot, Trending, and Top views with one age-adjusted Posts feed, make its filters customizable through Settings, and include Posts in Today.

## Posts experience

- Keep Hacker News as the only source.
- Remove the Hot, Trending, and Top controls and the special logic that hides the time filter.
- Rank all eligible posts by points with age decay using the existing `postHotScore` formula. Resolve equal scores by points, then publication time, then item ID for deterministic results.
- Keep one flat card grid using the existing card layout, discussion link, article link, favorite, note, and hide actions.
- Always expose time range and AI topic filters. Use explicit rolling-window labels: Past 24 hours, Past 7 days, Past 30 days.
- Add Minimum points choices of Any, 5, 20, 50, and 100 and Minimum comments choices of Any, 5, 20, and 50.
- Factory defaults: Past 7 days, All topics, Any points, Any comments.
- Keep the existing visible-card search.

## Retrieval, relevance, and freshness

- Retrieve a broader candidate pool before local AI filtering and ranking; do not rely on the first 100 relevance-ranked keyword-search hits.
- Deduplicate Hacker News item IDs before display and retain the existing maximum of 24 visible cards.
- Apply the chosen time and engagement thresholds to candidates before ranking. Time uses rolling elapsed durations, not calendar boundaries.
- Require AI context for ambiguous words such as agents and transformers, and recognize product-generation phrases such as text-to-video and image generation. Relevance remains an explicit heuristic; do not introduce a paid classifier or external generation service.
- Cache Posts for 15 minutes. Today must not retain Posts for longer through its aggregate cache.
- Include relevant Posts filters in Today's cache identity so filter changes cannot reuse an incompatible Today queue.
- Retain safe stale-cache behavior when the source fails. If no cache exists, retain the clearly labeled Hacker News fallback. Valid empty results stay distinct from failures.

## Settings

- Add a Posts section with editable defaults for time range, AI topic, minimum points, and minimum comments.
- Use existing saved `filterDefaults.posts` storage rather than maintaining a duplicate preferences schema.
- Saving a Posts default also applies it to the current Posts filters, allowing the active Posts or Today view to reflect the change immediately.
- Existing Save defaults and Restore defaults controls continue to work. Settings' factory restore must keep the editable controls and their displayed values consistent with storage.
- Preserve the existing drawer styling, accessible labels, focus handling, and local save behavior.

## Today

- Add Posts to the existing Today lanes and its Settings stepper.
- Default to 2 Posts, producing an 8-card factory queue. Users may choose 0–4 Posts within the existing 1–12-card total limit.
- Use the current normalized Posts filters, including Settings changes, as other Today sources already use their current filters.
- Filter hidden Posts before taking the configured number so another eligible post can replace a hidden one.
- Report Posts shortages using the existing Today shortfall mechanism; do not silently replace them with a different content type.
- Include Posts source status in Today's combined source status and snapshots.
- A zero Posts allocation contributes no Posts cards or Posts source failure to Today.

## Migration and durable data

- Drop the obsolete Posts rank field while preserving valid time and topic preferences in both current filters and saved defaults.
- Fill absent engagement filters with factory values.
- Add 2 Posts to legacy Today mixes when the resulting total fits within 12; if the legacy queue already uses the available capacity, add only the remaining capacity, including 0 for an already-full queue.
- Preserve existing per-lane counts, explicit new Posts counts, favorites, annotations, notes, snapshots, and source article links.
- Backup export/import round-trips the new filters and Today mix. Old backups normalize through the same migration rules.
- Reset preferences restores new factory defaults without deleting durable learning data.

## Architecture

- `workbenches.js`: Posts control schema, defaults, labels, and 15-minute TTL.
- `settings.js`: normalized settings version and Today mix migration.
- `services/query.js` and `services/normalizers.js`: candidate request construction, relevance checks, normalized engagement and rank information.
- `services/feeds.js`: paginated/bounded retrieval, deduplication, filtering/ranking, Today composition, and cache identity/freshness.
- `ui/settings.js` and `app.js`: editable Posts defaults and consistent current-view updates.
- `services/startup.js`: matching Today defaults and request sharing during warmup.
- Existing Library, snapshots, and backup mechanisms retain their established durable-data boundaries.

## Validation

- Unit tests for unified request filters, age-adjusted ordering, candidate coverage beyond the first page, deduplication, AI relevance, engagement thresholds, empty results, outage behavior, and Posts cache expiry.
- Settings tests for migration of old rank/time/topic fields, old Today mixes near the total limit, explicit zero Posts allocations, saved defaults, factory restores, and backup round-trips.
- Feed integration tests for Today Posts inclusion, hidden replacements, zero allocations, shortfalls, filter-sensitive cache identity, and freshness.
- Browser tests for removing the three mode buttons, applying each filter, changing and persisting Posts defaults in Settings, including Posts in Today, favorite/note preservation, and fallback rendering.
- Run extension checks and the relevant automated suites. Run browser checks on an unused port because another local application occupies port 4173.

## Scope boundaries

No Reddit integration, new remote service, dependency addition, or Chrome Web Store publication. This change uses the current local Scout Lab code and its existing UI patterns.
