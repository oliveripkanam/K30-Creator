import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';

interface MCQ {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  hint: string;
  explanation: string;
  step: number;
  calculationStep?: {
    formula?: string;
    substitution?: string;
    result?: string;
  };
}

interface Question {
  id: string;
  content: string;
  extractedText?: string;
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
}

interface MCQInterfaceProps {
  mcqs: MCQ[];
  currentIndex: number;
  originalQuestion: Question;
  onNext: () => void;
  onComplete: () => void;
  onBack: () => void;
}

export function MCQInterface({ mcqs, currentIndex, originalQuestion, onNext, onComplete, onBack }: MCQInterfaceProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isAnswered, setIsAnswered] = useState(false);
  // Track correctness for Solution page
  const [score, setScore] = useState<{ correct: number[]; wrong: number[] }>(() => ({ correct: [], wrong: [] }));

  const currentMCQ = mcqs[currentIndex];
  const progress = ((currentIndex + 1) / mcqs.length) * 100;
  const isLastQuestion = currentIndex === mcqs.length - 1;

  const handleAnswerSelect = (answerIndex: number) => {
    if (isAnswered) return;
    setSelectedAnswer(answerIndex);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;
    setIsAnswered(true);
    setShowExplanation(true);
    const wasCorrect = selectedAnswer === currentMCQ.correctAnswer;
    setScore(prev => ({
      correct: wasCorrect ? [...prev.correct, currentMCQ.step] : prev.correct,
      wrong: !wasCorrect ? [...prev.wrong, currentMCQ.step] : prev.wrong,
    }));
    // Append to review log
    try {
      const log = (window as any).__k30_answerLog || [];
      log.push({
        step: currentMCQ.step,
        question: currentMCQ.question,
        options: currentMCQ.options,
        correctAnswer: currentMCQ.correctAnswer,
        userAnswer: selectedAnswer,
        hint: currentMCQ.hint,
        explanation: currentMCQ.explanation,
      });
      (window as any).__k30_answerLog = log;
    } catch {}

    // Real-time persistence of the answer if a question_id is available
    try {
      const qid = (window as any).__k30_activeQuestionId as string | undefined;
      if (qid) {
        const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
        const envAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string;
        let accessToken = '';
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) || '';
            if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
              const v = localStorage.getItem(k) || '';
              const parsed = JSON.parse(v || '{}');
              accessToken = parsed?.access_token || '';
              if (accessToken) break;
            }
          }
        } catch {}
        const label = String.fromCharCode(65 + selectedAnswer);
        const isCorrect = selectedAnswer === currentMCQ.correctAnswer;
        // Try client first if we have supabase globally
        try {
          const { supabase } = require('../lib/supabase');
          void supabase
            .from('mcq_steps')
            .update({ user_answer: label, is_correct: isCorrect, answered_at: new Date().toISOString() })
            .eq('question_id', qid)
            .eq('step_index', currentIndex);
        } catch {
          // REST fallback
          if (envUrl && envAnon && accessToken) {
            void fetch(`${envUrl}/rest/v1/mcq_steps?question_id=eq.${qid}&step_index=eq.${currentIndex}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'apikey': envAnon, 'Prefer': 'resolution=merge-duplicates' } as any,
              body: JSON.stringify({ user_answer: label, is_correct: isCorrect, answered_at: new Date().toISOString() }),
            }).catch(() => {});
          }
        }
      }
    } catch {}
  };

  const handleNext = () => {
    if (isLastQuestion) {
      // Stash score on navigation so Solution page can display it
      try { (window as any).__k30_lastScore = score; } catch {}
      onComplete();
    } else {
      onNext();
      // Reset state for next question
      setSelectedAnswer(null);
      setShowHint(false);
      setShowExplanation(false);
      setIsAnswered(false);
    }
  };

  const isCorrect = selectedAnswer === currentMCQ.correctAnswer;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Back</span>
            </Button>
            <h1 className="text-lg sm:text-xl font-medium">Step-by-Step Solution</h1>
          </div>
          <Badge variant="secondary" className="text-xs sm:text-sm">
            {currentIndex + 1}/{mcqs.length}
          </Badge>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Original Question Reference */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-blue-900 flex items-center space-x-2">
                {originalQuestion.type === 'photo' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                {originalQuestion.type === 'file' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                {originalQuestion.type === 'text' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                <span>Original Question</span>
              </CardTitle>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                {originalQuestion.marks} marks
              </Badge>
            </div>
            <CardDescription className="text-blue-700">
              {originalQuestion.type === 'text' 
                ? 'Refer to this question while working through each step'
                : `AI-extracted from ${originalQuestion.type === 'photo' ? 'image' : 'PDF'} - refer to this while solving`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white/80 p-4 rounded-lg border border-blue-200">
              {originalQuestion.type !== 'text' && (
                <div className="mb-3 pb-3 border-b border-blue-200">
                  <p className="text-xs text-blue-600 mb-1">Source:</p>
                  <p className="text-xs text-blue-800">{originalQuestion.content}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-blue-900 leading-relaxed">
                  {originalQuestion.extractedText || originalQuestion.content}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between text-sm mb-2">
              <span>Progress</span>
              <span>{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>

        {/* Question Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Step {currentMCQ.step}: Multiple Choice Question
              </CardTitle>
              <Badge variant="outline">
                Question {currentIndex + 1}/{mcqs.length}
              </Badge>
            </div>
            <CardDescription>
              {currentMCQ.calculationStep 
                ? "This step involves calculations that will help you reach the final answer."
                : "This question helps you work through the solution step by step. Choose the best answer to proceed."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Question */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">{currentMCQ.question}</h3>
            </div>

            {/* Options */}
            <div className="space-y-2 sm:space-y-3">
              {currentMCQ.options.map((option, index) => {
                let buttonVariant: "outline" | "default" | "destructive" | "secondary" = "outline";
                let buttonClass = "";

                if (isAnswered) {
                  if (index === currentMCQ.correctAnswer) {
                    buttonVariant = "default";
                    buttonClass = "bg-green-500 hover:bg-green-600 border-green-500 text-white";
                  } else if (index === selectedAnswer && selectedAnswer !== currentMCQ.correctAnswer) {
                    buttonVariant = "destructive";
                  }
                } else if (selectedAnswer === index) {
                  buttonVariant = "secondary";
                }

                return (
                  <Button
                    key={index}
                    variant={buttonVariant}
                    className={`w-full text-left justify-start h-auto p-3 sm:p-4 touch-manipulation ${buttonClass}`}
                    onClick={() => handleAnswerSelect(index)}
                    disabled={isAnswered}
                  >
                    <div className="flex items-start space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className="text-left text-sm sm:text-base">{option}</span>
                    </div>
                  </Button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-center pt-4 space-y-3 sm:space-y-0">
              <div className="w-full sm:w-auto">
                {!showHint && !isAnswered && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowHint(true)}
                    className="w-full sm:w-auto"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Need a Hint?
                  </Button>
                )}
              </div>

              <div className="w-full sm:w-auto">
                {!isAnswered ? (
                  <Button 
                    onClick={handleSubmitAnswer}
                    disabled={selectedAnswer === null}
                    className="px-6 w-full sm:w-auto"
                    size="lg"
                  >
                    Submit Answer
                  </Button>
                ) : (
                  <Button onClick={handleNext} className="px-6 w-full sm:w-auto" size="lg">
                    {isLastQuestion ? 'Complete' : 'Next Step'}
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hint Card */}
        {showHint && (
          <Alert className="border-yellow-200 bg-yellow-50">
            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <AlertDescription className="text-yellow-800">
              <strong>Hint:</strong> {currentMCQ.hint}
            </AlertDescription>
          </Alert>
        )}

        {/* Explanation Card */}
        {showExplanation && (
          <Card className={`border-2 ${isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <CardHeader>
              <CardTitle className={`flex items-center space-x-2 ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                {isCorrect ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span>{isCorrect ? 'Correct!' : 'Not quite right'}</span>
              </CardTitle>
              <CardDescription className={isCorrect ? 'text-green-600' : 'text-red-600'}>
                {isCorrect 
                  ? `Great job! The correct answer is ${String.fromCharCode(65 + currentMCQ.correctAnswer)}.`
                  : `The correct answer is ${String.fromCharCode(65 + currentMCQ.correctAnswer)}.`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-lg ${isCorrect ? 'bg-white/50' : 'bg-white/50'}`}>
                <p className="text-sm"><strong>Explanation:</strong> {currentMCQ.explanation}</p>
                
                {/* Show calculation steps if available */}
                {currentMCQ.calculationStep && (
                  <div className="mt-4 space-y-3 border-t pt-4">
                    <h4 className="font-medium text-sm">Step-by-step Calculation:</h4>
                    
                    {currentMCQ.calculationStep.formula && (
                      <div className="bg-blue-50 p-3 rounded border border-blue-200">
                        <p className="text-xs text-blue-600 mb-1">Formula:</p>
                        <code className="text-sm font-mono text-blue-800">{currentMCQ.calculationStep.formula}</code>
                      </div>
                    )}
                    
                    {currentMCQ.calculationStep.substitution && (
                      <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                        <p className="text-xs text-yellow-600 mb-1">Substitution:</p>
                        <code className="text-sm font-mono text-yellow-800">{currentMCQ.calculationStep.substitution}</code>
                      </div>
                    )}
                    
                    {currentMCQ.calculationStep.result && (
                      <div className="bg-green-50 p-3 rounded border border-green-200">
                        <p className="text-xs text-green-600 mb-1">Result:</p>
                        <code className="text-sm font-mono font-bold text-green-800">{currentMCQ.calculationStep.result}</code>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Info */}
        {isAnswered && (
          <div className="text-center text-sm text-muted-foreground">
            {isLastQuestion 
              ? "Click 'Complete' to finish and return to your dashboard."
              : "Click 'Next Step' to continue with the solution process."
            }
          </div>
        )}
      </div>
    </div>
  );
}