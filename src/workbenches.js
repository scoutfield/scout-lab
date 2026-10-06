export const TOPICS = [
  { value: 'all', label: 'All topics' },
  { value: 'agents', label: 'Agents' },
  { value: 'llms', label: 'LLMs' },
  { value: 'rag', label: 'RAG' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'multimodal', label: 'Multimodal' },
];

const control = (id, label, options, type = 'select', placement = 'primary') => ({
  id, label, options, type, placement,
});

const option = (value, label, group) => ({ value, label, ...(group ? { group } : {}) });

export const REMOTE_CACHE_TTL = 6 * 60 * 60 * 1000;
export const POSTS_CACHE_TTL = 15 * 60 * 1000;

export const MODEL_TASK_OPTIONS = [
  option('all', 'All tasks'),

  option('audio-text-to-text', 'Audio-Text-to-Text', 'Multimodal'),
  option('image-text-to-text', 'Image-Text-to-Text', 'Multimodal'),
  option('image-text-to-image', 'Image-Text-to-Image', 'Multimodal'),
  option('image-text-to-video', 'Image-Text-to-Video', 'Multimodal'),
  option('visual-question-answering', 'Visual Question Answering', 'Multimodal'),
  option('document-question-answering', 'Document Question Answering', 'Multimodal'),
  option('video-text-to-text', 'Video-Text-to-Text', 'Multimodal'),
  option('visual-document-retrieval', 'Visual Document Retrieval', 'Multimodal'),
  option('any-to-any', 'Any-to-Any', 'Multimodal'),

  option('text-classification', 'Text Classification', 'Natural Language Processing'),
  option('token-classification', 'Token Classification', 'Natural Language Processing'),
  option('table-question-answering', 'Table Question Answering', 'Natural Language Processing'),
  option('question-answering', 'Question Answering', 'Natural Language Processing'),
  option('zero-shot-classification', 'Zero-Shot Classification', 'Natural Language Processing'),
  option('translation', 'Translation', 'Natural Language Processing'),
  option('summarization', 'Summarization', 'Natural Language Processing'),
  option('feature-extraction', 'Feature Extraction', 'Natural Language Processing'),
  option('text-generation', 'Text Generation', 'Natural Language Processing'),
  option('fill-mask', 'Fill-Mask', 'Natural Language Processing'),
  option('sentence-similarity', 'Sentence Similarity', 'Natural Language Processing'),
  option('text-ranking', 'Text Ranking', 'Natural Language Processing'),

  option('text-to-speech', 'Text-to-Speech', 'Audio'),
  option('text-to-audio', 'Text-to-Audio', 'Audio'),
  option('automatic-speech-recognition', 'Automatic Speech Recognition', 'Audio'),
  option('audio-to-audio', 'Audio-to-Audio', 'Audio'),
  option('audio-classification', 'Audio Classification', 'Audio'),
  option('voice-activity-detection', 'Voice Activity Detection', 'Audio'),

  option('depth-estimation', 'Depth Estimation', 'Computer Vision'),
  option('image-classification', 'Image Classification', 'Computer Vision'),
  option('object-detection', 'Object Detection', 'Computer Vision'),
  option('image-segmentation', 'Image Segmentation', 'Computer Vision'),
  option('text-to-image', 'Text-to-Image', 'Computer Vision'),
  option('image-to-text', 'Image-to-Text', 'Computer Vision'),
  option('image-to-image', 'Image-to-Image', 'Computer Vision'),
  option('image-to-video', 'Image-to-Video', 'Computer Vision'),
  option('unconditional-image-generation', 'Unconditional Image Generation', 'Computer Vision'),
  option('video-classification', 'Video Classification', 'Computer Vision'),
  option('text-to-video', 'Text-to-Video', 'Computer Vision'),
  option('zero-shot-image-classification', 'Zero-Shot Image Classification', 'Computer Vision'),
  option('mask-generation', 'Mask Generation', 'Computer Vision'),
  option('zero-shot-object-detection', 'Zero-Shot Object Detection', 'Computer Vision'),
  option('text-to-3d', 'Text-to-3D', 'Computer Vision'),
  option('image-to-3d', 'Image-to-3D', 'Computer Vision'),
  option('image-feature-extraction', 'Image Feature Extraction', 'Computer Vision'),
  option('keypoint-detection', 'Keypoint Detection', 'Computer Vision'),
  option('video-to-video', 'Video-to-Video', 'Computer Vision'),

  option('reinforcement-learning', 'Reinforcement Learning', 'Reinforcement Learning'),
  option('robotics', 'Robotics', 'Reinforcement Learning'),

  option('tabular-classification', 'Tabular Classification', 'Tabular'),
  option('tabular-regression', 'Tabular Regression', 'Tabular'),
  option('time-series-forecasting', 'Time Series Forecasting', 'Tabular'),

  option('graph-ml', 'Graph Machine Learning', 'Other'),
];

