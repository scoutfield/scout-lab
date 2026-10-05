import {
  createDefaultFilters,
  normalizeRedditCommunities,
  normalizeWorkbenchFilters,
  REDDIT_COMMUNITIES,
  SECTION_ORDER,
} from './workbenches.js';

export const SETTINGS_VERSION = 3;
export const TODAY_LANES = ['code', 'models', 'datasets', 'papers'];

const THEMES = new Set(['system', 'light', 'dark']);
const TEXT_SIZES = new Set(['standard', 'large']);
const DENSITIES = new Set(['comfortable', 'compact']);
const STARTUP_SECTIONS = new Set(['last-used', ...SECTION_ORDER]);
const LINK_BEHAVIORS = new Set(['foreground', 'background']);

const DEFAULT_TODAY_MIX = Object.freeze({
  code: 2,
  models: 1,
  datasets: 1,
  papers: 2,
});

export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system',
  textSize: 'large',
  density: 'comfortable',
  startupSection: 'last-used',
  openLinks: 'foreground',
  todayMix: DEFAULT_TODAY_MIX,
  redditCommunities: Object.freeze([...REDDIT_COMMUNITIES]),
});

const normalizeFilterMap = (stored = {}, legacyTopic = 'all') => {
  const defaults = createDefaultFilters();
  return Object.fromEntries(SECTION_ORDER.map((id) => {
    const legacy = Object.hasOwn(defaults[id], 'topic') ? { topic: legacyTopic } : {};
    return [id, normalizeWorkbenchFilters(id, { ...defaults[id], ...legacy, ...(stored?.[id] || {}) })];
  }));
};

export const isValidTodayMix = (mix) => {
  if (!mix || typeof mix !== 'object') return false;
  const values = TODAY_LANES.map((lane) => mix[lane]);
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 4)) return false;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total >= 1 && total <= 12;
};

export const normalizeTodayMix = (value) => {
  const candidate = Object.fromEntries(TODAY_LANES.map((lane) => [
    lane,
    Number.isInteger(value?.[lane]) ? value[lane] : DEFAULT_TODAY_MIX[lane],
  ]));
  return isValidTodayMix(candidate) ? candidate : { ...DEFAULT_TODAY_MIX };
};

export const normalizePreferences = (value = {}) => ({
  theme: THEMES.has(value?.theme) ? value.theme : DEFAULT_PREFERENCES.theme,
  textSize: TEXT_SIZES.has(value?.textSize) ? value.textSize : DEFAULT_PREFERENCES.textSize,
  density: DENSITIES.has(value?.density) ? value.density : DEFAULT_PREFERENCES.density,
  startupSection: STARTUP_SECTIONS.has(value?.startupSection)
    ? value.startupSection
    : DEFAULT_PREFERENCES.startupSection,
  openLinks: LINK_BEHAVIORS.has(value?.openLinks) ? value.openLinks : DEFAULT_PREFERENCES.openLinks,
  todayMix: normalizeTodayMix(value?.todayMix),
  redditCommunities: normalizeRedditCommunities(value?.redditCommunities),
});

export const normalizeSettings = (stored = {}) => ({
  version: SETTINGS_VERSION,
  selectedSection: SECTION_ORDER.includes(stored?.selectedSection) ? stored.selectedSection : 'today',
  filters: normalizeFilterMap(stored?.filters, stored?.selectedTopic || 'all'),
  filterDefaults: normalizeFilterMap(stored?.filterDefaults),
  preferences: normalizePreferences(stored?.preferences),
});

export const resolveStartupSection = (settings) => (
  settings.preferences.startupSection === 'last-used'
    ? settings.selectedSection
    : settings.preferences.startupSection
);

export const createDefaultPreferences = () => ({
  ...DEFAULT_PREFERENCES,
  todayMix: { ...DEFAULT_PREFERENCES.todayMix },
  redditCommunities: [...DEFAULT_PREFERENCES.redditCommunities],
});
