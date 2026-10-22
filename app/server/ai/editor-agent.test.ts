import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

import { BaseParagraphPlugin, createSlateEditor } from 'platejs';
import { BaseTablePlugin } from '@platejs/table';
import { MarkdownPlugin } from '@platejs/markdown';
import remarkGfm from 'remark-gfm';
import {
  editorAgentCommand,
  isLocalAgentAddress,
  prepareEditorAgent,
  type EditorAgentRunner,
} from './editor-agent';
import { ERROR_MARK, PROGRESS_MARK } from './assistant';
import { POST as copilot } from './copilot/route';

// The server bundler also drops CSS imported by static editor components.
register('data:text/javascript,' + encodeURIComponent(`
  export async function load(url, context, nextLoad) {
    return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context);
  }
`));
const { POST: command } = await import('./command/route');

const signal = () => new AbortController().signal;
const messages = [{ id: 'question', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Improve this text.' }] }];
const paragraph = (id = 'original', text = 'Original text.') => ({ id, type: 'p', children: [{ text }] });
const ctx = (toolName: string | null = 'generate') => ({
  children: [paragraph()], toolName,
  selection: { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 8 } },
});
const request = (body: object, abortSignal?: AbortSignal) => new Request('http://localhost/api/ai', {
  method: 'POST', body: JSON.stringify(body), signal: abortSignal,
});
const local = { aiMode: 'agent', agent: 'codex', agentModel: 'gpt-5.4', agentEffort: 'high', aiConfig: { provider: 'openai', apiKey: '' } };
const calls: Parameters<EditorAgentRunner>[] = [];
const runner = (...answers: (string | Response)[]): EditorAgentRunner => async (...args) => {
  calls.push(args);
  const answer = answers.shift();
  assert.notEqual(answer, undefined, 'Unexpected agent invocation');
  return answer instanceof Response ? answer : new Response(answer);
};
async function events(response: Response) {
  assert.equal(response.headers.get('x-vercel-ai-ui-message-stream'), 'v1');
  return (await response.text()).split('\n').filter((line) => line.startsWith('data: {')).map((line) => JSON.parse(line.slice(6)));
}
test('command local mode needs no API key and forwards selected agent/model/effort', async () => {
  const body = { ...local, ctx: ctx(), messages };
  const before = structuredClone(body);
  const result = await events(await command(request(body), true, runner('Generated text.')));
  assert.deepEqual(body, before);
  const call = calls.at(-1)!;
  assert.equal(call[0], 'codex');
  assert.deepEqual(call[6], { model: 'gpt-5.4', effort: 'high' });
  assert.match(call[1][0].content, /Improve this text/);
  assert.match(call[2], /Original text/);
  assert.deepEqual(result.map((part) => part.type), ['start', 'data-toolName', 'start-step', 'text-start', 'text-delta', 'text-end', 'finish-step', 'finish']);
  assert.equal(result.find((part) => part.type === 'text-delta').delta, 'Generated text.');
  assert.equal(result.at(-1).finishReason, 'stop');
});

test('automatic tool selection accepts fenced JSON and uses edit prompts', async () => {
  const result = await events(await command(request({ ...local, ctx: ctx(null), messages }), true,
    runner('```json\n"edit"\n```', 'Rewritten')));
  assert.equal(result.find((part) => part.type === 'data-toolName').data, 'edit');
  assert.equal(result.find((part) => part.type === 'text-delta').delta, 'Rewritten');
  assert.match(calls.at(-1)![1][0].content, /<Selection>Original<\/Selection>/);
});

test('comments retain block IDs and emit matching finished events', async () => {
  const comment = { blockId: 'original', content: 'Original', comment: 'Clarify this.' };
  const result = await events(await command(request({ ...local, ctx: ctx('comment'), messages }), true,
    runner('```json\n' + JSON.stringify([comment]) + '\n```')));
  const parts = result.filter((part) => part.type === 'data-comment');
  assert.deepEqual(parts.map((part) => part.data), [{ comment, status: 'streaming' }, { comment: null, status: 'finished' }]);
});

test('malformed comments, unknown IDs and invented fragments emit errors without modifications or finish', async () => {
  for (const answer of ['not JSON', '{}', '[]', '[{"blockId":"missing","comment":"Test","content":"Original"}]',
    '[{"blockId":"original","comment":"Test","content":"Invented"}]',
    '[{"blockId":"original","comment":"Valid","content":"Original"},{"blockId":"missing","comment":"Bad","content":"Original"}]']) {
    const result = await events(await command(request({ ...local, ctx: ctx('comment'), messages }), true, runner(answer)));
    assert.ok(result.some((part) => part.type === 'error'));
    assert.ok(!result.some((part) => ['data-comment', 'finish', 'finish-step', 'text-delta'].includes(part.type)));
  }
});

test('nested column comments validate selected block order and split into original target IDs', async () => {
  const context = {
    children: [{ id: 'columns', type: 'column_group', children: [
      { id: 'column-a', type: 'column', width: '50%', children: [paragraph('nested-a', 'Alpha.'), paragraph('nested-b', 'Beta.')] },
      { id: 'column-b', type: 'column', width: '50%', children: [paragraph('unselected', 'Outside.')] },
    ] }],
    toolName: 'comment',
    selection: { anchor: { path: [0, 0, 0, 0], offset: 0 }, focus: { path: [0, 0, 1, 0], offset: 5 } },
  };
  const answer = [{ blockId: 'nested-a', content: 'Alpha.\n\nBeta.', comment: 'Compare these.' }];
  const result = await events(await command(request({ ...local, ctx: context, messages }), true, runner(JSON.stringify(answer))));
  const comments = result.filter((part) => part.type === 'data-comment' && part.data.status === 'streaming');
  assert.deepEqual(comments.map((part) => part.data.comment), [
    { blockId: 'nested-a', content: 'Alpha.', comment: 'Compare these.' },
    { blockId: 'nested-b', content: 'Beta.', comment: 'Compare these.' },
  ]);
  const invalid = await events(await command(request({ ...local, ctx: context, messages }), true,
    runner(JSON.stringify([{ blockId: 'nested-a', content: 'Alpha.\n\nBeta.\n\nOutside.', comment: 'Too far.' }]))));
  assert.ok(invalid.some((part) => part.type === 'error'));
  assert.ok(!invalid.some((part) => part.type === 'data-comment'));
});

test('top-level multi-block comments keep the original combined Plate payload', async () => {
  const context = {
    children: [paragraph('block-a', 'Alpha.'), paragraph('block-b', 'Beta.')], toolName: 'comment',
    selection: { anchor: { path: [0, 0], offset: 0 }, focus: { path: [1, 0], offset: 5 } },
  };
  const comment = { blockId: 'block-a', content: 'Alpha.\n\nBeta.', comment: 'Compare these.' };
  const result = await events(await command(request({ ...local, ctx: context, messages }), true, runner(JSON.stringify([comment]))));
  assert.deepEqual(result.filter((part) => part.type === 'data-comment').map((part) => part.data), [
    { comment, status: 'streaming' }, { comment: null, status: 'finished' },
  ]);
});

function tableEditor() {
  return createSlateEditor({
    plugins: [BaseParagraphPlugin, BaseTablePlugin, MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } })],
    value: [{ id: 'table', type: 'table', children: [{ id: 'row', type: 'tr', children: [
      { id: 'cell-a', type: 'td', children: [paragraph('cell-p-a', 'Alpha')] },
      { id: 'cell-b', type: 'td', children: [paragraph('cell-p-b', 'Beta')] },
      { id: 'cell-c', type: 'td', children: [paragraph('cell-p-c', 'Gamma')] },
    ] }] }],
    selection: { anchor: { path: [0, 0, 0, 0, 0], offset: 0 }, focus: { path: [0, 0, 1, 0, 0], offset: 4 } },
  });
}