export const DATASET_TASK_OPTIONS = [
  option('all', 'All tasks'),
  option('image-text-to-text', 'Image-Text-to-Text', 'Multimodal'),
  option('image-text-to-image', 'Image-Text-to-Image', 'Multimodal'),
  option('image-text-to-video', 'Image-Text-to-Video', 'Multimodal'),
  option('visual-question-answering', 'Visual Question Answering', 'Multimodal'),
  option('video-text-to-text', 'Video-Text-to-Text', 'Multimodal'),
  option('visual-document-retrieval', 'Visual Document Retrieval', 'Multimodal'),
  option('any-to-any', 'Any-to-Any', 'Multimodal'),
  option('text-classification', 'Text Classification', 'Natural Language Processing'),
  option('token-classification', 'Token Classification', 'Natural Language Processing'),
  option('table-question-answering', 'Table Question Answering', 'Natural Language Processing'),
  option('question-answering', 'Question Answering', 'Natural Language Processing'),
  option('zero-shot-classification', 'Zero-Shot Classification', 'Natural Language Processing'),
  option('translation', 'Translation', 'Natural Language Processing'),
  option('summarization', 'Summarization', 'Natural Language Processing'),
  option('feature-extraction', 'Feature Extraction', 'Natural Language Processing'),
  option('text-generation', 'Text Generation', 'Natural Language Processing'),
  option('fill-mask', 'Fill-Mask', 'Natural Language Processing'),
  option('sentence-similarity', 'Sentence Similarity', 'Natural Language Processing'),
  option('table-to-text', 'Table-to-Text', 'Natural Language Processing'),
  option('multiple-choice', 'Multiple Choice', 'Natural Language Processing'),
  option('text-ranking', 'Text Ranking', 'Natural Language Processing'),
  option('text-retrieval', 'Text Retrieval', 'Natural Language Processing'),
  option('text-to-speech', 'Text-to-Speech', 'Audio'),
  option('text-to-audio', 'Text-to-Audio', 'Audio'),
  option('automatic-speech-recognition', 'Automatic Speech Recognition', 'Audio'),
  option('audio-to-audio', 'Audio-to-Audio', 'Audio'),
  option('audio-classification', 'Audio Classification', 'Audio'),
  option('voice-activity-detection', 'Voice Activity Detection', 'Audio'),
  option('depth-estimation', 'Depth Estimation', 'Computer Vision'),
  option('image-classification', 'Image Classification', 'Computer Vision'),
  option('object-detection', 'Object Detection', 'Computer Vision'),
  option('image-segmentation', 'Image Segmentation', 'Computer Vision'),
  option('text-to-image', 'Text-to-Image', 'Computer Vision'),
  option('image-to-text', 'Image-to-Text', 'Computer Vision'),
  option('image-to-image', 'Image-to-Image', 'Computer Vision'),
  option('image-to-video', 'Image-to-Video', 'Computer Vision'),
  option('unconditional-image-generation', 'Unconditional Image Generation', 'Computer Vision'),
  option('video-classification', 'Video Classification', 'Computer Vision'),
  option('text-to-video', 'Text-to-Video', 'Computer Vision'),
  option('zero-shot-image-classification', 'Zero-Shot Image Classification', 'Computer Vision'),
  option('mask-generation', 'Mask Generation', 'Computer Vision'),
  option('zero-shot-object-detection', 'Zero-Shot Object Detection', 'Computer Vision'),
  option('text-to-3d', 'Text-to-3D', 'Computer Vision'),
  option('image-to-3d', 'Image-to-3D', 'Computer Vision'),
  option('image-feature-extraction', 'Image Feature Extraction', 'Computer Vision'),
  option('reinforcement-learning', 'Reinforcement Learning', 'Reinforcement Learning'),
  option('robotics', 'Robotics', 'Reinforcement Learning'),
  option('tabular-classification', 'Tabular Classification', 'Tabular'),
  option('tabular-regression', 'Tabular Regression', 'Tabular'),
  option('tabular-to-text', 'Tabular-to-Text', 'Tabular'),
  option('time-series-forecasting', 'Time Series Forecasting', 'Tabular'),
  option('graph-ml', 'Graph Machine Learning', 'Other'),
];

