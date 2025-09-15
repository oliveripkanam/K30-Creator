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
              <Card key={item.step} className={isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                <CardHeader>
                  <CardTitle className={isCorrect ? 'text-green-700' : 'text-red-700'}>
                    Step {item.step}
                  </CardTitle>
                  <CardDescription>
                    {isCorrect ? 'Correct' : 'Incorrect'} — Correct answer is {String.fromCharCode(65 + item.correctAnswer)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-white/70 p-3 rounded border">
                    <p className="text-sm font-medium">{item.question}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {item.options.map((opt, idx) => (
                      <div key={idx} className={`p-2 rounded border text-sm ${idx === item.correctAnswer ? 'border-green-400 bg-green-50' : idx === item.userAnswer ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                        <span className="font-medium mr-2">{String.fromCharCode(65 + idx)}.</span>
                        {opt}
                      </div>
                    ))}
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
      </div>
    </div>
  );
}


