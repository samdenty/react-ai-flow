import { useState } from "react";
import {
  StaggerProvider,
  StaggeredText,
} from "../src/index.js";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./components/ui/card.js";
import { Label } from "./components/ui/label.js";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group.js";

const SAMPLE_TEXTS = [
  {
    title: "Welcome to Text Animation Demo",
    content: "This demo showcases the powerful text animation capabilities of react-ai-flow. You can see how different animation styles and text splitting modes create unique visual effects."
  },
  {
    title: "How Text Animations Work",
    content: "Text animations work by splitting text into smaller units (characters, words, lines, or sentences) and applying CSS animations to each unit with a staggered delay."
  },
  {
    title: "Animation Styles",
    content: "Choose from various animation styles like blur-in, gradient-reveal, bounce-in, and fade-in. Each style creates a different visual effect that can enhance your user interface."
  },
  {
    title: "Text Splitting Modes",
    content: "Text can be split by character, word, line, or sentence. The splitting mode determines how granular the animation appears and how the text flows into view."
  },
  {
    title: "Use Cases",
    content: "Text animations can be used for landing pages, chat interfaces, content reveals, storytelling, and anywhere you want to add visual interest to your text content."
  }
];

function AnimatedTextBlock({ title, content }: { 
  title: string; 
  content: string;
}) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm mb-6 max-w-4xl">
      <h3 className="text-xl font-semibold mb-3">
        <StaggeredText>{title}</StaggeredText>
      </h3>
      <div className="text-gray-700">
        <StaggeredText>{content}</StaggeredText>
      </div>
    </div>
  );
}

export function AISearchDemo() {
  const [selectedTextIndex, setSelectedTextIndex] = useState(0);
  const [customText, setCustomText] = useState("");
  const [showCustomText, setShowCustomText] = useState(false);
  const [animationOptions, setAnimationOptions] = useState({
    stagger: "5%",
    animation: "blur-in",
    blurAmount: "5px",
    splitter: "word",
    duration: 1000,
  });

  const handleTextChange = (index: number) => {
    setSelectedTextIndex(index);
    setShowCustomText(false);
  };

  const handleCustomTextSubmit = () => {
    if (customText.trim()) {
      setShowCustomText(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Text Animation Demo</h1>
          <p className="text-gray-600">Explore different text animation effects using react-ai-flow</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Animation Controls</CardTitle>
                <CardDescription>Customize your text animations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <Label className="mb-2 block">Sample Text</Label>
                    <div className="space-y-2">
                      {SAMPLE_TEXTS.map((text, index) => (
                        <div key={index} className="flex items-center">
                          <input
                            type="radio"
                            id={`text-${index}`}
                            name="sampleText"
                            checked={selectedTextIndex === index && !showCustomText}
                            onChange={() => handleTextChange(index)}
                            className="mr-2"
                          />
                          <Label htmlFor={`text-${index}`} className="text-sm truncate">
                            {text.title}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">Custom Text</Label>
                    <textarea
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Enter your own text to animate..."
                      className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                    />
                    <button
                      onClick={handleCustomTextSubmit}
                      disabled={!customText.trim()}
                      className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Animate Custom Text
                    </button>
                  </div>

                  <div>
                    <Label>Animation Style</Label>
                    <RadioGroup
                      value={animationOptions.animation}
                      onValueChange={(value) => 
                        setAnimationOptions({
                          ...animationOptions,
                          animation: value as any,
                        })
                      }
                      className="grid grid-cols-2 gap-2 mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="blur-in" id="blur-in" />
                        <Label htmlFor="blur-in">Blur In</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="gradient-reveal" id="gradient" />
                        <Label htmlFor="gradient">Gradient</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="bounce-in" id="bounce-in" />
                        <Label htmlFor="bounce-in">Bounce In</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="fade-in" id="fade-in" />
                        <Label htmlFor="fade-in">Fade In</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label>Text Split Mode</Label>
                    <RadioGroup
                      value={animationOptions.splitter}
                      onValueChange={(value) => 
                        setAnimationOptions({
                          ...animationOptions,
                          splitter: value as any,
                        })
                      }
                      className="grid grid-cols-2 gap-2 mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="character" id="character" />
                        <Label htmlFor="character">Character</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="word" id="word" />
                        <Label htmlFor="word">Word</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="line" id="line" />
                        <Label htmlFor="line">Line</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sentence" id="sentence" />
                        <Label htmlFor="sentence">Sentence</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <div className="mt-4">
                    <button
                      type="button"
                      className="text-xs px-3 py-2 rounded bg-blue-100 hover:bg-blue-200 transition-colors"
                      onClick={() => {
                        setAnimationOptions({
                          stagger: "5%",
                          animation: "blur-in",
                          blurAmount: "5px",
                          splitter: "word",
                          duration: 1000
                        });
                      }}
                    >
                      Reset to Default
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <StaggerProvider
              {...animationOptions as any}
            >
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>
                    {showCustomText ? "Custom Text Animation" : SAMPLE_TEXTS[selectedTextIndex]?.title || "Text Animation"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[70vh] overflow-y-auto relative">
                    {showCustomText ? (
                      <AnimatedTextBlock 
                        title="Custom Text" 
                        content={customText}
                      />
                    ) : (
                      <AnimatedTextBlock 
                        title={SAMPLE_TEXTS[selectedTextIndex]?.title || "Text Animation"}
                        content={SAMPLE_TEXTS[selectedTextIndex]?.content || "Sample text content for animation demonstration."}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            </StaggerProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