export const DATASET_MODALITY_OPTIONS = [
  option('all', 'All modalities'), option('3d', '3D'), option('audio', 'Audio'),
  option('document', 'Document'), option('geospatial', 'Geospatial'), option('image', 'Image'),
  option('tabular', 'Tabular'), option('text', 'Text'), option('timeseries', 'Time-series'),
  option('video', 'Video'),
];

export const DATASET_FORMAT_OPTIONS = [
  option('all', 'All formats'), option('json', 'JSON'), option('csv', 'CSV'),
  option('parquet', 'Parquet'), option('optimized-parquet', 'Optimized Parquet'),
  option('imagefolder', 'ImageFolder'), option('audiofolder', 'AudioFolder'),
  option('webdataset', 'WebDataset'), option('text', 'Text'), option('arrow', 'Arrow'),
];

export const SPOKEN_LANGUAGE_OPTIONS = [
  option('all', 'Any spoken language'),
  option('en', 'English'),
  option('zh', 'Chinese'),
  option('ja', 'Japanese'),
  option('ko', 'Korean'),
  option('es', 'Spanish'),
  option('fr', 'French'),
  option('de', 'German'),
  option('pt', 'Portuguese'),
  option('ru', 'Russian'),
];

export const CODE_LANGUAGE_OPTIONS = [
  option('all', 'All languages'),
  option('python', 'Python'),
  option('typescript', 'TypeScript'),
  option('javascript', 'JavaScript'),
  option('jupyter-notebook', 'Jupyter Notebook'),
  option('rust', 'Rust'),
  option('go', 'Go'),
  option('c++', 'C++'),
  option('java', 'Java'),
];

