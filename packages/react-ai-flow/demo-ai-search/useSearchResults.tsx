import { useState, useCallback } from 'react';
import { useCompletion } from 'ai/react';

export function useSearchResults() {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { complete, completion, isLoading, stop } = useCompletion({
    api: '/api/completion',
    body: {
      model: 'claude-3-haiku-20240307', // Using a more efficient model for the demo
    },
    onResponse: () => {
      setError(null);
    },
    onFinish: (_, completion) => {
      const paragraphs = completion.split('\n\n').filter(p => p.trim().length > 0);
      setResults(paragraphs);
    },
    onError: (err) => {
      console.error('Error searching:', err);
      setError('An error occurred while searching. Please try again later.');
      setResults([]);
    },
  });

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setQuery(searchQuery);
    setError(null);
    
    try {
      await complete(`<search>
You are Claude, an AI assistant by Anthropic. You're helping with a search demo.
Please provide 5 detailed paragraphs about the following topic, with each paragraph separated by a blank line.
Make each paragraph informative and engaging.

Topic: ${searchQuery}
</search>`);
    } catch (err) {
      console.error('Error searching:', err);
      setError('An error occurred while searching. Please try again later.');
      setResults([]);
    }
  }, [complete]);

  const clearResults = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
    stop();
  }, [stop]);

  return {
    query,
    results,
    isLoading,
    error,
    search,
    clearResults,
    completion,
  };
}
