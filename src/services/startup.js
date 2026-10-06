import { fetchSection } from './feeds.js';
import { DEFAULT_TODAY_MIX } from '../settings.js';

export const STARTUP_SECTIONS = Object.freeze(['today', 'code', 'models', 'datasets', 'papers', 'posts']);

export const createStartupWarmup = ({
  filters,
  todayMix = DEFAULT_TODAY_MIX,
  userState = {},
}, fetcher = fetchSection) => {
  const allFilters = Object.fromEntries(Object.entries(filters)
    .map(([section, values]) => [section, { ...values }]));
  const options = { force: false, allFilters, todayMix: { ...todayMix }, userState: { ...userState } };
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
