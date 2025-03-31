import { Anthropic } from '@anthropic-ai/sdk';

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { prompt, model } = await req.json();

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const response = await anthropic.messages.create({
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      stream: false,
    });

    const content = response.content && response.content[0];
    const text = content && 'text' in content ? content.text : '';
    
    return new Response(
      JSON.stringify({ 
        text: text 
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error in completion API:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred during the completion request' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
