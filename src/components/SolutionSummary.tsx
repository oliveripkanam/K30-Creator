import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

interface Question {
  id: string;
  content: string;
  extractedText?: string;
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
}

interface SolutionSummary {
  finalAnswer: string;
  unit: string;
  workingSteps: string[];
  keyFormulas: string[];
}

interface SolutionSummaryProps {
  originalQuestion: Question;
  solution: SolutionSummary;
  onComplete: () => void;
  onBack: () => void;
  onSeeReview?: () => void;
}

export function SolutionSummaryComponent({ originalQuestion, solution, onComplete, onBack, onSeeReview }: SolutionSummaryProps) {
  // Calculate tokens earned (similar to App.tsx logic)
  const calculateTokensEarned = () => {
    const baseTokens = originalQuestion.marks * 10;
    const timeBonus = 30; // Mock time bonus
    const mcqBonus = solution.workingSteps.length * 5;
    return baseTokens + timeBonus + mcqBonus;
  };

  const tokensEarned = calculateTokensEarned();
  // Read score from previous screen if available
  let lastScore: { correct: number[]; wrong: number[] } = { correct: [], wrong: [] };
  try { lastScore = (window as any).__k30_lastScore || lastScore; } catch {}
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
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
            <h1 className="text-xl">Complete Solution</h1>
          </div>
          <Badge variant="default" className="bg-green-600">
            Solution Complete!
          </Badge>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Celebration Header */}
        <Card className="border-green-200 bg-green-50 text-center">
          <CardContent className="pt-6">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-green-800 mb-2">Excellent Work!</h2>
            <p className="text-green-700 mb-4">You've successfully worked through the complete solution step by step.</p>
            
            {/* Tokens Earned Display */}
            <div className="bg-white/80 rounded-lg p-4 border border-green-300">
              <div className="flex items-center justify-center space-x-2">
                <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="text-2xl font-bold text-yellow-600">+{tokensEarned}</span>
                <span className="text-lg text-yellow-700">Tokens Earned!</span>
              </div>
              <p className="text-sm text-green-600 text-center mt-2">
                {originalQuestion.marks * 10} base + {30} time bonus + {solution.workingSteps.length * 5} step bonus
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Original Question */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Original Question
              <Badge variant="secondary">{originalQuestion.marks} marks</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-lg">
              {originalQuestion.type !== 'text' && (
                <div className="mb-3 pb-3 border-b border-gray-200">
                  <p className="text-xs text-muted-foreground mb-1">Source:</p>
                  <p className="text-xs">{originalQuestion.content}</p>
                </div>
              )}
              <div>
                {originalQuestion.type !== 'text' && (
                  <p className="text-xs text-muted-foreground mb-2">AI-Extracted Question Text:</p>
                )}
                <p className="leading-relaxed">
                  {originalQuestion.extractedText || originalQuestion.content}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Final Answer */}
        <Card className="border-2 border-green-300 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Final Answer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              {(() => {
                // Clean up cases where finalAnswer is a comma-joined list of options
                const text = String(solution.finalAnswer || '').trim();
                const looksLikeMCQDump = /^\d+\s*:\s*/.test(text);
                const display = looksLikeMCQDump ? text.replace(/^(\d+\s*:\s*)/,'').trim() : text;
                const unit = (solution.unit || '').trim();
                return (
                  <>
                    <div className="text-4xl font-bold text-green-800 mb-2 break-words">
                      {display || 'Answer available in working'}
                    </div>
                    {unit && (
                      <div className="text-lg text-green-700">{unit}</div>
                    )}
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Complete Working */}
        <Card>
          <CardHeader>
            <CardTitle>Complete Working</CardTitle>
            <CardDescription>Step-by-step solution breakdown</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {solution.workingSteps.map((step, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-blue-700">{index + 1}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-mono bg-gray-50 p-3 rounded border">{step}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Key Formulas Used */}
        <Card>
          <CardHeader>
            <CardTitle>Key Formulas Used</CardTitle>
            <CardDescription>Important equations for this type of problem</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {solution.keyFormulas.map((formula, index) => (
                <div key={index} className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <code className="text-blue-800 font-medium">{formula}</code>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Success Summary */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-800">Learning Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-700">{originalQuestion.marks}</div>
                <div className="text-sm text-blue-600">Marks Earned</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-700">{solution.workingSteps.length}</div>
                <div className="text-sm text-blue-600">Steps Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-700">{solution.keyFormulas.length}</div>
                <div className="text-sm text-blue-600">Formulas Applied</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{tokensEarned}</div>
                <div className="text-sm text-yellow-600">Tokens Earned</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Answer Accuracy */}
        <Card>
          <CardHeader>
            <CardTitle>Answer Accuracy</CardTitle>
            <CardDescription>Which steps you got right and wrong</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <h4 className="text-sm font-medium text-green-800 mb-2">Correct Steps</h4>
                {lastScore.correct.length ? (
                  <div className="flex flex-wrap gap-2">
                    {lastScore.correct.map((s) => (
                      <span key={`c-${s}`} className="px-2 py-1 text-xs rounded bg-green-100 text-green-800 border border-green-300">Step {s}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-green-700">No steps marked correct.</p>
                )}
              </div>
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <h4 className="text-sm font-medium text-red-800 mb-2">Incorrect Steps</h4>
                {lastScore.wrong.length ? (
                  <div className="flex flex-wrap gap-2">
                    {lastScore.wrong.map((s) => (
                      <span key={`w-${s}`} className="px-2 py-1 text-xs rounded bg-red-100 text-red-800 border border-red-300">Step {s}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-red-700">Great job — none marked wrong.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-center space-x-4 pt-4">
          <Button variant="outline" onClick={() => onSeeReview && onSeeReview()}>
            See How You Did
          </Button>
          <Button onClick={onComplete} className="px-8">
            Return to Dashboard
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}