test('table updates only selected original cell IDs and emits matching finished events', async () => {
  const updates = [{ id: 'cell-a', content: 'New alpha' }, { id: 'cell-b', content: 'New beta' }];
  const complete = prepareEditorAgent(local, true, signal(), runner(JSON.stringify(updates)));
  const result = await events(editorAgentCommand(tableEditor(), messages, 'edit', complete, signal()));
  const parts = result.filter((part) => part.type === 'data-table');
  assert.deepEqual(parts.map((part) => part.data), [
    ...updates.map((cellUpdate) => ({ cellUpdate, status: 'streaming' })), { cellUpdate: null, status: 'finished' },
  ]);
});

test('table validation rejects malformed, unselected, unknown, and duplicate targets atomically', async () => {
  for (const answer of ['oops', '[]', '[{"id":"cell-a","content":4}]', '[{"id":"cell-c","content":"Wrong"}]',
    '[{"id":"missing","content":"Wrong"}]', '[{"id":"cell-a","content":"One"},{"id":"cell-a","content":"Two"}]',
    '[{"id":"cell-a","content":"Valid"},{"id":"missing","content":"Wrong"}]']) {
    const complete = prepareEditorAgent(local, true, signal(), runner(answer));
    const result = await events(editorAgentCommand(tableEditor(), messages, 'edit', complete, signal()));
    assert.ok(result.some((part) => part.type === 'error'));
    assert.ok(!result.some((part) => ['data-table', 'finish', 'finish-step'].includes(part.type)));
  }
});

