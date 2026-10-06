import { normalizeRedditCommunities } from '../settings.js';
import { normalizeRedditPost } from './normalizers.js';

const TOKEN_KEY = 'scout-lab:bright-data-token';
const STATE_KEY = 'scout-lab:bright-data-state';
const DAY = 86400_000;
const MONTHLY_LIMIT = 4500;
const DAILY_LIMIT = 140;
const POLL_INTERVAL = 15_000;
const API = 'https://api.brightdata.com/datasets/v3';
let pending;

const readState = () => {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; } catch { return {}; }
};
const saveState = (state) => localStorage.setItem(STATE_KEY, JSON.stringify(state));
const token = () => localStorage.getItem(TOKEN_KEY) || '';
export const setBrightDataToken = (value) => {
  const next = String(value || '').trim();
  if (!next || /\s/.test(next)) throw new Error('Enter a valid Bright Data API token.');
  localStorage.setItem(TOKEN_KEY, next);
};
export const disconnectBrightData = () => localStorage.removeItem(TOKEN_KEY);
export const getBrightDataSettings = () => {
  const state = readState();
  return {
    connected: Boolean(token()),
    reserved: state.month === new Date().toISOString().slice(0, 7) ? state.reserved || 0 : 0,
    limit: MONTHLY_LIMIT,
    pending: Boolean(state.job),
    updatedAt: state.savedAt ? new Date(state.savedAt).toLocaleString() : '',
  };
};

const request = async (path, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${API}/${path}`, {
      ...options, credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403
        ? 'Bright Data rejected the API token. Check it in Settings.'
        : `Bright Data request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } finally { clearTimeout(timer); }
};

export const normalizeBrightDataPost = (record, now = Date.now()) => {
  try {
    const url = new URL(record.url);
    if (!['www.reddit.com', 'reddit.com', 'old.reddit.com'].includes(url.hostname)
      || url.protocol !== 'https:' || url.username || url.password) return null;
    const match = url.pathname.match(/^\/r\/([A-Za-z0-9_]+)\/comments\/([A-Za-z0-9]+)(?:\/|$)/);
    if (!match || !record.title || !Number.isFinite(Date.parse(record.date_posted))) return null;
    const card = normalizeRedditPost({
      id: match[2], title: record.title, subreddit: match[1], permalink: url.pathname,
      score: record.num_upvotes, num_comments: record.num_comments,
      created_utc: Date.parse(record.date_posted) / 1000, author: record.user_posted,
      selftext: record.description, is_self: true,
    }, now);
    return card ? { ...card, metricLabel: 'Reddit upvotes and comments',
      metrics: card.metrics.map((metric) => metric.id === 'points' ? { ...metric, label: 'Upvotes', meaning: 'Reddit upvotes' } : metric) } : null;
  } catch { return null; }
};

const cachedResult = (state, communities, now, extra = {}) => {
  const selected = new Set(communities.map((name) => name.toLowerCase()));
  const cards = [...new Map((state.records || []).map((item) => normalizeBrightDataPost(item, now))
    .filter((card) => card && selected.has(card.details.subreddit.toLowerCase()))
    .map((card) => [card.id, card])).values()];
  return { cards, candidates: cards.length, limited: true, ...extra };
};

const collect = async (communities) => {
  if (!token()) throw new Error('Connect Bright Data in Settings to load Reddit posts.');
  const now = Date.now();
  const state = readState();
  const month = new Date(now).toISOString().slice(0, 7);
  if (state.month !== month) { state.month = month; state.reserved = 0; }
  if (state.job) {
    if (now - (state.job.lastPollAt || 0) < POLL_INTERVAL) {
      return cachedResult(state, communities, now, { pending: true, message: 'Reddit collection is running. Results will appear automatically.' });
    }
    state.job.lastPollAt = now;
    saveState(state);
    const snapshotId = encodeURIComponent(state.job.snapshotId);
    const progress = await request(`progress/${snapshotId}`);
    if (['failed', 'canceled'].includes(progress.status)) {
      delete state.job;
      state.error = 'Reddit collection failed. Scout Lab will retry after the daily interval.';
      saveState(state);
      return cachedResult(state, communities, now, { unavailable: true, message: state.error });
    }
    if (progress.status !== 'ready') {
      return cachedResult(state, communities, now, { pending: true, message: 'Reddit collection is running. Results will appear automatically.' });
    }
    const records = await request(`snapshot/${snapshotId}?format=json`);
    if (!Array.isArray(records)) throw new Error('Bright Data returned an unexpected result.');
    // Store only fields needed by the cards, never full comment trees or author profiles.
    state.records = records.slice(0, state.job.maxRecords).map((record) => ({
      url: record.url, title: record.title, description: record.description,
      date_posted: record.date_posted, num_upvotes: record.num_upvotes,
      num_comments: record.num_comments, user_posted: record.user_posted,
    }));
    state.communities = state.job.communities;
    state.savedAt = now;
    delete state.job;
    delete state.error;
    saveState(state);
    return cachedResult(state, communities, now);
  }
  if (now - (state.lastAttemptAt || 0) < DAY) {
    const changed = JSON.stringify(state.communities) !== JSON.stringify(communities);
    return cachedResult(state, communities, now, {
      ...(state.error ? { unavailable: true, message: state.error } : changed
        ? { message: 'Subreddit changes will be collected at the next daily refresh.' } : {}),
    });
  }
  const perInput = Math.min(20, Math.floor(DAILY_LIMIT / communities.length),
    Math.floor((MONTHLY_LIMIT - (state.reserved || 0)) / communities.length));
  if (perInput < 1) return cachedResult(state, communities, now, {
    unavailable: true, message: 'Scout Lab’s Reddit allowance is used for this month. Showing saved results.',
  });
  const maxRecords = perInput * communities.length;
  // Reserve before sending. An ambiguous timeout must never cause a duplicate paid job.
  state.reserved = (state.reserved || 0) + maxRecords;
  state.lastAttemptAt = now;
  state.communities = communities;
  state.error = 'Reddit collection did not complete. Scout Lab will retry after the daily interval.';
  saveState(state);
  try {
    const params = new URLSearchParams({ dataset_id: 'gd_lvz8ah06191smkebj4', notify: 'false',
      include_errors: 'true', type: 'discover_new', discover_by: 'subreddit_url' });
    const result = await request(`trigger?${params}`, {
      method: 'POST', body: JSON.stringify({
        input: communities.map((name) => ({ url: `https://www.reddit.com/r/${name}/`, sort_by: 'Hot' })),
        limit_per_input: perInput,
      }),
    });
    if (!/^sd_[A-Za-z0-9_-]+$/.test(result.snapshot_id || '')) throw new Error('Bright Data did not return a collection ID.');
    state.job = { snapshotId: result.snapshot_id, communities, maxRecords, lastPollAt: now };
    delete state.error;
    saveState(state);
    return cachedResult(state, communities, now, { pending: true, message: 'Reddit collection started. Results will appear automatically.' });
  } catch (error) {
    if ([400, 401, 403].includes(error.status)) {
      state.reserved -= maxRecords;
      state.lastAttemptAt = 0;
    }
    state.error = error.message;
    saveState(state);
    throw error;
  }
};

export const fetchBrightDataReddit = (values) => {
  const communities = normalizeRedditCommunities(values);
  const task = () => collect(communities);
  if (globalThis.navigator?.locks?.request) return navigator.locks.request('scout-lab-bright-data', task);
  if (pending) return pending;
  pending = task().finally(() => { pending = null; });
  return pending;
};
