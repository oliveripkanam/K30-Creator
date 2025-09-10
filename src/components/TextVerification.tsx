import React, { useState } from 'react';
import { Button } from './ui/button';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';

interface Question {
  id: string;
  content: string;
  extractedText?: string;
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
}

interface TextVerificationProps {
  question: Question;
  onVerified: (verifiedQuestion: Question) => void;
  onBack: () => void;
}

export function TextVerification({ question, onVerified, onBack }: TextVerificationProps) {
  const [extractedText, setExtractedText] = useState(question.extractedText || '');
  const [hasChanges, setHasChanges] = useState(false);

  const handleTextChange = (newText: string) => {
    setExtractedText(newText);
    setHasChanges(newText !== (question.extractedText || ''));
  };

  const handleConfirm = () => {
    const verifiedQuestion: Question = {
      ...question,
      extractedText: extractedText.trim()
    };
    onVerified(verifiedQuestion);
  };

  const handleReset = () => {
    setExtractedText(question.extractedText || '');
    setHasChanges(false);
  };

  const isValid = extractedText.trim().length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100">
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
            <h1 className="text-xl">Verify Extracted Text</h1>
          </div>
          <Badge variant="secondary">{question.marks} marks</Badge>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Instructions */}
        <Alert>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <AlertDescription>
            <strong>Please review the extracted text below.</strong> Make sure it accurately represents your question. 
            You can edit the text if needed to correct any AI extraction errors or add missing information.
          </AlertDescription>
        </Alert>

        {/* Original Source */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {question.type === 'photo' && (
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
              {question.type === 'file' && (
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              <span>Original Source</span>
            </CardTitle>
            <CardDescription>
              The {question.type === 'photo' ? 'image' : 'document'} you uploaded
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">File:</p>
              <p className="text-sm">{question.content}</p>
            </div>
          </CardContent>
        </Card>

        {/* Extracted Text Editor */}
        <Card className="border-2 border-amber-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-amber-800 flex items-center space-x-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Extracted Question Text</span>
                </CardTitle>
                <CardDescription className="text-amber-700">
                  Review and edit the text below. This will be used to generate your step-by-step questions.
                </CardDescription>
              </div>
              {hasChanges && (
                <Badge variant="outline" className="border-orange-300 text-orange-700">
                  Modified
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Question Text</label>
                <div className="flex space-x-2">
                  {hasChanges && (
                    <Button variant="outline" size="sm" onClick={handleReset}>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Reset
                    </Button>
                  )}
                </div>
              </div>
              <Textarea
                value={extractedText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Edit the extracted text here..."
                className="min-h-40 bg-white border-amber-200 focus:border-amber-400"
              />
              <div className="mt-4 text-sm text-muted-foreground">
                <p>Preview (LaTeX):</p>
                <div className="mt-2 p-3 rounded border bg-white max-h-72 overflow-auto">
                  {(() => {
                    const safeHtml = (s: string) => s
                      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const normalizeMath = (s: string) => s
                      .replace(/[–—]/g, '-') // normalize dashes
                      .replace(/\b([A-Za-z0-9]+)\/([A-Za-z0-9]+)\b/g, '\\frac{$1}{$2}') // simple a/b
                      .replace(/\^(\-?\d+)\b/g, '^{$1}')
                      .replace(/_([A-Za-z0-9]+)/g, '_{$1}');
                    const isMathy = (line: string) => /[=^_\\frac]|\b(ms|m|s|kg|N|J|V|A|Pa|mol|Hz)\b/.test(line) || /\d\s*\/\s*\d/.test(line);

                    const lines = extractedText.split(/\n+/);
                    return (
                      <div className="space-y-2">
                        {lines.map((line, idx) => {
                          const trimmed = line.trim();
                          if (!trimmed) return <div key={idx} />;
                          if (isMathy(trimmed)) {
                            try {
                              const html = katex.renderToString(normalizeMath(trimmed), { throwOnError: false, displayMode: true });
                              return <div key={idx} dangerouslySetInnerHTML={{ __html: html }} />;
                            } catch {
                              return <div key={idx} className="font-mono">{trimmed}</div>;
                            }
                          }
                          return <div key={idx}>{safeHtml(trimmed)}</div>;
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex justify-between mt-2">
                <p className="text-xs text-muted-foreground">
                  {extractedText.length} characters
                </p>
                {!isValid && (
                  <p className="text-xs text-destructive">
                    Question text cannot be empty
                  </p>
                )}
              </div>
            </div>

            {/* Text Quality Indicators */}
            <div className="space-y-3">
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Text Quality Check</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className={`p-3 rounded-lg border ${
                    extractedText.length > 50 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {extractedText.length > 50 ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      )}
                      <span className="text-xs font-medium">Length</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {extractedText.length > 50 ? 'Good length' : 'Consider adding more detail'}
                    </p>
                  </div>

                  <div className={`p-3 rounded-lg border ${
                    /\d+\s*(m|kg|s|N|J|W|°|degrees?)/i.test(extractedText) ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {/\d+\s*(m|kg|s|N|J|W|°|degrees?)/i.test(extractedText) ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      )}
                      <span className="text-xs font-medium">Units</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {/\d+\s*(m|kg|s|N|J|W|°|degrees?)/i.test(extractedText) ? 'Units detected' : 'Check for units/values'}
                    </p>
                  </div>

                  <div className={`p-3 rounded-lg border ${
                    /(calculate|find|determine|what|how)/i.test(extractedText) ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <div className="flex items-center space-x-2">
                      {/(calculate|find|determine|what|how)/i.test(extractedText) ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      )}
                      <span className="text-xs font-medium">Task</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {/(calculate|find|determine|what|how)/i.test(extractedText) ? 'Clear task identified' : 'Check task clarity'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Common Issues Help */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Common Issues to Check</CardTitle>
            <CardDescription>
              Review these common AI extraction issues and ensure they're corrected
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Mathematical Symbols</h4>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• Check degree symbols (° or degrees)</li>
                  <li>• Verify subscripts and superscripts</li>
                  <li>• Ensure mathematical operators are correct</li>
                  <li>• Check for π, α, β, θ symbols</li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Numbers & Units</h4>
                <ul className="text-xs space-y-1 text-muted-foreground">
                  <li>• Verify all numerical values</li>
                  <li>• Check units (m, kg, s, N, J, W, etc.)</li>
                  <li>• Ensure decimal points are correct</li>
                  <li>• Check for missing negative signs</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-4">
          <Button variant="outline" onClick={onBack}>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Re-extract Text
          </Button>
          
          <div className="flex space-x-3">
            {hasChanges && (
              <Button variant="outline" onClick={handleReset}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset Changes
              </Button>
            )}
            
            <Button 
              onClick={handleConfirm} 
              disabled={!isValid}
              size="lg"
              className="px-8"
            >
              Text Looks Good - Continue
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}