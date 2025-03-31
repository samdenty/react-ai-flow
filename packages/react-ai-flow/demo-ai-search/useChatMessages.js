import { useState, useCallback } from 'react';

const MOCK_RESPONSES = {
  'text animations': 'Text animations are visual effects applied to text to make it more engaging. In react-ai-flow, you can use the StaggeredText component to create various animation effects like blur-in, gradient-reveal, bounce-in, and fade-in. These animations can be customized by splitting text into characters, words, lines, or sentences and applying different timing and effects.',
  'react-ai-flow': 'React AI Flow is a library that provides components for creating animated text effects and integrating with AI services. It includes components like StaggeredText for text animations and utilities for working with AI APIs like Anthropic\'s Claude.',
  'default': 'I\'m a demo AI assistant using react-ai-flow\'s text animation capabilities. You can ask me about text animations, the react-ai-flow library, or just chat with me to see the animated text responses in action!'
};

export const useChatMessages = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      let responseText = MOCK_RESPONSES.default;
      const lowerInput = input.toLowerCase();
      
      if (lowerInput.includes('text animation') || lowerInput.includes('animation')) {
        responseText = MOCK_RESPONSES['text animations'];
      } else if (lowerInput.includes('react-ai-flow') || lowerInput.includes('library')) {
        responseText = MOCK_RESPONSES['react-ai-flow'];
      }
      
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: responseText }
      ]);
    } catch (err) {
      console.error('Error in chat:', err);
      setError('An error occurred while sending your message. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    clearMessages,
  };
};
