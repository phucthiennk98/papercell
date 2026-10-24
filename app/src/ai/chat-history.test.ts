import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPromptWithAttachments,
  createEmptyThread,
  deleteDocThread,
  loadDocThreads,
  saveDocThread,
} from './chat-history';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test('saveDocThread, loadDocThreads, and deleteDocThread scope conversations per document', () => {
  (globalThis as any).localStorage = createMemoryStorage();

  const docA = 'doc-alpha';
  const docB = 'doc-beta';

  const t1 = createEmptyThread(docA);
  t1.messages = [
    { role: 'user', content: 'Create a heatmap of cortical connectivity' },
    { role: 'assistant', content: 'Here is the connectivity heatmap.' },
  ];
  saveDocThread(docA, t1);

  const t2 = createEmptyThread(docA);
  t2.messages = [
    { role: 'user', content: 'Add confidence intervals to the regression plot' },
  ];
  saveDocThread(docA, t2);

  const tB = createEmptyThread(docB);
  tB.messages = [{ role: 'user', content: 'Summarize methods section' }];
  saveDocThread(docB, tB);

  const loadedA = loadDocThreads(docA);
  assert.equal(loadedA.length, 2);
  assert.equal(loadedA[0].title, 'Add confidence intervals to the regression plot');
  assert.equal(loadedA[1].title, 'Create a heatmap of cortical connectivity');

  const loadedB = loadDocThreads(docB);
  assert.equal(loadedB.length, 1);
  assert.equal(loadedB[0].title, 'Summarize methods section');

  const afterDeleteA = deleteDocThread(docA, t2.id);
  assert.equal(afterDeleteA.length, 1);
  assert.equal(afterDeleteA[0].id, t1.id);
});

test('buildPromptWithAttachments embeds reference file text and optional image tags', () => {
  const prompt = buildPromptWithAttachments(
    'Plot this CSV and match the screenshot layout',
    [
      {
        id: 'att-1',
        kind: 'file',
        name: 'metrics.csv',
        mimeType: 'text/csv',
        size: 42,
        textContent: 'epoch,loss\n1,0.92\n2,0.45',
      },
      {
        id: 'att-2',
        kind: 'image',
        name: 'clipboard-1.png',
        mimeType: 'image/png',
        size: 128,
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
      },
    ],
    { embedImageTag: true }
  );

  assert.match(prompt, /<reference_file name="metrics\.csv"/);
  assert.match(prompt, /epoch,loss/);
  assert.match(prompt, /<attached_image name="clipboard-1\.png"/);
});
