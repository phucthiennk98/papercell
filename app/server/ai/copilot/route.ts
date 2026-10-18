

import { createGateway, generateText } from 'ai';


export async function POST(req: Request) {
  const {
    apiKey: key,
    instructions,
    model = 'gpt-4o-mini',
    prompt,
    system,
  } = await req.json();

  const apiKey = typeof key === 'string' ? key.trim() : '';

  if (!apiKey) {
    return Response.json(
      { error: 'Missing ai gateway API key.' },
      { status: 401 }
    );
  }

  const gateway = createGateway({ apiKey });

  try {
    const result = await generateText({
      abortSignal: req.signal,
      instructions: instructions ?? system,
      maxOutputTokens: 50,
      model: gateway(`openai/${model}`),
      prompt,
      temperature: 0.7,
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
