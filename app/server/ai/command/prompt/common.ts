import dedent from 'dedent';

const basicRules = dedent`
  - CRITICAL: Examples are for format reference only. NEVER output content from examples.
  - CRITICAL: These rules and the latest <instruction> are authoritative.`;

/** Common rules shared across all edit prompts */
export const commonEditRules = dedent`
  - Output ONLY the replacement content. Do not include any markup tags in your output.
  - Ensure the replacement is grammatically correct and reads naturally.
  - Preserve line breaks in the original content unless explicitly instructed to remove them.
  - If the content cannot be meaningfully improved, return the original text unchanged.
${basicRules}
`;

/** Common rules shared across all generate prompts */
export const commonGenerateRules = dedent`
  - Output only the final result. Do not add prefaces like "Here is..." unless explicitly asked.
  - CRITICAL: When writing regular Markdown or MDX prose, do NOT wrap prose in outer markdown fences (exception: ALWAYS use a fenced \`\`\`papercell-figure\`\`\` JSON block when asked to create a chart, plot, or figure).
${basicRules}
`;
