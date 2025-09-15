import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';

interface ReviewItem {
  step: number;
  question: string;
  options: string[];
  correctAnswer: number;
  userAnswer: number | null;
  hint?: string;
  explanation?: string;
}

interface ReviewPageProps {
  onBackToSummary: () => void;
}

export function ReviewPage({ onBackToSummary }: ReviewPageProps) {
  let items: ReviewItem[] = [];
  try { items = (window as any).__k30_answerLog || []; } catch {}

  const correctCount = items.filter(i => i.userAnswer === i.correctAnswer).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={onBackToSummary}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Summary
            </Button>
            <h1 className="text-xl">Your Answers</h1>
          </div>
          <Badge variant="secondary">{correctCount}/{items.length} correct</Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-4">
        {items.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No steps to review for this session.
            </CardContent>
          </Card>
        ) : (
          items.map((item) => {
            const isCorrect = item.userAnswer === item.correctAnswer;
            return (
              <Card key={item.step} className={isCorrect ? 'border-green-300 bg-green-50' : 'border-red-400 bg-red-50'}>
                <CardHeader>
                  <CardTitle className={isCorrect ? 'text-green-700' : 'text-red-700'}>
                    Step {item.step}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2 flex-wrap">
                    {isCorrect ? (
                      <span className="px-2 py-1 rounded bg-green-100 text-green-800 border border-green-300 text-xs">Correct</span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-red-100 text-red-800 border border-red-400 text-xs">Incorrect</span>
                    )}
                    <span className="px-2 py-1 rounded bg-gray-100 text-gray-800 border border-gray-300 text-xs">Your answer: {item.userAnswer !== null && item.userAnswer !== undefined ? String.fromCharCode(65 + (item.userAnswer as number)) : '-'}</span>
                    <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 border border-blue-300 text-xs">Correct: {String.fromCharCode(65 + item.correctAnswer)}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-white/70 p-3 rounded border">
                    <p className="text-sm font-medium">{item.question}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {item.options.map((opt, idx) => {
                      const isUser = idx === item.userAnswer;
                      const isAns = idx === item.correctAnswer;
                      const base = 'p-2 rounded border text-sm flex items-start gap-2';
                      const cls = isAns
                        ? 'border-2 border-green-600 bg-white'
                        : isUser
                          ? 'border-2 border-red-600 bg-white'
                          : 'border border-gray-200 bg-white';
                      return (
                        <div key={idx} className={`${base} ${cls}`}>
                          <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isAns ? 'bg-white border-2 border-green-600 text-green-700' : isUser ? 'bg-white border-2 border-red-600 text-red-700' : 'bg-gray-100 border border-gray-300 text-gray-800'}`}>
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span>{opt}</span>
                              {isAns && <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-100 text-green-800 border border-green-300">Answer</span>}
                              {isUser && !isAns && <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-800 border border-red-300">Your choice</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {item.explanation && (
                    <div className="bg-white/70 p-3 rounded border">
                      <p className="text-sm"><strong>Why:</strong> {item.explanation}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
        <div className="flex justify-center py-6">
          <Button variant="outline" className="px-8" onClick={onBackToSummary}>
            Back to Summary
          </Button>
        </div>
      </div>
    </div>
  );
}


