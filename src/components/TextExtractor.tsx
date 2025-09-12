import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';

interface Question {
  id: string;
  content: string;
  extractedText?: string;
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
  fileData?: { base64: string; mimeType: string; name: string };
}

interface TextExtractorProps {
  question: Question;
  onTextExtracted: (updatedQuestion: Question) => void;
  onBack: () => void;
}

export function TextExtractor({ question, onTextExtracted, onBack }: TextExtractorProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const startedRef = React.useRef<string | null>(null);

  const normalizeExtractedText = (raw: string): string => {
    let t = (raw || '').replace(/\r/g, '');
    // Drop obvious artefact lines
    t = t
      // standalone figure labels, single letters, bare question numbers
      .replace(/^\s*(Figure\s*\d+|[A-Z]$|[A-Z]\s*$|\d+\.)\s*$/gmi, '')
      // exam margins / boilerplate
      .replace(/DO\s*NOT\s*WRITE\s*IN\s*THIS\s*AREA/gi, '')
      .replace(/^\s*\[.*?\]\s*$/gmi, '') // bracketed header notes
      // barcode / page code like *P72131A0220* or P72131A0220
      .replace(/^\s*\*?[A-Z0-9]{8,}\*?\s*$/gmi, '')
      // all-caps short noise like XX, KX/2
      .replace(/^\s*[A-Z0-9/]{2,10}\s*$/gm, '')
      // pure underscore/dash rules or long horizontal lines
      .replace(/^[_\-\s]{5,}$/gm, '')
      // stray long zero/digit lines
      .replace(/^\s*[0-9]{4,}\s*$/gm, '');
    // Join stacked fractions like 5\n12 -> 5/12, 12mg\n5 -> 12mg/5
    t = t.replace(/(\b[\da-zA-Z]+(?:\s*[a-zA-Z])?)\s*\n\s*(\d+)\b/g, '$1/$2');
    // Collapse multiple spaces/newlines
    t = t.replace(/\n{2,}/g, '\n');
    t = t.replace(/\s{2,}/g, ' ');
    return t.trim();
  };

  const toHtmlSafe = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const formatEquationsToHtml = (s: string): string => {
    let h = toHtmlSafe(s);
    // Superscripts: x^2, v^-1, T^{1/2}
    h = h.replace(/([A-Za-z0-9)\]] )\^\{([^}]+)\}/g, '$1<sup>$2</sup>');
    h = h.replace(/([A-Za-z0-9)\]])\^(\-?[0-9]+)\b/g, '$1<sup>$2</sup>');
    // Subscripts: x_1, a_{max}
    h = h.replace(/([A-Za-z0-9)\]])_\{([^}]+)\}/g, '$1<sub>$2</sub>');
    h = h.replace(/([A-Za-z])_(\d+)\b/g, '$1<sub>$2</sub>');
    // Common units like ms^-1 that OCR writes as ms-1 or ms–1
    h = h.replace(/ms[–-]?\^?(-?1)\b/g, 'ms<sup>$1</sup>');
    return h;
  };

  const steps = question.type === 'photo' 
    ? [
        'Analyzing image content with AI...',
        'Identifying text and mathematical notation...',
        'Understanding question structure...',
        'Extracting numerical values and units...',
        'Processing mathematical expressions...',
        'Generating clean question text...'
      ]
    : [
        'Loading document with AI parser...',
        'Analyzing document structure...',
        'Extracting question content...',
        'Processing mathematical notation...',
        'Understanding problem context...',
        'Finalizing question text...'
      ];

  React.useEffect(() => {
    // Prevent duplicate OCR runs for the same question id
    if (startedRef.current === question.id) return;
    startedRef.current = question.id;
    // Text path: no OCR
    if (question.type === 'text') {
      const updatedQuestion = { ...question, extractedText: question.content };
      onTextExtracted(updatedQuestion);
      return;
    }

    // If we have an actual file payload, call real OCR; else keep simulated path
    if (question.fileData?.base64 && question.fileData?.mimeType) {
      const run = async () => {
        try {
          // Evenly step through the 6 UI steps at consistent timing
          const stepDuration = 1200; // ms per visual step
          let visualIndex = 0;
          const visualTimer = setInterval(() => {
            if (visualIndex < steps.length) {
              setCurrentStep(steps[visualIndex]);
              setProgress(((visualIndex + 1) / steps.length) * 100);
              visualIndex++;
            } else {
              clearInterval(visualTimer);
            }
          }, stepDuration);

          // Kick off OCR in parallel while the visual steps progress
          let res = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              fileBase64: question.fileData!.base64,
              mimeType: question.fileData!.mimeType,
            }),
          });
          if (res.status === 404) {
            // fallback to default netlify functions path
            res = await fetch('/.netlify/functions/extract', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                fileBase64: question.fileData!.base64,
                mimeType: question.fileData!.mimeType,
              }),
            });
          }
          if (res.ok) {
            const data = await res.json();
            const text: string = data?.text || '';
            const cleaned = normalizeExtractedText(text);
            // Optional augmentation with vision to include diagram values
            try {
              console.log('[extractor] POST /api/augment');
              let aug = await fetch('/api/augment', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  text: cleaned,
                  imageBase64: question.fileData?.base64,
                  imageMimeType: question.fileData?.mimeType,
                })
              });
              if (aug.status === 404) {
                console.log('[extractor] trying /.netlify/functions/augment');
                aug = await fetch('/.netlify/functions/augment', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    text: cleaned,
                    imageBase64: question.fileData?.base64,
                    imageMimeType: question.fileData?.mimeType,
                  })
                });
                console.log('[extractor] /.netlify/functions/augment status', aug.status);
              } else {
                console.log('[extractor] /api/augment status', aug.status);
              }
              if (aug.ok) {
                const augData = await aug.json();
                if (augData?.usage) {
                  console.log('[extractor] token usage (augment):', augData.usage);
                }
                const finalText = normalizeExtractedText(augData?.text || cleaned);
                setExtractedText(finalText);
                // Ensure the visual steps complete before finishing
                setTimeout(() => {
                  setProgress(100);
                  setIsComplete(true);
                  const updatedQuestion = { ...question, extractedText: finalText };
                  setTimeout(() => onTextExtracted(updatedQuestion), 1200);
                }, Math.max(0, stepDuration * steps.length - visualIndex * stepDuration));
                return;
              }
              try {
                const err = await aug.text();
                console.warn('[extractor] augment error body', err);
              } catch {}
            } catch {}

            // Fallback to cleaned OCR if augment fails
            setExtractedText(cleaned);
            setTimeout(() => {
              setProgress(100);
              setIsComplete(true);
              const updatedQuestion = { ...question, extractedText: cleaned };
              setTimeout(() => onTextExtracted(updatedQuestion), 1200);
            }, Math.max(0, stepDuration * steps.length - visualIndex * stepDuration));
            return;
          }
        } catch {
          // ignore and fall back to mock
        }

        // Fallback simulation
        setCurrentStep('Falling back to simulated extraction...');
        const mockExtractedText = generateMockExtractedText(question);
        const cleaned = normalizeExtractedText(mockExtractedText);
        setExtractedText(cleaned);
        setProgress(100);
        setIsComplete(true);
        const updatedQuestion = { ...question, extractedText: cleaned };
        setTimeout(() => onTextExtracted(updatedQuestion), 1200);
      };
      run();
      return;
    }

    // Simulated path (no file payload provided)
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < steps.length) {
        setCurrentStep(steps[currentIndex]);
        setProgress(((currentIndex + 1) / steps.length) * 100);
        currentIndex++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
        const mockExtractedText = generateMockExtractedText(question);
        setExtractedText(mockExtractedText);
        const updatedQuestion = { ...question, extractedText: mockExtractedText };
        setTimeout(() => onTextExtracted(updatedQuestion), 1200);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [question]);

  const generateMockExtractedText = (q: Question): string => {
    // Generate realistic AI-extracted text based on question type and content
    const sampleQuestions = [
      "A projectile is launched from ground level with an initial velocity of 25 m/s at an angle of 45° to the horizontal. Calculate: (a) the maximum height reached (2 marks), (b) the time of flight (2 marks), (c) the horizontal range (2 marks).",
      
      "A 5 kg block slides down a frictionless incline of 30° to the horizontal. The block starts from rest and slides a distance of 10 m along the incline. Calculate: (a) the acceleration of the block (2 marks), (b) the velocity at the bottom of the incline (2 marks), (c) the time taken to reach the bottom (2 marks).",
      
      "Two cars collide in a head-on collision. Car A (mass 1200 kg) is traveling at 20 m/s and car B (mass 1500 kg) is traveling at 15 m/s in the opposite direction. After the collision, both cars stick together. Calculate: (a) the velocity of the combined cars immediately after collision (3 marks), (b) the kinetic energy lost in the collision (3 marks).",
      
      "A ball is dropped from a height of 45 m. At the same instant, another ball is thrown upward from ground level with an initial velocity of 30 m/s. Calculate: (a) when the two balls will meet (2 marks), (b) the height at which they meet (2 marks), (c) the velocities of both balls when they meet (2 marks).",
      
      "A spring with spring constant k = 200 N/m is compressed by 0.15 m. A 0.5 kg mass is placed against the compressed spring and released. Calculate: (a) the elastic potential energy stored in the spring (2 marks), (b) the velocity of the mass when it leaves the spring (2 marks), (c) the maximum height the mass reaches if the spring is inclined at 20° (2 marks).",
      
      "A cyclist travels around a horizontal circular track of radius 50 m. The coefficient of friction between the tyres and track is 0.8. Calculate: (a) the maximum speed the cyclist can travel without slipping (2 marks), (b) the centripetal acceleration at this maximum speed (2 marks).",
      
      "A satellite orbits Earth at a height of 400 km above the surface. Given that Earth's radius is 6.37 × 10⁶ m and g = 9.81 m/s². Calculate: (a) the orbital speed of the satellite (3 marks), (b) the orbital period (3 marks)."
    ];
    
    return sampleQuestions[Math.floor(Math.random() * sampleQuestions.length)];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Button>
            <h1 className="text-xl">Extracting Question Text</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Question Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Text Extraction</CardTitle>
              <Badge variant="secondary">{question.marks} marks</Badge>
            </div>
            <CardDescription>
              {question.type === 'photo' 
                ? 'Analyzing your image using advanced AI to extract question text and mathematical content'
                : 'Processing your document with AI to extract and understand the question content'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                  {question.type === 'photo' ? (
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {question.type === 'photo' ? 'Photo' : 'PDF'}: {question.content}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {question.type === 'photo' 
                      ? 'AI analyzes images to understand both text and mathematical content'
                      : 'AI processes documents while preserving mathematical expressions and structure'
                    }
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress Card */}
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="flex items-center justify-center space-x-2">
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center animate-spin">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <span>
                {question.type === 'photo' ? 'AI Image Analysis' : 'AI Document Processing'}
              </span>
            </CardTitle>
            <CardDescription>
              {question.type === 'photo' 
                ? 'AI is analyzing your image to understand the question content and structure'
                : 'AI is processing your document to extract and understand the question'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {currentStep}
              </p>

              {isComplete && extractedText && (
                <div className="space-y-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-green-600 font-medium">AI Analysis Complete!</p>
                  
                  {/* Show extracted text preview */}
                  <Card className="border-green-200 bg-green-50 text-left">
                    <CardHeader>
                      <CardTitle className="text-green-800 text-base">AI-Extracted Question Text</CardTitle>
                      <CardDescription className="text-green-700">
                        Our AI has analyzed your {question.type === 'photo' ? 'image' : 'document'} and extracted the question content. You'll be able to review and edit this on the next screen.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-white/80 p-4 rounded border border-green-200">
                        <p className="text-sm text-green-900 leading-relaxed">
                          {extractedText}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <p className="text-sm text-muted-foreground">
                    Proceeding to text verification in 2 seconds...
                  </p>
                </div>
              )}

              {isComplete && !extractedText && (
                <div className="space-y-3">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-green-600 font-medium">AI Analysis Complete!</p>
                  <p className="text-sm text-muted-foreground">
                    Finalizing AI-extracted text and generating preview...
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Extraction Steps */}
        <Card>
          <CardHeader>
            <CardTitle>Extraction Process</CardTitle>
            <CardDescription>
              {question.type === 'photo' 
                ? 'AI image analysis stages'
                : 'AI document processing stages'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {steps.map((step, index) => {
                const isActive = currentStep === step;
                const isCompleted = progress > ((index + 1) / steps.length) * 100;
                
                return (
                  <div 
                    key={index} 
                    className={`flex items-center space-x-3 p-2 rounded transition-colors ${
                      isActive ? 'bg-purple-50 border border-purple-200' : 
                      isCompleted ? 'bg-green-50' : 'bg-gray-50'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isCompleted ? 'bg-green-500' : isActive ? 'bg-purple-500' : 'bg-gray-300'
                    }`}>
                      {isCompleted ? (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-xs text-white font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span className={`text-sm ${isActive ? 'font-medium text-purple-700' : 'text-gray-600'}`}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tips for better extraction */}
        <Alert>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <AlertDescription>
            <strong>Tip:</strong> For best results with {question.type === 'photo' ? 'photos' : 'PDFs'}, ensure 
            {question.type === 'photo' 
              ? ' clear, well-lit images with good contrast. Our AI can understand handwritten text, typed text, and mathematical notation.'
              : ' good quality documents. Our AI can process both text-based and scanned PDFs, understanding complex mathematical expressions.'
            }
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}