export const WORKBENCHES = {
  today: {
    id: 'today',
    label: 'Today',
    title: "Today's queue",
    subtitle: 'A small cross-source queue using one consistent card design.',
    defaults: {},
    controls: [],
    cacheTtl: REMOTE_CACHE_TTL,
  },
  code: {
    id: 'code',
    label: 'Code',
    title: 'Code',
    subtitle: 'GitHub repositories worth reading, running, or learning from.',
    defaults: { time: 'day', spokenLanguage: 'all', language: 'all' },
    controls: [
      control('time', 'Time range', [
        option('day', 'Today'),
        option('week', 'This week'),
        option('month', 'This month'),
      ]),
      control('spokenLanguage', 'Spoken language', SPOKEN_LANGUAGE_OPTIONS),
      control('language', 'Language', CODE_LANGUAGE_OPTIONS),
    ],
    cacheTtl: REMOTE_CACHE_TTL,
  },
  models: {
    id: 'models',
    label: 'Models',
    title: 'Models',
    subtitle: 'Compare releases using Hugging Face source signals.',
    defaults: {
      rank: 'trending',
      task: 'all',
      size: 'any',
      baseOnly: 'off',
      inference: 'off',
      library: 'all',
      license: 'all',
      access: 'all',
      app: 'all',
      updated: 'all',
      topic: 'all',
    },
    controls: [
      control('rank', 'Sort', [
        option('trending', 'Trending'),
        option('likes', 'Most likes'),
        option('downloads', 'Most downloads'),
        option('created', 'Recently created'),
        option('updated', 'Recently updated'),
        option('most-parameters', 'Most parameters'),
        option('least-parameters', 'Least parameters'),
      ]),
      control('task', 'Task', MODEL_TASK_OPTIONS),
      control('size', 'Parameter size', [
        option('any', 'Any size'),
        option('under-1b', '<1B'),
        option('1b-7b', '1B-7B'),
        option('7b-30b', '7B-30B'),
        option('30b-plus', '30B+'),
      ]),
      control('baseOnly', 'Base models only', [option('off', 'Off'), option('on', 'On')], 'toggle', 'quick'),
      control('inference', 'Inference available', [option('off', 'Off'), option('on', 'On')], 'toggle', 'quick'),
      control('library', 'Library or format', [
        option('all', 'All libraries and formats'),
        option('transformers', 'Transformers'),
        option('diffusers', 'Diffusers'),
        option('pytorch', 'PyTorch'),
        option('gguf', 'GGUF'),
        option('mlx', 'MLX'),
      ], 'select', 'advanced'),
      control('license', 'License', [
        option('all', 'All licenses'),
        option('apache-2.0', 'Apache-2.0'),
        option('mit', 'MIT'),
        option('creativeml-openrail-m', 'OpenRAIL-M'),
        option('other', 'Other'),
      ], 'select', 'advanced'),
      control('access', 'Access', [
        option('all', 'All access'),
        option('open', 'Open'),
        option('gated', 'Gated'),
      ], 'select', 'advanced'),
      control('app', 'Compatible app', [
        option('all', 'All compatible apps'),
        option('vllm', 'vLLM'),
        option('ollama', 'Ollama'),
        option('llama.cpp', 'llama.cpp'),
        option('mlx-lm', 'MLX LM'),
        option('lmstudio', 'LM Studio'),
      ], 'select', 'advanced'),
      control('updated', 'Updated date', [
        option('all', 'Any updated date'),
        option('day', 'Updated today'),
        option('week', 'Updated this week'),
        option('month', 'Updated this month'),
      ], 'select', 'advanced'),
    ],
    cacheTtl: REMOTE_CACHE_TTL,
  },
  datasets: {
    id: 'datasets',
    label: 'Datasets',
    title: 'Datasets',
    subtitle: 'See what people are training and evaluating against.',
    defaults: {
      rank: 'trending', task: 'all', size: 'any', language: 'all', license: 'all',
      modality: 'all', format: 'all', type: 'all', access: 'all', topic: 'all',
    },
    controls: [
      control('rank', 'Sort', [
        option('trending', 'Trending'),
        option('likes', 'Most likes'),
        option('downloads', 'Most downloads'),
        option('created', 'Recently created'),
        option('updated', 'Recently updated'),
        option('most-rows', 'Most rows'),
        option('least-rows', 'Least rows'),
        option('largest-size', 'Largest total size'),
        option('smallest-size', 'Smallest total size'),
      ]),
      control('task', 'Task', DATASET_TASK_OPTIONS),
      control('size', 'Rows', [
        option('any', 'Any rows'),
        option('under-1k', '<1K'),
        option('1k-10k', '1K-10K'),
        option('10k-100k', '10K-100K'),
        option('100k-1m', '100K-1M'),
        option('1m-10m', '1M-10M'),
        option('10m-100m', '10M-100M'),
        option('100m-1b', '100M-1B'),
        option('1b-10b', '1B-10B'),
        option('10b-100b', '10B-100B'),
        option('100b-1t', '100B-1T'),
        option('1t-plus', '>1T'),
      ]),
      control('modality', 'Modality', DATASET_MODALITY_OPTIONS),
      control('format', 'Format', DATASET_FORMAT_OPTIONS, 'select', 'advanced'),
      control('type', 'Type', [
        option('all', 'All types'), option('benchmark', 'Benchmark'), option('traces', 'Traces'),
      ], 'select', 'advanced'),
      control('language', 'Language', [
        option('all', 'All languages'), option('en', 'English'), option('zh', 'Chinese'),
        option('ja', 'Japanese'), option('ko', 'Korean'), option('es', 'Spanish'),
        option('fr', 'French'), option('de', 'German'), option('ar', 'Arabic'),
        option('hi', 'Hindi'), option('pt', 'Portuguese'), option('ru', 'Russian'),
        option('multilingual', 'Multilingual'),
      ], 'select', 'advanced'),
      control('license', 'License', [
        option('all', 'All licenses'), option('apache-2.0', 'Apache-2.0'), option('mit', 'MIT'),
        option('cc-by-4.0', 'CC BY 4.0'), option('cc0-1.0', 'CC0 1.0'), option('odc-by', 'ODC-By'),
      ], 'select', 'advanced'),
      control('access', 'Access', [option('all', 'All access'), option('open', 'Open'), option('gated', 'Gated')], 'select', 'advanced'),
      control('topic', 'AI topic', TOPICS, 'select', 'advanced'),
    ],
    cacheTtl: REMOTE_CACHE_TTL,
  },
  papers: {
    id: 'papers',
    label: 'Papers',
    title: 'Papers',
    subtitle: 'Community attention and raw arXiv research in one card grid.',
    defaults: { source: 'community', time: 'week', topic: 'all', sort: 'trending' },
    controls: [
      control('source', 'Source', [
        option('community', 'Community'),
        option('arxiv', 'Raw arXiv'),
      ], 'segment'),
      control('time', 'Time range', [
        option('day', 'Today'),
        option('week', 'This week'),
        option('month', 'This month'),
      ]),
      control('topic', 'Topic or category', [
        ...TOPICS,
        option('cs.AI', 'cs.AI'),
        option('cs.LG', 'cs.LG'),
      ]),
      control('sort', 'Sort', [
        option('trending', 'Trending'),
        option('recent', 'Recent'),
        option('newest', 'Newest'),
        option('relevance', 'Relevance'),
      ]),
    ],
    cacheTtl: REMOTE_CACHE_TTL,
  },
  posts: {
    id: 'posts',
    label: 'Posts',
    title: 'Posts',
    subtitle: 'Discussions from Hacker News and your subreddits, ranked by points and recency.',
    defaults: { time: 'week', topic: 'all', minPoints: '0', minComments: '0' },
    controls: [
      control('time', 'Time range', [
        option('day', 'Past 24 hours'),
        option('week', 'Past 7 days'),
        option('month', 'Past 30 days'),
      ]),
      control('topic', 'AI topic', TOPICS),
      control('minPoints', 'Minimum points', [
        option('0', 'Any points'), option('5', '5+ points'), option('20', '20+ points'),
        option('50', '50+ points'), option('100', '100+ points'),
      ]),
      control('minComments', 'Minimum comments', [
        option('0', 'Any comments'), option('5', '5+ comments'),
        option('20', '20+ comments'), option('50', '50+ comments'),
      ]),
    ],
    cacheTtl: POSTS_CACHE_TTL,
  },
  library: {
    id: 'library',
    label: 'Library',
    title: 'Library',
    subtitle: 'Review the favorites and notes you chose to keep.',
    defaults: { view: 'all', type: 'all', source: 'all', sort: 'updated' },
    controls: [
      control('view', 'View', [
        option('all', 'All'), option('favorites', 'Favorites'), option('notes', 'Notes'),
      ], 'segment'),
      control('type', 'Content type', [
        option('all', 'All content'), option('Code', 'Code'), option('Model', 'Models'),
        option('Dataset', 'Datasets'), option('Paper', 'Papers'), option('Post', 'Posts'),
      ]),
      control('source', 'Source', [
        option('all', 'All sources'), option('github', 'GitHub'), option('huggingface', 'Hugging Face'),
        option('arxiv', 'arXiv'), option('hackernews', 'Hacker News'), option('reddit', 'Reddit'),
      ]),
      control('sort', 'Sort', [
        option('updated', 'Recently updated'), option('saved', 'Recently saved'), option('title', 'Title'),
      ]),
    ],
    cacheTtl: Infinity,
  },
};

export const SECTION_ORDER = Object.keys(WORKBENCHES);

export const createDefaultFilters = () => Object.fromEntries(
  SECTION_ORDER.map((id) => [id, { ...WORKBENCHES[id].defaults }]),
);

export const getWorkbench = (id) => WORKBENCHES[id] || WORKBENCHES.today;

export const normalizeWorkbenchFilters = (id, values = {}) => {
  const workbench = getWorkbench(id);
  const candidate = id === 'models' && values.rank === 'newest'
    ? { ...values, rank: 'created' }
    : values;
  const allowedByControl = Object.fromEntries(workbench.controls.map((item) => [
    item.id,
    new Set(item.options.map(({ value }) => value)),
  ]));

  return Object.fromEntries(Object.entries(workbench.defaults).map(([key, fallback]) => {
    if (!allowedByControl[key]) return [key, candidate[key] || fallback];
    return [key, allowedByControl[key].has(candidate[key]) ? candidate[key] : fallback];
  }));
};
