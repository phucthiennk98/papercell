

import { generateText } from 'ai';
import { readConfig, resolveModel } from '../provider';


export async function POST(req: Request) {
  const body = await req.json();
  const { instructions, prompt, system } = body;

  let model;
  try {
    model = resolveModel(readConfig(body));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 401 });
  }

  try {
    const result = await generateText({
      abortSignal: req.signal,
      instructions: instructions ?? system,
      maxOutputTokens: 50,
      model,
      prompt,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return Response.json(null, { status: 408 });
    }

    return Response.json(
      { error: 'Failed to process AI request' },
      { status: 500 }
    );
  }
}
