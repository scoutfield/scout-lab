import { describe, expect, it } from 'vitest';

import {
  renderCard,
  renderEmptyState,
  renderFilters,
  renderSourceLink,
  renderSourceUnavailable,
  updateSearchResults,
} from '../src/ui/render.js';
import { WORKBENCHES } from '../src/workbenches.js';

const baseCard = {
  id: 'source:item',
  source: 'github',
  section: 'code',
  type: 'Code',
  title: 'Owner / repository',
  url: 'https://github.com/owner/repository',
  summary: 'A concise description.',
  tags: ['agents', 'tools'],
  metricValue: '+120 this week',
  secondary: { left: 'Python', right: '12.3k stars' },
  links: [],
};

describe('shared workbench renderer', () => {
  it('updates search results without replacing the focused search input', () => {
    document.body.innerHTML = `
      <main id="app">
        <input class="search" aria-label="Search this tab">
        <nav class="nav"><button aria-current="page"><span class="count">24</span></button></nav>
        <span class="feed-count">24 visible items</span>
        <section class="grid"><article>Old result</article></section>
      </main>
    `;
    const search = document.querySelector('.search');
    search.focus();

    updateSearchResults(document.querySelector('#app'), {
      gridHtml: '<article>Filtered result</article>',
      countLabel: '1 visible item',
      navCount: '1',
    });

    expect(document.activeElement).toBe(search);
    expect(document.querySelector('.grid').textContent).toContain('Filtered result');
    expect(document.querySelector('.feed-count').textContent).toBe('1 visible item');
    expect(document.querySelector('.nav .count').textContent).toBe('1');
  });

  it.each(['Code', 'Model', 'Dataset', 'Paper'])('uses identical card anatomy for %s', (type) => {
    const html = renderCard({ ...baseCard, type }, { user: {}, progress: {} });
    document.body.innerHTML = html;
    const card = document.querySelector('.card');

    expect(card.querySelector('.card-head')).toBeTruthy();
    expect(card.querySelector('h3')).toBeTruthy();
    expect(card.querySelector('.summary')).toBeTruthy();
    expect(card.querySelector('.tags')).toBeTruthy();
    expect(card.querySelector('.secondary')).toBeTruthy();
    expect(card.querySelector('.card-footer')).toBeTruthy();
    expect(card.querySelectorAll('[data-action]')).toHaveLength(3);
    expect(card.querySelector('a.open')?.href).toBe(baseCard.url);
  });

  it('escapes source content and rejects an unsafe open URL', () => {
    const html = renderCard({
      ...baseCard,
      title: '<img src=x onerror=alert(1)>',
      url: 'javascript:alert(1)',
    }, { user: {}, progress: {} });
    document.body.innerHTML = html;

    expect(document.querySelector('.card h3')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(document.querySelector('.card h3 img')).toBeNull();
    expect(document.querySelector('a.open')).toBeNull();
  });

  it('renders accessible source-specific filters without changing the grid', () => {
    const html = renderFilters(WORKBENCHES.code, WORKBENCHES.code.defaults);
    document.body.innerHTML = html;

    expect(document.querySelectorAll('.segment, .control')).toHaveLength(3);
    expect(document.querySelector('[aria-label="Mode"]')).toBeNull();
    expect(document.querySelector('[aria-label="AI topic"]')).toBeNull();
    const spokenLanguage = document.querySelector('[aria-label="Spoken language"]');
    expect(spokenLanguage).toBeTruthy();
    expect([...spokenLanguage.options].map(({ value }) => value)).toEqual([
      'all', 'en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru',
    ]);
    expect(document.querySelector('[data-command="reset-filters"]')).toBeTruthy();
    expect(document.querySelector('[data-command="save-filter-default"]')).toBeTruthy();
  });

  it('renders the balanced Models controls and independent More filters', () => {
    document.body.innerHTML = renderFilters(WORKBENCHES.models, WORKBENCHES.models.defaults);

    expect([...document.querySelector('[aria-label="Sort"]').options].map(({ textContent }) => textContent)).toEqual([
      'Trending', 'Most likes', 'Most downloads', 'Recently created', 'Recently updated',
      'Most parameters', 'Least parameters',
    ]);
    expect(document.querySelector('[role="switch"][aria-label="Base models only"]')?.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('[role="switch"][aria-label="Inference available"]')?.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('.more-filters summary')?.textContent).toContain('More filters');
    expect([...document.querySelectorAll('.more-filters select')].map(({ ariaLabel }) => ariaLabel)).toEqual([
      'Library or format', 'License', 'Access', 'Compatible app', 'Updated date',
    ]);
  });

  it('renders every Hugging Face model-visible task in modality groups', () => {
    document.body.innerHTML = renderFilters(WORKBENCHES.models, WORKBENCHES.models.defaults);

    const task = document.querySelector('[aria-label="Task"]');
    const expectedByGroup = {
      Multimodal: [
        'audio-text-to-text', 'image-text-to-text', 'image-text-to-image', 'image-text-to-video',
        'visual-question-answering', 'document-question-answering', 'video-text-to-text',
        'visual-document-retrieval', 'any-to-any',
      ],
      'Natural Language Processing': [
        'text-classification', 'token-classification', 'table-question-answering',
        'question-answering', 'zero-shot-classification', 'translation', 'summarization',
        'feature-extraction', 'text-generation', 'fill-mask', 'sentence-similarity', 'text-ranking',
      ],
      Audio: [
        'text-to-speech', 'text-to-audio', 'automatic-speech-recognition', 'audio-to-audio',
        'audio-classification', 'voice-activity-detection',
      ],
      'Computer Vision': [
        'depth-estimation', 'image-classification', 'object-detection', 'image-segmentation',
        'text-to-image', 'image-to-text', 'image-to-image', 'image-to-video',
        'unconditional-image-generation', 'video-classification', 'text-to-video',
        'zero-shot-image-classification', 'mask-generation', 'zero-shot-object-detection',
        'text-to-3d', 'image-to-3d', 'image-feature-extraction', 'keypoint-detection', 'video-to-video',
      ],
      'Reinforcement Learning': ['reinforcement-learning', 'robotics'],
      Tabular: ['tabular-classification', 'tabular-regression', 'time-series-forecasting'],
      Other: ['graph-ml'],
    };

    expect([...task.children].filter(({ tagName }) => tagName === 'OPTION').map(({ value }) => value)).toEqual(['all']);
    expect(Object.fromEntries([...task.querySelectorAll('optgroup')].map((group) => [
      group.label,
      [...group.querySelectorAll('option')].map(({ value }) => value),
    ]))).toEqual(expectedByGroup);
    expect(task.querySelectorAll('optgroup option')).toHaveLength(52);
    const taskValues = [...task.options].map(({ value }) => value);
    for (const hiddenTask of ['tabular-to-text', 'table-to-text', 'multiple-choice', 'text-retrieval', 'other']) {
      expect(taskValues).not.toContain(hiddenTask);
    }
    expect(task.querySelector('option[value="fill-mask"]')?.textContent).toBe('Fill-Mask');
    expect(task.querySelector('option[value="automatic-speech-recognition"]')?.textContent)
      .toBe('Automatic Speech Recognition');
    expect(task.querySelector('option[value="graph-ml"]')?.textContent).toBe('Graph Machine Learning');
  });

  it('renders the complete Hugging Face dataset discovery controls', () => {
    document.body.innerHTML = renderFilters(WORKBENCHES.datasets, WORKBENCHES.datasets.defaults);

    expect([...document.querySelector('[aria-label="Sort"]').options].map(({ value }) => value)).toEqual([
      'trending', 'likes', 'downloads', 'created', 'updated', 'most-rows', 'least-rows',
      'largest-size', 'smallest-size',
    ]);
    expect([...document.querySelector('[aria-label="Modality"]').options].map(({ value }) => value)).toEqual([
      'all', '3d', 'audio', 'document', 'geospatial', 'image', 'tabular', 'text', 'timeseries', 'video',
    ]);
    expect([...document.querySelector('[aria-label="Format"]').options].map(({ value }) => value)).toEqual([
      'all', 'json', 'csv', 'parquet', 'optimized-parquet', 'imagefolder', 'audiofolder',
      'webdataset', 'text', 'arrow',
    ]);
    expect([...document.querySelector('[aria-label="Type"]').options].map(({ value }) => value)).toEqual([
      'all', 'benchmark', 'traces',
    ]);
    expect([...document.querySelector('[aria-label="Rows"]').options].map(({ textContent }) => textContent)[0])
      .toBe('Any rows');
  });

  it('renders the Library review controls in the shared filter bar', () => {
    document.body.innerHTML = renderFilters(WORKBENCHES.library, WORKBENCHES.library.defaults);

    expect([...document.querySelectorAll('[data-filter="view"]')].map(({ textContent }) => textContent.trim()))
      .toEqual(['All', 'Favorites', 'Notes']);
    expect([...document.querySelector('[aria-label="Content type"]').options].map(({ value }) => value))
      .toEqual(['all', 'Code', 'Model', 'Dataset', 'Paper', 'Post']);
    expect([...document.querySelector('[aria-label="Source"]').options].map(({ value }) => value))
      .toEqual(['all', 'github', 'huggingface', 'arxiv', 'hackernews', 'reddit']);
    expect([...document.querySelector('[aria-label="Sort"]').options].map(({ value }) => value))
      .toEqual(['updated', 'saved', 'title']);
  });

  it('renders validated related-model links inside a collapsed family list', () => {
    document.body.innerHTML = renderCard({
      ...baseCard,
      source: 'huggingface',
      type: 'Model',
      url: 'https://huggingface.co/Qwen/Qwen-7B',
      relatedVariants: [
        { title: 'community/Qwen-7B-GGUF', url: 'https://huggingface.co/community/Qwen-7B-GGUF' },
        { title: '<unsafe>', url: 'javascript:alert(1)' },
      ],
    });

    expect(document.querySelector('.model-variants')?.open).toBe(false);
    expect(document.querySelector('.model-variants summary')?.textContent).toContain('1 related variant');
    expect(document.querySelector('.model-variants a')?.href).toBe('https://huggingface.co/community/Qwen-7B-GGUF');
    expect(document.querySelector('.model-variants').textContent).not.toContain('<unsafe>');
  });

  it('renders no filter chrome for the fixed Today composition', () => {
    expect(renderFilters(WORKBENCHES.today, WORKBENCHES.today.defaults)).toBe('');
  });

  it('renders paper PDF links, comments, favorites, and comment editing in shared slots', () => {
    const paperCard = {
      ...baseCard,
      source: 'arxiv',
      type: 'Paper',
      url: 'https://arxiv.org/abs/2608.12345',
      links: [{ id: 'pdf', label: 'PDF', url: 'https://arxiv.org/pdf/2608.12345' }],
    };
    document.body.innerHTML = renderCard(paperCard, { user: { 'source:item': { favorite: true, comment: 'Read methods.' } } });
    expect(document.querySelector('.secondary-link')?.textContent).toBe('PDF');
    expect(document.querySelector('[data-action="favorite"]')?.classList.contains('active')).toBe(true);
    expect(document.querySelector('.comment-preview')?.textContent).toBe('Read methods.');

    document.body.innerHTML = renderCard(paperCard, {
      commentingId: 'source:item',
    });
    expect(document.querySelector('[data-comment-draft]')).toBeTruthy();
  });

  it('renders a resettable empty state with active restrictions', () => {
    document.body.innerHTML = renderEmptyState({ language: 'python', topic: 'agents' });
    expect(document.body.textContent).toContain('language: python');
    expect(document.querySelector('[data-command="reset-filters"]')).toBeTruthy();
  });

  it('renders an honest GitHub Trending source failure', () => {
    document.body.innerHTML = renderSourceUnavailable({
      url: 'https://github.com/trending/python?since=weekly&spoken_language_code=zh',
    });

    expect(document.querySelector('.source-unavailable')).toBeTruthy();
    expect(document.body.textContent).toContain('GitHub Trending is unavailable');
    expect(document.querySelector('[data-command="refresh"]')?.textContent).toContain('Retry');
    expect(document.querySelector('a')?.href).toBe('https://github.com/trending/python?since=weekly&spoken_language_code=zh');
  });

  it('renders only validated GitHub feed source links', () => {
    document.body.innerHTML = renderSourceLink({
      url: 'https://github.com/trending?since=daily',
      label: 'Open on GitHub',
    });
    expect(document.querySelector('a')?.href).toBe('https://github.com/trending?since=daily');
    expect(document.querySelector('a')?.rel).toContain('noopener');
    expect(renderSourceLink({ url: 'javascript:alert(1)', label: 'Unsafe' })).toBe('');
  });
});
