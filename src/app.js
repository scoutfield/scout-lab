import { connectArchiveFolder, getArchiveStatus, writeDailyArchive } from './services/archive.js';
import { buildDailyArchive } from './services/archiveFormat.js';
import {
  backupFileName,
  createBackup,
  mergeBackupData,
  parseBackup,
  summarizeBackup,
} from './services/backup.js?v=1.0.5';
import {
  DESCRIPTION_REVISION,
  fetchSection,
  GITHUB_TRENDING_SOURCE_REVISION,
} from './services/feeds.js?v=1.0.5';
import { openInBackground, shouldOpenInBackground } from './services/linkOpening.js?v=1.0.5';
import { ensureCurrentDataSchema } from './services/dataReset.js?v=1.0.5';
import {
  applyDurableData,
  getDurableData,
  getDailyNote,
  getSettings,
  getSnapshot,
  getUserState,
  hydrateLibraryAnnotations,
  resetPreferences,
  restoreAllFactoryFilterDefaults,
  restoreFactoryFilterDefaults,
  restoreWorkbenchFilterDefaults,
  setDailyNote,
  setFilterDefaults,
  setPreferences,
  setSettings,
  setSnapshot,
  setUserItemState,
  setWorkbenchFilters,
} from './services/storage.js?v=1.0.5';
import { getLibraryCards } from './services/library.js?v=1.0.5';
import { createStartupWarmup } from './services/startup.js?v=1.0.5';
import { isValidTodayMix, resolveStartupSection } from './settings.js?v=1.0.5';
import {
  escapeHtml,
  renderCard,
  renderEmptyState,
  renderFilters,
  renderLibraryEmptyState,
  renderSourceLink,
  renderSourceUnavailable,
  updateSearchResults,
} from './ui/render.js?v=1.0.5';
import { renderSettingsDrawer } from './ui/settings.js?v=1.0.5';
import { getWorkbench, SECTION_ORDER, TOPICS, WORKBENCHES } from './workbenches.js';

const todayKey = () => new Date().toISOString().slice(0, 10);
const app = document.querySelector('#app');
try {
  await ensureCurrentDataSchema();
} catch (error) {
  app.innerHTML = '<main class="fatal-state"><h1>Scout Lab could not reset its development data.</h1><p>Close other Scout Lab tabs and reload.</p></main>';
  throw error;
}
const initialSettings = getSettings();
const initialUserState = hydrateLibraryAnnotations();

const systemTheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

const applyAppearance = (preferences) => {
  const resolvedTheme = preferences.theme === 'system'
    ? (systemTheme?.matches ? 'dark' : 'light')
    : preferences.theme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themeChoice = preferences.theme;
  document.documentElement.dataset.textSize = preferences.textSize;
  document.documentElement.dataset.density = preferences.density;
  document.documentElement.style.colorScheme = resolvedTheme;
};

applyAppearance(initialSettings.preferences);

let state = {
  selectedSection: resolveStartupSection(initialSettings),
  filters: initialSettings.filters,
  settings: initialSettings,
  cards: [],
  userState: initialUserState,
  archive: { connected: false, name: '' },
  loading: true,
  status: { label: 'Loading sources', stale: false },
  search: '',
  commentingId: null,
  notice: '',
  settingsOpen: false,
  settingsError: '',
  settingsNotice: '',
  importReview: null,
  pendingImport: null,
  confirmReset: false,
  requestId: 0,
};

const setState = (patch) => {
  state = { ...state, ...patch };
  return state;
};

const activeWorkbench = () => {
  const workbench = getWorkbench(state.selectedSection);
  if (workbench.id === 'posts') {
    // Hot reads the live front page and Trending the last 24 hours; only Top uses a range.
    return state.filters.posts.rank === 'top'
      ? workbench
      : { ...workbench, controls: workbench.controls.filter(({ id }) => id !== 'time') };
  }
  if (workbench.id !== 'papers') return workbench;

  const filters = state.filters.papers;
  const controls = workbench.controls.map((control) => {
    if (control.id === 'sort') {
      const options = filters.source === 'arxiv'
        ? control.options.filter(({ value }) => ['newest', 'relevance'].includes(value))
        : control.options.filter(({ value }) => ['trending', 'recent'].includes(value));
      return { ...control, options };
    }
    if (control.id === 'topic') {
      return {
        ...control,
        options: filters.source === 'arxiv'
          ? control.options
          : TOPICS,
      };
    }
    return control;
  });
  return { ...workbench, controls };
};

