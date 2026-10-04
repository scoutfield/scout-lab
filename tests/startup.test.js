import { describe, expect, it, vi } from 'vitest';

import { createStartupWarmup, STARTUP_SECTIONS } from '../src/services/startup.js';
import { createDefaultFilters } from '../src/workbenches.js';

describe('startup cache warming', () => {
  it('starts every remote workbench immediately with exact current filters', async () => {
    const filters = createDefaultFilters();
    const pending = new Map();
    const fetcher = vi.fn((section) => new Promise((resolve) => pending.set(section, resolve)));

    const warmup = createStartupWarmup({
      filters,
      todayMix: { code: 2, models: 1, datasets: 1, papers: 2 },
      userState: { 'github:one': { hidden: true } },
    }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(fetcher.mock.calls.map(([section]) => section)).toEqual(STARTUP_SECTIONS);
    for (const [section, sectionFilters, options] of fetcher.mock.calls) {
      expect(sectionFilters).toEqual(filters[section]);
      expect(options).toMatchObject({ force: false, allFilters: filters });
    }

    pending.get('code')({ cards: [{ id: 'code' }], status: {} });
    await expect(warmup.requests.code).resolves.toMatchObject({ cards: [{ id: 'code' }] });
    for (const section of STARTUP_SECTIONS.filter((id) => id !== 'code')) {
      pending.get(section)({ cards: [], status: {} });
    }
    await expect(warmup.settled).resolves.toHaveLength(6);
  });

  it('contains a failed background workbench with all-settled completion', async () => {
    const fetcher = vi.fn((section) => (
      section === 'datasets' ? Promise.reject(new Error('datasets unavailable')) : Promise.resolve({ section })
    ));

    const warmup = createStartupWarmup({ filters: createDefaultFilters() }, fetcher);
    const results = await warmup.settled;

    expect(results.find(({ section }) => section === 'datasets')).toMatchObject({
      section: 'datasets',
      status: 'rejected',
    });
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(5);
  });
});