test('progress markers split across chunks never enter content; error markers reject partial answers', async () => {
  const chunks = [PROGRESS_MARK.slice(0, 2), PROGRESS_MARK.slice(2) + 'Thinking', '\nActual ', 'answer.'];
  const response = new Response(new ReadableStream({ start(controller) {
    chunks.forEach((chunk) => controller.enqueue(new TextEncoder().encode(chunk))); controller.close();
  } }));
  const complete = prepareEditorAgent(local, true, signal(), runner(response));
  assert.equal(await complete('Test'), 'Actual answer.');
  const result = await events(await command(request({ ...local, ctx: ctx(), messages }), true,
    runner('Partial answer' + ERROR_MARK + 'Agent quota exceeded.')));
  assert.equal(result.find((part) => part.type === 'error').errorText, 'Agent quota exceeded.');
  assert.ok(!result.some((part) => ['text-delta', 'finish'].includes(part.type)));
});

test('agent HTTP errors and empty answers are clear and never fall back to API', async () => {
  for (const answer of [Response.json({ error: 'Agent is not installed.' }, { status: 404 }), PROGRESS_MARK + 'Thinking\n']) {
    const result = await events(await command(request({ ...local, ctx: ctx(), messages }), true, runner(answer)));
    assert.ok(result.some((part) => part.type === 'error'));
    assert.ok(!result.some((part) => part.type === 'finish'));
  }
});

test('both handlers deny missing authorization and invalid agent/model/effort before spawn', async () => {
  const neverRun: EditorAgentRunner = async () => { assert.fail('Agent must not start'); };
  for (const handler of [command, copilot]) {
    const body = { ...local, ctx: ctx(), messages, prompt: 'Continue this' };
    assert.equal((await handler(request(body), undefined, neverRun)).status, 403);
    assert.equal((await handler(request(body), false, neverRun)).status, 403);
    for (const change of [{ agent: '' }, { agent: 'unknown' }, { agent: undefined }, { agentModel: '--bad' }, { agentEffort: 'high;evil' }]) {
      assert.equal((await handler(request({ ...body, ...change }), true, neverRun)).status, 400);
    }
  }
});

