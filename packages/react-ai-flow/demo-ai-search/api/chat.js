import { Anthropic } from '@anthropic-ai/sdk';

export async function POST(req) {
  try {
    const { messages, model } = await req.json();

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
    });
    
    let responseText = 'No response text';
    if (response.content && response.content.length > 0) {
      const content = response.content[0];
      if (content && typeof content === 'object' && 'type' in content && content.type === 'text' && 'text' in content) {
        responseText = content.text;
      }
    }
    
    return new Response(JSON.stringify({ 
      text: responseText,
      id: response.id
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred during the chat request' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
