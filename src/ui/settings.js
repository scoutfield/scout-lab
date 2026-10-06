import { TODAY_LANES } from '../settings.js';
import { escapeHtml } from './render.js';
import { SECTION_ORDER, WORKBENCHES } from '../workbenches.js';

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const TEXT_SIZE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'large', label: 'Large' },
];

const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

const LINK_OPTIONS = [
  { value: 'foreground', label: 'Foreground tab' },
  { value: 'background', label: 'Background tab' },
];

const STARTUP_OPTIONS = [
  { value: 'last-used', label: 'Last used' },
  ...SECTION_ORDER.map((id) => ({ value: id, label: WORKBENCHES[id].label })),
];

const LANE_LABELS = {
  code: 'Code',
  models: 'Models',
  datasets: 'Datasets',
  papers: 'Papers',
  posts: 'Posts',
};

const segment = (setting, label, options, value) => `
  <div class="settings-field">
    <span class="settings-label">${escapeHtml(label)}</span>
    <div class="settings-segment" role="group" aria-label="${escapeHtml(label)}">
      ${options.map((option) => `
        <button type="button" data-setting="${setting}" data-value="${option.value}" aria-pressed="${option.value === value}" class="${option.value === value ? 'selected' : ''}">${escapeHtml(option.label)}</button>
      `).join('')}
    </div>
  </div>
`;

const select = (setting, label, options, value) => `
  <label class="settings-field">
    <span class="settings-label">${escapeHtml(label)}</span>
    <select data-setting="${setting}">
      ${options.map((option) => `<option value="${option.value}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
    </select>
  </label>
`;

const filterSummary = (section, filters) => {
  const workbench = WORKBENCHES[section];
  return workbench.controls.map((control) => {
    const selected = control.options.find(({ value }) => value === filters[control.id]);
    return selected?.label || filters[control.id];
  }).filter(Boolean).join(' / ');
};

const selectPostDefault = ({ id, label, options }, value) => `
  <label class="settings-field">
    <span class="settings-label">${escapeHtml(label)}</span>
    <select data-post-default="${escapeHtml(id)}" aria-label="Default Posts ${escapeHtml(label.toLowerCase())}">
      ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
    </select>
  </label>
`;

const importReviewHtml = (review) => review ? `
  <div class="import-review" data-import-review>
    <strong>${escapeHtml(review.fileName)}</strong>
    <p>${review.summary.annotations} annotations, ${review.summary.notes} notes, and ${review.summary.snapshots} snapshots.</p>
    <div class="settings-actions">
      <button type="button" class="settings-primary" data-command="confirm-import">Import backup</button>
      <button type="button" class="settings-secondary" data-command="cancel-import">Cancel</button>
    </div>
  </div>
` : '';

const resetReviewHtml = (confirmReset) => confirmReset ? `
  <div class="import-review" data-reset-review>
    <strong>Reset preferences?</strong>
    <p>Appearance, startup, Today mix, and saved filter defaults return to factory values. Favorites, comments, notes, snapshots, and the iCloud folder stay untouched.</p>
    <div class="settings-actions">
      <button type="button" class="settings-danger" data-command="confirm-reset-preferences">Reset preferences</button>
      <button type="button" class="settings-secondary" data-command="cancel-reset-preferences">Cancel</button>
    </div>
  </div>
