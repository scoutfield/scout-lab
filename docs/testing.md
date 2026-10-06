# Testing Scout Lab

Tests are part of the repository and are release gates. Product behavior must not rely on a test checklist that exists only in a chat or a local browser session.

## Automated Test Map

| Area | Test file |
| --- | --- |
| Daily snapshots and restore behavior | `tests/archive.test.js` |
| Markdown archive output and escaping | `tests/archiveFormat.test.js` |
| Backup validation, export, and atomic import | `tests/backup.test.js` |
| One-time development schema reset | `tests/dataReset.test.js` |
| Source requests, failure behavior, and cache use | `tests/feeds.test.js` |
| Fixed-target local GitHub Trending, Hugging Face datasets, and arXiv proxy validation | `tests/devServer.test.js` |
| Real-browser Code parity and failure states | `tests/e2e/code-results.spec.js` |
| Real-browser Models sorting, filters, grouping, links, actions, and mobile layout | `tests/e2e/models-workbench.spec.js` |
| Real-browser Datasets and Papers source flows plus removed-workbench assertions | `tests/e2e/discovery-workbenches.spec.js` |
| Today configurable composition including Posts, without topic/filter chrome | `tests/feeds.test.js`, `tests/ui.test.js`, `tests/e2e/reading-comfort.spec.js` |
| Reading typography, density, themes, and responsive grid | `tests/e2e/reading-comfort.spec.js` |
| Foreground and background link opening | `tests/linkOpening.test.js` |
| GitHub, Hugging Face, and arXiv normalization | `tests/normalizers.test.js` |
| Query construction and cache keys | `tests/query.test.js` |
| Settings drawer rendering and interaction | `tests/settings-ui.test.js` |
| Settings validation, migration, and defaults | `tests/settings.test.js` |
| Local persistence and immutable state updates | `tests/storage.test.js` |
| Shared cards, controls, and workbench rendering | `tests/ui.test.js` |
| Library membership, filtering, sorting, snapshot migration, and backup safety | `tests/library.test.js`, `tests/storage.test.js`, `tests/backup.test.js` |
| Real-browser Library add, hide, filter, search, reload, and removal workflow | `tests/e2e/library.spec.js` |

Deterministic source fixtures live in `tests/fixtures/`. They keep parser behavior testable when an upstream site is unavailable or changes unexpectedly.

## Browser Acceptance

The reproducible manual browser cases are tracked in [`tests/acceptance/browser-matrix.md`](../tests/acceptance/browser-matrix.md). They cover every workbench, interactive control, destination link, persistence path, responsive viewport, theme, density, backup flow, and failure state required for daily use.

Browser acceptance is intentionally separate from deterministic unit and integration tests. A result is recorded only after running the unpacked extension or the local extension preview in a real browser and inspecting navigation, layout, console output, and persistence.

## Continuous Integration

`quality.yml` runs on every push and pull request. It verifies the extension structure, executes the deterministic suite with coverage, enforces the configured 80% coverage thresholds, and rejects high-severity dependency vulnerabilities.

The same workflow runs the Playwright browser regression suite against the real local page. Its Code tests verify exact Trending order and metrics, English and Chinese filtering, legacy Search-cache rejection, and the no-fallback unavailable state without relying on live network availability. Models tests verify all seven Hugging Face sort mappings, all 52 model-visible tasks and their exact API values, modality grouping, primary and advanced filters, source metadata, family grouping, base and variant links, saved defaults, reset, search, card actions, and mobile overflow. Library tests verify automatic membership, hidden-item review, local-only loading, filtering, search, reload persistence, and removal when the last qualifying annotation is cleared. Reading-comfort tests measure desktop, medium, and mobile column counts; minimum card font sizes; summary line height and clamp; Comfortable versus Compact density; overflow; and low-glare light/dark surfaces.

`live-sources.yml` runs daily and on demand. It performs bounded read-only checks against GitHub, Hugging Face, arXiv, and the Hacker News Algolia API. GitHub checks cover daily, weekly, and monthly Trending HTML plus English and Chinese spoken-language variants. Dataset checks cover all nine source sorts, including structured page parsing for the two row-count sorts. No token or repository secret is required. Keeping it separate prevents temporary source downtime or rate limiting from blocking deterministic pull-request validation.

## Local Release Gate

Run these commands before committing:

```bash
npm ci
npm run check
npm run test:coverage
npm run test:e2e
npm run test:live
npm audit --audit-level=high
```

Then complete the browser acceptance matrix for behavior that changed.

## Maintenance Rule

Every behavior change must update or add the nearest automated test. Changes to controls, navigation, persistence, responsive layout, themes, source contracts, or user workflows must also update the browser acceptance matrix. Pull requests record both obligations explicitly in `.github/pull_request_template.md`, and CI reports deterministic-check or coverage-gate failures immediately.

## Unified Posts regression coverage

- `tests/posts.test.js`: paginated candidate coverage, deduplication, age-adjusted ranking, thresholds, bounded sampling, outages, 15-minute cache expiry, and Today source-cache lifetime.
- `tests/settings.test.js` and `tests/backup.test.js`: legacy rank migration, saved Posts filters, safe full-queue migration, explicit zero allocation, and durable backup round-trips.
- `tests/e2e/posts-workbench.spec.js`: unified controls, editable defaults, persistence/restores, Today hidden replacements and disabled lane, Library notes/article links, mobile overflow, and outage rendering.
- `tests/e2e/startup-cache.spec.js`: eight-card default Today composition, shared Posts fetches, and cache reuse across tabs.

Browser checks require an unused port. The default Playwright configuration can reuse another application's server on 4173; use a temporary config with a dedicated port when that port is occupied.
