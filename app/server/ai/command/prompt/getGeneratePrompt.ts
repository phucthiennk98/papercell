import type { ChatMessage } from '@/components/editor/use-chat';
import type { SlateEditor } from 'platejs';

import dedent from 'dedent';

import {
  addSelection,
  buildStructuredPrompt,
  formatTextFromMessages,
  getLastUserInstruction,
  getMarkdownWithSelection,
  isMultiBlocks,
} from '../utils';
import { commonGenerateRules } from './common';

const figureRule = `- When the instruction asks to create, add, or insert a chart, plot, map, table, or figure from data, output a fenced \`\`\`papercell-figure\`\`\` JSON block with keys "caption", "spec" (optional: {"data","type","x","y","color","agg","xLabel","yLabel","scheme"}), "params" (array of interactive controls/sliders: [{"name","label","kind","min","max","step","value","unit"}]), "js" (Observable Plot / D3 function body that reads data.<dataset> and parameter variables directly and MUST end with \`return Plot.plot({ width, ... })\` or \`return pc.map({ ... })\`), and "python".`;

const figureExample = dedent`
  <instruction>
  Create an interactive bar chart of trips by hour from the trips dataset
  </instruction>

  <output>
  \`\`\`papercell-figure
  {
    "caption": "Trip distribution by hour of day within the selected station radius.",
    "params": [
      {
        "name": "ban_kinh_km",
        "label": "Radius around station",
        "kind": "range",
        "min": 0.2,
        "max": 3,
        "step": 0.1,
        "value": 1.5,
        "unit": "km"
      }
    ],
    "js": "const rows = (data.trips ?? []).filter(d => d.khoang_cach_km <= ban_kinh_km);\\nexpose(rows.length);\\nreturn Plot.plot({\\n  width,\\n  height: 260,\\n  x: { label: \\"Hour\\" },\\n  y: { label: \\"Trips\\", grid: true },\\n  marks: [\\n    Plot.barY(rows, Plot.groupX({ y: \\"count\\" }, { x: \\"gio\\", fill: \\"#2a78d6\\", tip: true })),\\n    Plot.ruleY([0])\\n  ]\\n});",
    "python": "trips = data[\\"trips\\"]\\nket_qua = int((trips.khoang_cach_km <= ban_kinh_km).sum())"
  }
  \`\`\`
  </output>
`;

function buildGenerateFreeformPrompt(messages: ChatMessage[], docData?: string) {
  return buildStructuredPrompt({
    context: docData?.trim() ? docData.trim() : undefined,
    examples: [
      dedent`
        <instruction>
        Write a paragraph about AI ethics
        </instruction>

        <output>
        AI ethics is a critical field that examines the moral implications of artificial intelligence systems. As AI becomes more prevalent in decision-making processes, questions arise about fairness, transparency, and accountability.
        </output>
      `,
      dedent`
        <instruction>
        Write three tips for better sleep
        </instruction>

        <output>
        1. Maintain a consistent sleep schedule.
        2. Create a relaxing bedtime routine and avoid screens before sleep.
        3. Keep your bedroom cool, dark, and quiet.
        </output>
      `,
      figureExample,
    ],
    history: formatTextFromMessages(messages),
    instruction: getLastUserInstruction(messages),
    rules: dedent`
      ${commonGenerateRules}
      ${figureRule}
    `,
    task: dedent`
      You are an advanced content and scientific figure generation assistant in Papercell.
      Generate content or interactive Papercell figures based on the user's instructions and available datasets in <context>.
      Directly produce the final result without asking for additional information.
    `,
  });
}

function buildGenerateContextPrompt(
  editor: SlateEditor,
  messages: ChatMessage[],
  docData?: string
) {
  if (!isMultiBlocks(editor)) {
    addSelection(editor);
  }

  const selectingMarkdown = getMarkdownWithSelection(editor);
  const fullContext = docData?.trim()
    ? `${selectingMarkdown}\n\n${docData.trim()}`
    : selectingMarkdown;

  return buildStructuredPrompt({
    context: fullContext,
    examples: [
      dedent`
        <instruction>
        Summarize the following text.
        </instruction>

        <context>
        Artificial intelligence has transformed multiple industries, from healthcare to finance, improving efficiency and enabling data-driven decisions.
        </context>

        <output>
        AI improves efficiency and decision-making across many industries.
        </output>
      `,
      dedent`
        <instruction>
        Generate a comparison table of the tools mentioned.
        </instruction>

        <context>
        Tool A: free, simple UI
        Tool B: paid, advanced analytics
        </context>

        <output>
        | Tool | Pricing | Features |
        |------|---------|----------|
        | A | Free | Simple UI |
        | B | Paid | Advanced analytics |
        </output>
      `,
      figureExample,
    ],
    history: formatTextFromMessages(messages),
    instruction: getLastUserInstruction(messages),
    rules: dedent`
      ${commonGenerateRules}
      ${figureRule}
      - DO NOT remove or alter custom MDX tags such as <u>, <callout>, <kbd>, <toc>, <sub>, <sup>, <mark>, <del>, <date>, <span>, <column>, <column_group>, <file>, <audio>, <video> unless explicitly requested.
      - Preserve indentation and line breaks when editing within columns or structured layouts.
      - <Selection> tags are input-only markers. They must NOT appear in the output.
    `,
    task: dedent`
      You are an advanced content and scientific figure generation assistant in Papercell.
      Generate content or interactive Papercell figures based on the user's instructions, using <context> as source material.
      If the instruction requests creation or transformation (e.g., summarize, translate, rewrite, create a table, create a figure), directly produce the final result.
      Do not ask the user for additional content.
    `,
  });
}

export function getGeneratePrompt(
  editor: SlateEditor,
  {
    docData,
    isSelecting,
    messages,
  }: { docData?: string; isSelecting: boolean; messages: ChatMessage[] }
) {
  // Freeform generation: open-ended creation without context
  if (!isSelecting) {
    return buildGenerateFreeformPrompt(messages, docData);
  }
  // Context-based generation: use selected text as context
  return buildGenerateContextPrompt(editor, messages, docData);
}
