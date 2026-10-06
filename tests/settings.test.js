import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  isValidTodayMix,
  normalizePreferences,
  normalizeSettings,
  resolveStartupSection,
} from '../src/settings.js';

describe('settings schema', () => {
  it('migrates version-one state without losing the selected section or current filters', () => {
    const settings = normalizeSettings({
      selectedSection: 'models',
      selectedTopic: 'rag',
      filters: { code: { language: 'python' } },
    });

    expect(settings.version).toBe(4);
    expect(settings.selectedSection).toBe('models');
    expect(settings.filters.code).toEqual({ time: 'day', spokenLanguage: 'all', language: 'python' });
    expect(settings.filters.models.topic).toBe('rag');
    expect(settings.filterDefaults.code.language).toBe('all');
    expect(settings.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('migrates the former Models newest sort and adds balanced defaults', () => {
    const settings = normalizeSettings({
      selectedSection: 'models',
      filters: { models: { rank: 'newest', task: 'text-generation', access: 'gated' } },
    });

    expect(settings.filters.models).toMatchObject({
      rank: 'created', task: 'text-generation', size: 'any', baseOnly: 'off', inference: 'off',
      library: 'all', license: 'all', access: 'gated', app: 'all', updated: 'all', topic: 'all',
    });
  });

  it('falls back malformed preferences independently', () => {
    const preferences = normalizePreferences({
      theme: 'dark',
      textSize: 'tiny',
      density: 'tiny',
      startupSection: 'papers',
      openLinks: 'elsewhere',
      todayMix: { code: 4, models: 0, datasets: 0, papers: 0 },
    });

    expect(preferences).toEqual({
      theme: 'dark',
      textSize: 'large',
      density: 'comfortable',
      startupSection: 'papers',
      openLinks: 'foreground',
      todayMix: { code: 4, models: 0, datasets: 0, papers: 0, posts: 2 },
    });
  });

  it('keeps Standard text independent from theme and density', () => {
    expect(normalizePreferences({ theme: 'light', textSize: 'standard', density: 'compact' }))
      .toMatchObject({ theme: 'light', textSize: 'standard', density: 'compact' });
  });

  it('validates Today lane ranges and combined totals', () => {
    expect(isValidTodayMix({ code: 4, models: 4, datasets: 0, papers: 4, posts: 0 })).toBe(true);
    expect(isValidTodayMix({ code: 0, models: 0, datasets: 0, papers: 0, posts: 0 })).toBe(false);
    expect(isValidTodayMix({ code: 5, models: 0, datasets: 0, papers: 0, posts: 0 })).toBe(false);
    expect(isValidTodayMix({ code: 4, models: 4, datasets: 4, papers: 1, posts: 0 })).toBe(false);
  });

  it('migrates Posts current filters and saved defaults without keeping old modes', () => {
    const settings = normalizeSettings({
      filters: { posts: { rank: 'top', time: 'month', topic: 'rag' } },
      filterDefaults: { posts: { rank: 'trending', time: 'day', topic: 'agents' } },
    });
    expect(settings.filters.posts).toEqual({ time: 'month', topic: 'rag', minPoints: '0', minComments: '0' });
    expect(settings.filterDefaults.posts).toEqual({ time: 'day', topic: 'agents', minPoints: '0', minComments: '0' });
    expect(normalizeSettings({ filters: { posts: { minPoints: '-1', minComments: 'bad' } } }).filters.posts)
      .toMatchObject({ minPoints: '0', minComments: '0' });
  });

  it('adds Posts to legacy Today queues only within their remaining capacity', () => {
    expect(normalizePreferences().todayMix).toEqual({ code: 2, models: 1, datasets: 1, papers: 2, posts: 2 });
    expect(normalizePreferences({ todayMix: { code: 4, models: 4, datasets: 0, papers: 3 } }).todayMix)
      .toEqual({ code: 4, models: 4, datasets: 0, papers: 3, posts: 1 });
    expect(normalizePreferences({ todayMix: { code: 4, models: 4, datasets: 0, papers: 4 } }).todayMix.posts).toBe(0);
    expect(normalizePreferences({ todayMix: { code: 2, models: 1, datasets: 1, papers: 2, posts: 0 } }).todayMix.posts).toBe(0);
  });

  it('resolves Last used separately from fixed startup workbenches', () => {
    expect(resolveStartupSection(normalizeSettings({ selectedSection: 'datasets' }))).toBe('datasets');
    expect(resolveStartupSection(normalizeSettings({
      selectedSection: 'datasets',
      preferences: { startupSection: 'today' },
    }))).toBe('today');
  });
});