test('abort forwards to the runner and prevents completion even when its stream does not close', async () => {
  const controller = new AbortController();
  let received: AbortSignal | undefined;
  const pending: EditorAgentRunner = async (...args) => {
    received = args[3];
    return new Response(new ReadableStream({ start() {} }));
  };
  const response = await command(request({ ...local, ctx: ctx(), messages }, controller.signal), true, pending);
  const resultPromise = events(response);
  controller.abort();
  const result = await resultPromise;
  assert.equal(received?.aborted, true);
  assert.ok(result.some((part) => part.type === 'error'));
  assert.ok(!result.some((part) => ['text-delta', 'finish'].includes(part.type)));
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  assert.equal((await copilot(request({ ...local, prompt: 'Test' }, alreadyAborted.signal), true, pending)).status, 408);
  const inlineAbort = new AbortController();
  const interrupted = await copilot(request({ ...local, prompt: 'Test' }, inlineAbort.signal), true, async (...args) => {
    const response = await pending(...args);
    queueMicrotask(() => inlineAbort.abort());
    return response;
  });
  assert.equal(interrupted.status, 408);
  assert.equal(received?.aborted, true);
});

test('copilot returns Plate text JSON, forwards instructions, bounds output and preserves 0', async () => {
  const result = await copilot(request({ ...local, prompt: 'The result is', instructions: 'Custom instruction.' }), true,
    runner(' very useful. More content!'));
  assert.deepEqual(await result.json(), { text: ' very useful.' });
  assert.match(calls.at(-1)![1][0].content, /Custom instruction\.[\s\S]*The result is/);
  assert.deepEqual(calls.at(-1)![6], { model: 'gpt-5.4', effort: 'high' });
  for (const answer of ['0', 'word '.repeat(80) + '.', 'a'.repeat(350) + '.', 'No punctuation']) {
    const response = await copilot(request({ ...local, prompt: 'Test', system: 'Legacy system' }), true, runner(answer));
    assert.deepEqual(await response.json(), { text: '0' });
    assert.match(calls.at(-1)![1][0].content, /Legacy system/);
  }
  const empty = await copilot(request({ ...local, prompt: '' }), true, async () => { assert.fail('Empty prompt must not start an agent'); });
  assert.deepEqual(await empty.json(), { text: '0' });
  const partialWord = await copilot(request({ ...local, prompt: 'Scien' }), true, runner('tific.\n'));
  assert.deepEqual(await partialWord.json(), { text: 'tific.' });
});

test('localhost whitelist only permits exact loopback addresses or explicit remote override', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLocalAgentAddress(address, ''), true);
  for (const address of [undefined, '', 'localhost', '192.168.1.10', '127.0.0.2', '::ffff:192.168.1.10']) {
    assert.equal(isLocalAgentAddress(address, ''), false);
    assert.equal(isLocalAgentAddress(address, 'true'), false);
    assert.equal(isLocalAgentAddress(address, '1'), true);
  }
});

test('absent mode and explicit API mode retain API-key errors without starting agents', async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    for (const handler of [command, copilot]) {
      for (const aiMode of [undefined, 'api']) {
        const response = await handler(request({ aiMode, aiConfig: { provider: 'openai', model: 'gpt-4o', apiKey: '' }, ctx: ctx(), messages, prompt: 'Test' }), false,
          async () => { assert.fail('API mode must not start an agent'); });
        assert.equal(response.status, 401);
        assert.match((await response.json()).error, /key/i);
      }
    }
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved;
  }
});

test('API Copilot exposes SDK text getters as the Plate JSON contract', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    id: 'completion', object: 'chat.completion', created: 1, model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content: ' continued.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
  try {
    const response = await copilot(request({
      aiMode: 'api', prompt: 'Text', instructions: 'Continue the sentence.',
      aiConfig: { provider: 'compatible', model: 'test-model', baseURL: 'http://provider.invalid/v1', apiKey: '' },
    }), false, async () => { assert.fail('API mode must not start an agent'); });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: ' continued.' });
  } finally { globalThis.fetch = originalFetch; }
});
