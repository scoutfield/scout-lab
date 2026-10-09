# Scout Lab Chrome Web Store Listing

## Product Details

- Name: Scout Lab
- Category: Developer Tools
- Language: English
- Summary: A focused AI discovery workspace for every new tab.
- Homepage: https://github.com/scoutfield/scout-lab
- Support: https://github.com/scoutfield/scout-lab/issues
- Privacy: https://scoutfield.github.io/scout-lab/privacy.html

## Description

Scout Lab turns every new tab into a calm AI discovery workspace. Scan current open-source code, models, datasets, research, and community posts without juggling separate feeds.

Features:

- A configurable Today queue with up to 40 cards across all sources
- GitHub Trending repositories with time, spoken-language, programming-language, and topic filters
- Hugging Face model and dataset discovery with source-specific filters and sorting
- Hugging Face Daily Papers and raw arXiv research
- One scrollable Posts feed with Hacker News and optional Reddit discussions, plus time, topic, points, and comments filters
- Custom subreddit selection and optional Bright Data connection for Reddit
- A local Library for favorites and personal notes
- Comfortable and compact layouts with light, dark, and system themes
- Local backup and optional archive export to a folder you choose

Installing Scout Lab replaces Chrome's default new-tab page. Scout Lab has no account, advertising, analytics, or developer-operated server. Personal notes and preferences stay on your device.

## Privacy Practices

Single purpose:

> Replace Chrome's new-tab page with a focused workspace for discovering AI code, models, datasets, and research papers.

Remote code: No.

User data collection by publisher: No.

Permission justifications:

- `https://github.com/*`: Retrieves the public GitHub Trending page displayed in the Code workbench.
- `https://huggingface.co/*`: Retrieves public model, dataset, and Daily Papers metadata displayed in Scout Lab.
- `https://export.arxiv.org/*`: Retrieves public arXiv Atom data displayed in the Papers workbench.
- `https://hn.algolia.com/*`: Retrieves public Hacker News AI posts displayed in the Posts workbench.

- `https://www.reddit.com/*`: Retrieves public discussions from selected subreddits.
- `https://api.brightdata.com/*`: Collects public Reddit posts using the user-configured Bright Data token.

Certifications:

- Data is not sold or transferred for unrelated purposes.
- Data is not used for advertising, creditworthiness, or lending.
- Scout Lab complies with the Chrome Web Store User Data Policy and Limited Use requirements.

## Distribution

- Visibility: Public
- Regions: All supported regions
- Pricing: Free
- Publish automatically after review: Yes

## Assets

- Store icon: `assets/icons/icon-128.png`
- Today screenshot: `store/assets/screenshot-today-dark.png`
- Code screenshot: `store/assets/screenshot-code-trending.png`
- Models screenshot: `store/assets/screenshot-models-discovery.png`
- Small promotional tile: `store/assets/promo-small.png`
