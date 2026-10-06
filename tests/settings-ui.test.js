import { describe, expect, it } from 'vitest';

import { normalizeSettings } from '../src/settings.js';
import { renderSettingsDrawer } from '../src/ui/settings.js';

describe('settings drawer renderer', () => {
  it('renders grouped, labeled controls and saved workbench summaries', () => {
    document.body.innerHTML = renderSettingsDrawer({
      settings: normalizeSettings({ preferences: { theme: 'dark' } }),
      open: true,
      importReview: null,
      error: '',
    });

    const drawer = document.querySelector('[role="dialog"]');
    expect(drawer).toBeTruthy();
    expect(drawer.getAttribute('aria-label')).toBe('Settings');
    expect(document.querySelector('[data-setting="theme"][data-value="dark"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-setting="textSize"][data-value="large"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[aria-label="Text size"]')).toBeTruthy();
    expect(document.querySelector('[data-setting="density"]')).toBeTruthy();
    expect(document.querySelector('[data-setting="startupSection"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-today-lane]')).toHaveLength(5);
    expect(document.querySelectorAll('[data-restore-workbench]')).toHaveLength(7);
    expect(document.querySelectorAll('[data-post-default]')).toHaveLength(4);
    expect(document.querySelector('[data-post-default="minPoints"]').value).toBe('0');
    expect(document.querySelector('[data-command="export-backup"]')).toBeTruthy();
    expect(document.querySelector('[data-command="choose-import"]')).toBeTruthy();
  });

  it('renders nothing while closed and a confirmation summary for a valid import', () => {
    expect(renderSettingsDrawer({ settings: normalizeSettings(), open: false })).toBe('');

    document.body.innerHTML = renderSettingsDrawer({
      settings: normalizeSettings(),
      open: true,
      importReview: {
        fileName: 'backup.json',
        summary: { annotations: 2, progress: 1, notes: 3, snapshots: 4 },
      },
      error: '',
    });

    expect(document.querySelector('[data-import-review]').textContent).toContain('2 annotations');
    expect(document.querySelector('[data-command="confirm-import"]')).toBeTruthy();
  });
});