const applyUserState = (cards) => cards
  .map((card) => ({ ...card, user: state.userState[card.id] || {} }))
  .filter((card) => state.selectedSection === 'library' || !card.user.hidden);

const visibleCards = () => {
  const cards = applyUserState(state.cards);
  const query = state.search.trim().toLowerCase();
  if (!query) return cards;
  return cards.filter((card) => `${card.title} ${card.summary} ${(card.tags || []).join(' ')} ${card.owner || ''} ${state.userState[card.id]?.comment || ''}`
    .toLowerCase().includes(query));
};

const navHtml = () => SECTION_ORDER.map((id) => {
  const workbench = WORKBENCHES[id];
  const active = state.selectedSection === id;
  return `
    <button type="button" class="${active ? 'active' : ''}" data-section="${id}" aria-current="${active ? 'page' : 'false'}">
      <span class="nav-dot"></span>
      <span>${escapeHtml(workbench.label)}</span>
      <span class="count">${active && !state.loading ? visibleCards().length : ''}</span>
    </button>
  `;
}).join('');

const loadingCardsHtml = () => Array.from({ length: 8 }, (_, index) => `
  <article class="card skeleton-card" aria-hidden="true" data-skeleton="${index}">
    <div class="skeleton short"></div><div class="skeleton title"></div><div class="skeleton body"></div><div class="skeleton body"></div>
  </article>
`).join('');

const archiveLabel = () => state.archive.connected ? state.archive.name : 'Not connected';

