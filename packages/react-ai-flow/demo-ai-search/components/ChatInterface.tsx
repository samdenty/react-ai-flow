import { StaggeredText } from '../../src/index.js';
import { useChatMessages } from '../useChatMessages.js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.js';

export default function ChatInterface() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    clearMessages,
  } = useChatMessages();

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>AI Chat</CardTitle>
        <CardDescription>Chat with Claude AI using react-ai-flow animations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col h-full">
          <div className="flex-grow overflow-y-auto mb-4 max-h-[400px]">
            {messages.length === 0 ? (
              <div className="text-gray-500 italic">
                Send a message to start chatting...
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message: { role: string; content: string }, index: number) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-100 ml-12'
                        : 'bg-gray-100 mr-12'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <StaggeredText>{message.content}</StaggeredText>
                    ) : (
                      message.content
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="p-3 rounded-lg bg-gray-100 mr-12">
                    <div className="animate-pulse">Thinking...</div>
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="text-red-500 mt-2">
                {error}
              </div>
            )}
          </div>
          
          <form 
            onSubmit={handleSubmit}
            className="flex space-x-2"
          >
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Type your message..."
              className="flex-grow p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearMessages}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
