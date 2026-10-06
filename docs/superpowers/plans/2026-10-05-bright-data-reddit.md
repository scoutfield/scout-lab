# Bright Data Reddit integration

Approved direction: use the registered Bright Data account and recurring free allowance to populate the existing flat Posts list and Today.

1. Add a dedicated service for the local API token, async Reddit discovery, snapshot polling, safe normalization, daily raw cache and local usage reservations. Keep credentials out of backups. Use documented dataset gd_lvz8ah06191smkebj4 and subreddit discovery with Hot sorting. Bound total requested records to 140/day and 4,500/month, adjusting per-subreddit allocation for custom lists; never let Refresh override this. Serialize requests across new tabs. Never promise protection from other account usage; user must keep account unfunded for provider hard-stop.
2. Add Connect/disconnect password field and collection status in Posts settings. Route Reddit through Bright Data, keep working HN results on missing credentials/failure, and poll pending jobs while the selected feed is open. Preserve source filters and Today cache identity.
3. Verify payload limits, polling/resume, daily reuse/filter changes/Refresh, monthly cap, source failures, normalization, cross-tab behavior, token exclusion from backup and settings browser flow. Run existing suites and package checks.
4. Update the existing local Chrome extension with a recoverable runtime backup. Leave Settings open for the user to enter the API token locally. Live account verification depends on the token.
