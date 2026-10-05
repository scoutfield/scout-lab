import { fetchSection } from './feeds.js';

export const STARTUP_SECTIONS = Object.freeze(['today', 'code', 'models', 'datasets', 'papers', 'posts']);

export const createStartupWarmup = ({
  filters,
  todayMix = { code: 2, models: 1, datasets: 1, papers: 2 },
  userState = {},
  redditCommunities = [],
}, fetcher = fetchSection) => {
  const allFilters = Object.fromEntries(Object.entries(filters)
    .map(([section, values]) => [section, { ...values }]));
  const options = { force: false, allFilters, todayMix: { ...todayMix }, userState: { ...userState }, redditCommunities: [...redditCommunities] };
  const requests = Object.fromEntries(STARTUP_SECTIONS.map((section) => [
    section,
    fetcher(section, { ...allFilters[section] }, options),
  ]));
  const settled = Promise.all(STARTUP_SECTIONS.map(async (section) => {
    try {
      return { section, status: 'fulfilled', value: await requests[section] };
    } catch (reason) {
      return { section, status: 'rejected', reason };
    }
  }));

  return { requests, settled };
};