` : '';

export const renderSettingsDrawer = ({
  settings,
  open,
  importReview = null,
  confirmReset = false,
  error = '',
  notice = '',
}) => {
  if (!open) return '';
  const { preferences, filterDefaults } = settings;
  const total = TODAY_LANES.reduce((sum, lane) => sum + preferences.todayMix[lane], 0);

  return `
    <div class="settings-layer" data-settings-layer>
      <button type="button" class="settings-backdrop" data-command="close-settings" aria-label="Close settings"></button>
      <aside class="settings-drawer" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1">
        <header class="settings-header">
          <div><span class="kicker">Scout Lab</span><h2>Settings</h2></div>
          <button type="button" class="drawer-close" data-command="close-settings" aria-label="Close settings" title="Close settings">&times;</button>
        </header>
        <div class="settings-body">
          ${error ? `<div class="settings-message error" role="alert">${escapeHtml(error)}</div>` : ''}
          ${notice ? `<div class="settings-message" role="status">${escapeHtml(notice)}</div>` : ''}

          <section class="settings-section" aria-labelledby="appearance-heading">
            <h3 id="appearance-heading">Appearance</h3>
            ${segment('theme', 'Theme', THEME_OPTIONS, preferences.theme)}
            ${segment('textSize', 'Text size', TEXT_SIZE_OPTIONS, preferences.textSize)}
            ${segment('density', 'Density', DENSITY_OPTIONS, preferences.density)}
          </section>

          <section class="settings-section" aria-labelledby="opening-heading">
            <h3 id="opening-heading">Opening and startup</h3>
            ${select('startupSection', 'Start on', STARTUP_OPTIONS, preferences.startupSection)}
            ${segment('openLinks', 'Open links', LINK_OPTIONS, preferences.openLinks)}
          </section>

          <section class="settings-section" aria-labelledby="today-heading">
            <div class="settings-section-heading"><h3 id="today-heading">Today queue</h3><span>${total} cards</span></div>
            <div class="today-mix">
              ${TODAY_LANES.map((lane) => `
                <div class="today-lane" data-today-lane="${lane}">
                  <span>${LANE_LABELS[lane]}</span>
                  <div class="stepper" role="group" aria-label="${LANE_LABELS[lane]} cards">
                    <button type="button" data-setting="todayMix" data-lane="${lane}" data-step="-1" aria-label="Remove one ${LANE_LABELS[lane]} card">&minus;</button>
                    <output aria-live="polite">${preferences.todayMix[lane]}</output>
                    <button type="button" data-setting="todayMix" data-lane="${lane}" data-step="1" aria-label="Add one ${LANE_LABELS[lane]} card">+</button>
                  </div>
                </div>
              `).join('')}
            </div>
            <p class="settings-help">Choose 1-40 cards total, with up to 8 from each source.</p>
          </section>

          <section class="settings-section" aria-labelledby="posts-settings-heading">
            <h3 id="posts-settings-heading">Posts</h3>
            <p class="settings-help">Defaults for the Posts feed and its cards in Today.</p>
            <label class="settings-field">
              <span class="settings-label">Subreddits</span>
              <textarea data-reddit-communities aria-label="Subreddits" rows="3">${escapeHtml(preferences.redditCommunities.join(', '))}</textarea>
            </label>
            <p class="settings-help">Up to 20 names, separated by commas or new lines. Leave empty to restore defaults.</p>
            <button type="button" class="settings-secondary" data-command="save-subreddits">Save subreddits</button>
            ${WORKBENCHES.posts.controls.map((control) => selectPostDefault(control, filterDefaults.posts[control.id])).join('')}
          </section>

          <section class="settings-section" aria-labelledby="defaults-heading">
            <h3 id="defaults-heading">Workbench defaults</h3>
            <div class="default-list">
              ${SECTION_ORDER.map((section) => `
                <div class="default-row">
                  <div><strong>${WORKBENCHES[section].label}</strong><span>${escapeHtml(filterSummary(section, filterDefaults[section]))}</span></div>
                  <button type="button" class="icon-text-button" data-restore-workbench="${section}" title="Restore ${WORKBENCHES[section].label} factory default">Restore</button>
                </div>
              `).join('')}
            </div>
            <button type="button" class="settings-secondary wide" data-command="restore-all-filter-defaults">Restore all factory defaults</button>
          </section>

          <section class="settings-section" aria-labelledby="data-heading">
            <h3 id="data-heading">Data and reset</h3>
            <div class="settings-actions">
              <button type="button" class="settings-secondary" data-command="export-backup">Export backup</button>
              <button type="button" class="settings-secondary" data-command="choose-import">Import backup</button>
              <input type="file" accept="application/json,.json" data-import-file hidden>
            </div>
            ${importReviewHtml(importReview)}
            ${resetReviewHtml(confirmReset)}
            <button type="button" class="settings-link danger" data-command="request-reset-preferences">Reset preferences</button>
          </section>
        </div>
      </aside>
    </div>
  `;
};