const statusMessage = () => {
  if (state.loading && state.cards.length) return `Refreshing ${state.status.label || 'saved results'}`;
  if (state.loading) return `Loading ${activeWorkbench().label.toLowerCase()}`;
  if (state.status.message) return state.status.message;
  if (state.selectedSection === 'code' && state.status.updatedAt) {
    const updatedAt = new Date(state.status.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${state.status.label || 'GitHub Trending'} · Live · Updated ${updatedAt}`;
  }
  return state.status.label || 'Ready';
};

const statusSourceHtml = () => (
  state.selectedSection === 'code' && !state.status.unavailable
    ? renderSourceLink({ url: state.status.sourceUrl, label: 'Open on GitHub' })
    : ''
);

const cardsHtml = (filters, cards) => {
  if (cards.length) {
    return cards.slice(0, 24).map((card) => renderCard(card, {
      user: state.userState,
      commentingId: state.commentingId,
    })).join('');
  }
  if (state.loading) return loadingCardsHtml();
  if (state.selectedSection === 'library'
    && getLibraryCards(state.userState, WORKBENCHES.library.defaults).length === 0) {
    return renderLibraryEmptyState();
  }
  if (state.selectedSection === 'code' && state.status.unavailable) {
    return renderSourceUnavailable({ url: state.status.sourceUrl });
  }
  return renderEmptyState(filters);
};

const visibleCountLabel = (cards) => (
  `${cards.length} visible ${cards.length === 1 ? 'item' : 'items'}${state.status.stale ? ' · cached or fallback' : ''}`
);

const renderSearchView = () => {
  const filters = state.filters[state.selectedSection];
  const cards = visibleCards();

  updateSearchResults(app, {
    gridHtml: cardsHtml(filters, cards),
    countLabel: visibleCountLabel(cards),
    navCount: state.loading ? '' : `${cards.length}`,
  });
};

const render = () => {
  const workbench = activeWorkbench();
  const filters = state.filters[state.selectedSection];
  const cards = visibleCards();
  const note = getDailyNote(todayKey());
  const grid = cardsHtml(filters, cards);

  app.innerHTML = `
    <div class="shell">
      <aside class="rail">
        <div class="brand">
          <img class="mark" src="./assets/icons/icon-48.png" alt="">
          <div><h1>Scout Lab</h1><p>AI discovery new tab</p></div>
        </div>

        <section class="intention">
          <span class="kicker">Today</span>
          <strong>Inspect one signal, save one idea, write one note.</strong>
        </section>

        <nav class="nav" aria-label="Scout Lab sections">${navHtml()}</nav>

        <div class="archive-controls">
          <div class="archive-status"><span>iCloud archive</span><span>${escapeHtml(archiveLabel())}</span></div>
          <button class="ghost-button" type="button" data-command="connect-archive">${state.archive.connected ? 'Reconnect folder' : 'Choose folder'}</button>
          <button class="ghost-button" type="button" data-command="save-today">Save today</button>
          <button class="settings-trigger" type="button" data-command="open-settings" title="Settings"><span aria-hidden="true">&#9881;</span><span>Settings</span></button>
        </div>
      </aside>

      <main class="main">
        <header class="header">
          <div><h2>${escapeHtml(workbench.title)}</h2><p>${escapeHtml(workbench.subtitle)}</p></div>
          <div class="tools">
            <input class="search" value="${escapeHtml(state.search)}" placeholder="Search this tab" aria-label="Search this tab">
            ${state.selectedSection === 'library' ? '' : '<button class="primary" type="button" data-command="refresh">Refresh</button>'}
          </div>
        </header>

        ${workbench.controls.length ? `
          <section class="filters" aria-label="${escapeHtml(workbench.label)} filters">
            ${renderFilters(workbench, filters)}
          </section>
        ` : ''}

        <div class="feed-status" aria-live="polite">
          <span>${escapeHtml(statusMessage())}${statusSourceHtml()}</span>
          <span class="feed-count">${visibleCountLabel(cards)}</span>
        </div>

        ${state.notice ? `<div class="notice" role="status">${escapeHtml(state.notice)}</div>` : ''}

        <section class="grid" aria-label="${escapeHtml(workbench.label)} results">${grid}</section>

        <section class="note-strip">
          <label>
            <span class="sr-only">Daily learning note</span>
            <textarea data-daily-note placeholder="Write one thing you learned or want to try today.">${escapeHtml(note)}</textarea>
          </label>
          <div class="archive-preview">
            <strong>${state.archive.connected ? 'Archive ready' : 'Archive not connected'}</strong><br>
            ${state.archive.connected
              ? `${escapeHtml(state.archive.name)} / ${todayKey().slice(0, 4)} / ${todayKey().slice(5, 7)} / ${todayKey()}.md`
              : 'Choose an iCloud Drive folder to save daily Markdown files.'}<br>
            Includes the queue, filters, favorites, hidden items, comments, and learning progress.
          </div>
        </section>
      </main>
    </div>
    ${renderSettingsDrawer({
      settings: state.settings,
      open: state.settingsOpen,
      importReview: state.importReview,
      confirmReset: state.confirmReset,
      error: state.settingsError,
      notice: state.settingsNotice,
    })}
  `;
  document.body.classList.toggle('settings-open', state.settingsOpen);
};

const snapshotResult = (section, filters, result) => {
  const date = todayKey();
  const current = getSnapshot(date) || { date, sections: {} };
  setSnapshot(date, {
    ...current,
    sections: {
      ...(current.sections || {}),
      [section]: {
        cards: result.cards,
        filters,
        status: result.status,
        savedAt: new Date().toISOString(),
      },
    },
  });
};

const load = async ({ force = false, clear = false, resultPromise = null } = {}) => {
  const requestId = state.requestId + 1;
  const section = state.selectedSection;
  const filters = { ...state.filters[section] };
  setState({ requestId, loading: true, cards: clear ? [] : state.cards, notice: '' });
  render();

  if (section === 'library') {
    const userState = hydrateLibraryAnnotations();
    if (state.requestId !== requestId) return;
    setState({
      cards: getLibraryCards(userState, filters),
      loading: false,
      status: { label: 'Saved Library', stale: false },
      userState,
    });
    render();
    return;
  }

  const result = await (resultPromise || fetchSection(section, filters, {
    force,
    allFilters: state.filters,
    todayMix: state.settings.preferences.todayMix,
    userState: state.userState,
  }));
  if (state.requestId !== requestId) return;

  snapshotResult(section, filters, result);
  setState({
    cards: result.cards,
    loading: false,
    status: result.status,
    userState: getUserState(),
  });
  render();
};

const updateFilters = async (patch) => {
  const section = state.selectedSection;
  const current = state.filters[section];
  let nextPatch = { ...patch };

  if (section === 'papers' && patch.source === 'arxiv') {
    nextPatch = { ...nextPatch, sort: 'newest' };
  }
  if (section === 'papers' && patch.source === 'community') {
    nextPatch = { ...nextPatch, sort: 'trending', topic: ['cs.AI', 'cs.LG'].includes(current.topic) ? 'all' : current.topic };
  }

  const nextFilters = setWorkbenchFilters(section, { ...current, ...nextPatch });
  const allFilters = { ...state.filters, [section]: nextFilters };
  const nextSettings = setSettings({ selectedSection: section, filters: allFilters });
  setState({ settings: nextSettings, filters: allFilters, search: '', commentingId: null });
  await load({ clear: true });
};

const updateItem = (id, patch) => {
  const card = state.cards.find((item) => item.id === id);
  const userState = setUserItemState(id, patch, card);
  setState({
    userState,
    ...(state.selectedSection === 'library'
      ? { cards: getLibraryCards(userState, state.filters.library) }
      : {}),
  });
  render();
};

const archiveData = () => {
  const date = todayKey();
  const snapshot = getSnapshot(date) || { sections: {} };
  const sections = snapshot.sections || {};
  const allCards = Object.values(sections).flatMap((entry) => entry.cards || []);
  const uniqueCards = [...new Map(allCards.map((card) => [card.id, card])).values()];
  return buildDailyArchive({
    date,
    note: getDailyNote(date),
    todayCards: sections.today?.cards || (state.selectedSection === 'today' ? state.cards : []),
    allCards: uniqueCards.length ? uniqueCards : state.cards,
    userState: state.userState,
    filters: state.filters,
    sourceStatus: Object.fromEntries(Object.entries(sections).map(([section, entry]) => [section, entry.status || {}])),
  });
};

const focusAfterRender = (selector) => queueMicrotask(() => app.querySelector(selector)?.focus());

const openSettings = () => {
  setState({
    settingsOpen: true,
    settingsError: '',
    settingsNotice: '',
    importReview: null,
    pendingImport: null,
    confirmReset: false,
  });
  render();
  focusAfterRender('.settings-drawer');
};

const closeSettings = () => {
  setState({
    settingsOpen: false,
    settingsError: '',
    settingsNotice: '',
    importReview: null,
    pendingImport: null,
    confirmReset: false,
  });
  render();
  focusAfterRender('[data-command="open-settings"]');
};

const savePreference = async (patch, focusSelector) => {
  const preferences = setPreferences(patch);
  const nextSettings = getSettings();
  applyAppearance(preferences);
  setState({ settings: nextSettings, filters: nextSettings.filters, settingsError: '', settingsNotice: 'Saved.' });
  render();
  if (state.selectedSection === 'today' && patch.todayMix) await load({ force: true, clear: true });
  focusAfterRender(focusSelector);
};

const downloadBackup = () => {
  const backup = createBackup(getDurableData());
  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = backupFileName();
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const reviewImportFile = async (file) => {
  if (!file) return;
  try {
    const backup = parseBackup(await file.text());
    setState({
      pendingImport: backup,
      importReview: { fileName: file.name, summary: summarizeBackup(backup) },
      settingsError: '',
      settingsNotice: '',
    });
  } catch (error) {
    setState({ pendingImport: null, importReview: null, settingsError: error.message, settingsNotice: '' });
  }
  render();
  focusAfterRender(state.importReview ? '[data-command="confirm-import"]' : '[data-command="choose-import"]');
};

const applyPendingImport = async () => {
  if (!state.pendingImport) return;
  try {
    const merged = mergeBackupData(getDurableData(), state.pendingImport.data);
    applyDurableData(merged);
    hydrateLibraryAnnotations();
    const nextSettings = getSettings();
    applyAppearance(nextSettings.preferences);
    setState({
      settings: nextSettings,
      filters: nextSettings.filters,
      selectedSection: resolveStartupSection(nextSettings),
      userState: getUserState(),
      pendingImport: null,
      importReview: null,
      settingsError: '',
      settingsNotice: 'Backup imported.',
      search: '',
      commentingId: null,
    });
    await load({ force: true, clear: true });
    focusAfterRender('[data-command="choose-import"]');
  } catch (error) {
    setState({ settingsError: error.message, settingsNotice: '' });
    render();
  }
};

const handleCommand = async (command) => {
  if (command === 'refresh') {
    await load({ force: true });
    return;
  }
  if (command === 'reset-filters') {
    const next = restoreWorkbenchFilterDefaults(state.selectedSection);
    const filters = { ...state.filters, [state.selectedSection]: next };
    const nextSettings = setSettings({ filters });
    setState({ settings: nextSettings, filters, search: '', commentingId: null, notice: 'Saved defaults restored.' });
    await load({ clear: true });
    return;
  }
  if (command === 'save-filter-default') {
    setFilterDefaults(state.selectedSection, state.filters[state.selectedSection]);
    setState({ settings: getSettings(), notice: `${activeWorkbench().label} defaults saved.` });
    render();
    return;
  }
  if (command === 'open-settings') {
    openSettings();
    return;
  }
  if (command === 'close-settings') {
    closeSettings();
    return;
  }
  if (command === 'export-backup') {
    try {
      downloadBackup();
      setState({ settingsNotice: 'Backup exported.', settingsError: '' });
    } catch (error) {
      setState({ settingsError: `Backup could not be exported. ${error.message}`, settingsNotice: '' });
    }
    render();
    focusAfterRender('[data-command="export-backup"]');
    return;
  }
  if (command === 'choose-import') {
    app.querySelector('[data-import-file]')?.click();
    return;
  }
  if (command === 'cancel-import') {
    setState({ pendingImport: null, importReview: null, settingsError: '' });
    render();
    focusAfterRender('[data-command="choose-import"]');
    return;
  }
  if (command === 'confirm-import') {
    await applyPendingImport();
    return;
  }
  if (command === 'restore-all-filter-defaults') {
    restoreAllFactoryFilterDefaults();
    setState({ settings: getSettings(), settingsNotice: 'Factory filter defaults restored.', settingsError: '' });
    render();
    focusAfterRender('[data-command="restore-all-filter-defaults"]');
    return;
  }
  if (command === 'request-reset-preferences') {
    setState({ confirmReset: true, settingsError: '', settingsNotice: '' });
    render();
    focusAfterRender('[data-command="confirm-reset-preferences"]');
    return;
  }
  if (command === 'cancel-reset-preferences') {
    setState({ confirmReset: false });
    render();
    focusAfterRender('[data-command="request-reset-preferences"]');
    return;
  }
  if (command === 'confirm-reset-preferences') {
    const nextSettings = resetPreferences();
    applyAppearance(nextSettings.preferences);
    setState({
      settings: nextSettings,
      filters: nextSettings.filters,
      confirmReset: false,
      settingsNotice: 'Preferences reset. Learning data was preserved.',
      settingsError: '',
    });
    render();
    if (state.selectedSection === 'today') await load({ force: true, clear: true });
    focusAfterRender('[data-command="request-reset-preferences"]');
    return;
  }
  if (command === 'connect-archive') {
    try {
      await connectArchiveFolder();
      setState({ archive: await getArchiveStatus(), notice: 'Archive folder connected.' });
    } catch (error) {
      setState({ notice: error.name === 'AbortError' ? 'Folder selection canceled.' : error.message });
    }
    render();
    return;
  }
  if (command === 'save-today') {
    try {
      const path = await writeDailyArchive(todayKey(), archiveData());
      setState({ notice: `Saved ${path}` });
    } catch (error) {
      setState({ notice: error.message });
    }
    render();
  }
};

const onClick = async (event) => {
  const link = event.target.closest('a[data-open-link]');
  if (link && shouldOpenInBackground(event, state.settings.preferences.openLinks)) {
    event.preventDefault();
    await openInBackground(link.href);
    return;
  }

  const preferenceButton = event.target.closest('button[data-setting]');
  if (preferenceButton) {
    const setting = preferenceButton.dataset.setting;
    if (setting === 'todayMix') {
      const lane = preferenceButton.dataset.lane;
      const step = Number(preferenceButton.dataset.step);
      const current = state.settings.preferences.todayMix;
      const todayMix = { ...current, [lane]: current[lane] + step };
      if (!isValidTodayMix(todayMix)) {
        setState({ settingsError: 'Today needs 1-12 cards total, with 0-4 from each source.', settingsNotice: '' });
        render();
        focusAfterRender(`[data-lane="${lane}"][data-step="${step}"]`);
        return;
      }
      await savePreference({ todayMix }, `[data-lane="${lane}"][data-step="${step}"]`);
      return;
    }
    await savePreference(
      { [setting]: preferenceButton.dataset.value },
      `[data-setting="${setting}"][data-value="${preferenceButton.dataset.value}"]`,
    );
    return;
  }

  const restoreWorkbench = event.target.closest('[data-restore-workbench]');
  if (restoreWorkbench) {
    const section = restoreWorkbench.dataset.restoreWorkbench;
    restoreFactoryFilterDefaults(section);
    setState({ settings: getSettings(), settingsNotice: `${getWorkbench(section).label} factory default restored.`, settingsError: '' });
    render();
    focusAfterRender(`[data-restore-workbench="${section}"]`);
    return;
  }

  const sectionButton = event.target.closest('[data-section]');
  if (sectionButton) {
    const selectedSection = sectionButton.dataset.section;
    const nextSettings = setSettings({ selectedSection });
    setState({ settings: nextSettings, selectedSection, search: '', commentingId: null, cards: [], status: { label: 'Loading sources', stale: false } });
    await load({ clear: true });
    return;
  }

  const filterButton = event.target.closest('button[data-filter]');
  if (filterButton) {
    await updateFilters({ [filterButton.dataset.filter]: filterButton.dataset.value });
    return;
  }

  const command = event.target.closest('[data-command]')?.dataset.command;
  if (command) {
    await handleCommand(command);
    return;
  }

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  const container = event.target.closest('[data-id]');
  const id = container?.dataset.id;
  if (!id) return;
  const current = state.userState[id] || {};

  if (action === 'favorite') updateItem(id, { favorite: !current.favorite });
  if (action === 'hide') {
    updateItem(id, { hidden: !current.hidden });
    if (state.selectedSection === 'today') await load({ force: true });
  }
  if (action === 'comment') {
    setState({ commentingId: id });
    render();
    app.querySelector(`[data-id="${CSS.escape(id)}"] [data-comment-draft]`)?.focus();
  }
  if (action === 'save-comment') {
    const comment = container.querySelector('[data-comment-draft]')?.value.trim() || '';
    setState({ commentingId: null });
    updateItem(id, { comment });
  }
  if (action === 'cancel-comment') {
    setState({ commentingId: null });
    render();
  }
};

const onChange = async (event) => {
  if (event.target.matches('select[data-setting]')) {
    await savePreference(
      { [event.target.dataset.setting]: event.target.value },
      `select[data-setting="${event.target.dataset.setting}"]`,
    );
    return;
  }

  if (event.target.matches('[data-import-file]')) {
    await reviewImportFile(event.target.files?.[0]);
    return;
  }

  if (event.target.matches('select[data-filter]')) {
    await updateFilters({ [event.target.dataset.filter]: event.target.value });
    return;
  }

};

const onKeydown = (event) => {
  if (!state.settingsOpen) return;
  if (event.key === 'Escape' && !state.importReview && !state.confirmReset) {
    event.preventDefault();
    closeSettings();
    return;
  }
  if (event.key !== 'Tab') return;
  const drawer = app.querySelector('.settings-drawer');
  const focusable = [...(drawer?.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]') || [])]
    .filter((element) => !element.hidden);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

const onInput = (event) => {
  if (event.target.matches('.search')) {
    setState({ search: event.target.value });
    renderSearchView();
  }
  if (event.target.matches('[data-daily-note]')) {
    setDailyNote(todayKey(), event.target.value);
  }
};

const boot = async () => {
  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  app.addEventListener('input', onInput);
  app.addEventListener('keydown', onKeydown);
  systemTheme?.addEventListener?.('change', () => {
    if (state.settings.preferences.theme === 'system') applyAppearance(state.settings.preferences);
  });
  setState({ archive: await getArchiveStatus() });

  const warmup = createStartupWarmup({
    filters: state.filters,
    todayMix: state.settings.preferences.todayMix,
    userState: state.userState,
  });

  const snapshot = getSnapshot(todayKey())?.sections?.[state.selectedSection];
  const trustedSnapshot = state.selectedSection === 'code'
    ? snapshot?.status?.sourceRevision === GITHUB_TRENDING_SOURCE_REVISION
    : state.selectedSection === 'models'
      ? snapshot?.status?.descriptionRevision === DESCRIPTION_REVISION
      : state.selectedSection === 'today'
        ? snapshot?.status?.sources?.code?.sourceRevision === GITHUB_TRENDING_SOURCE_REVISION
          && snapshot?.status?.sources?.models?.descriptionRevision === DESCRIPTION_REVISION
        : true;
  if (trustedSnapshot && snapshot?.cards?.length) {
    setState({ cards: snapshot.cards, loading: false, status: { ...snapshot.status, label: snapshot.status?.label || 'Saved daily snapshot' } });
    render();
  }

  await load({ resultPromise: warmup.requests[state.selectedSection] || null });
  void warmup.settled;
};

render();
boot();
