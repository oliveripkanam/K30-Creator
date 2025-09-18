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
  const [score, setScore] = useState<{ correct: number[]; wrong: number[] }>(() => ({ correct: [], wrong: [] }));

  const safeMcqs = Array.isArray(mcqs) ? mcqs : [];
  const currentMCQ = safeMcqs[currentIndex];

  if (!currentMCQ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-3xl mx-auto p-6">
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-yellow-800">No steps available</CardTitle>
              <CardDescription className="text-yellow-700">Increase the token budget and try again so we can generate step-by-step questions.</CardDescription>
            </CardHeader>
          </Card>
          <div className="mt-4">
            <Button variant="outline" onClick={onBack}>Back</Button>
          </div>
        </div>
      </div>
    );
  }

  const progress = ((currentIndex + 1) / safeMcqs.length) * 100;
  const isLastQuestion = currentIndex === safeMcqs.length - 1;

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
    try {
      const log = (window as any).__k30_answerLog || [];
      log.push({ step: currentMCQ.step, question: currentMCQ.question, options: currentMCQ.options, correctAnswer: currentMCQ.correctAnswer, userAnswer: selectedAnswer, hint: currentMCQ.hint, explanation: currentMCQ.explanation });
      (window as any).__k30_answerLog = log;
    } catch {}

    try {
      const qid = (window as any).__k30_activeQuestionId as string | undefined;
      if (!qid) { try { console.log('[answer] skip: no activeQuestionId'); } catch {} return; }
      const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
      const envAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string;
      const getToken = () => {
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
        return accessToken;
      };
      const label = String.fromCharCode(65 + selectedAnswer);
      const isCorrect = selectedAnswer === currentMCQ.correctAnswer;
      const payload = { user_answer: label, is_correct: isCorrect, answered_at: new Date().toISOString() } as const;
      const tryClient = async () => {
        try {
          const mod = await import('../lib/supabase');
          const p = mod.supabase.from('mcq_steps').update(payload).eq('question_id', qid).eq('step_index', currentIndex);
          const abort = new Promise((_, reject) => setTimeout(() => reject(new Error('client update timeout')), 4000));
          const { error, status } = (await Promise.race([p, abort])) as any;
          if (error) throw Object.assign(error, { status });
          try { console.log('[answer] client ok', { step: currentIndex, qid }); } catch {}
          return true;
        } catch (e) { try { console.warn('[answer] client failed; will REST fallback', e); } catch {} return false; }
      };
      const tryRest = async () => {
        try {
          const token = getToken();
          if (!(envUrl && envAnon && token)) throw new Error('missing env/token');
          const res = await fetch(`${envUrl}/rest/v1/mcq_steps?question_id=eq.${qid}&step_index=eq.${currentIndex}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': envAnon, 'Prefer': 'resolution=merge-duplicates' } as any, body: JSON.stringify(payload) });
          const txt = await res.text();
          if (!res.ok) throw new Error(`REST ${res.status}: ${txt}`);
          try { console.log('[answer] REST ok', { step: currentIndex, qid }); } catch {}
        } catch (e) { try { console.error('[answer] REST failed', e); } catch {} }
      };
      void (async () => { const ok = await tryClient(); if (!ok) await tryRest(); })();
    } catch {}
  };

  const handleNext = () => {
    if (isLastQuestion) {
      try { (window as any).__k30_lastScore = score; } catch {}
      onComplete();
    } else {
      onNext();
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
            {currentIndex + 1}/{safeMcqs.length}
          </Badge>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Original Question Reference */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-blue-900 flex items-center space-x-2">
                <span>Original Question</span>
              </CardTitle>
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                {originalQuestion.marks} marks
              </Badge>
            </div>
          </CardHeader>
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
              <CardTitle className="text-lg">Step {currentMCQ.step}: Multiple Choice Question</CardTitle>
              <Badge variant="outline">Question {currentIndex + 1}/{safeMcqs.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">{currentMCQ.question}</h3>
              {isAnswered && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge className="bg-green-100 text-green-800" variant="secondary">Correct choice: {String.fromCharCode(65 + currentMCQ.correctAnswer)}</Badge>
                </div>
              )}
            </div>

            <div className="space-y-2 sm:space-y-3">
              {currentMCQ.options.map((option, index) => {
                let buttonVariant: "outline" | "default" | "destructive" | "secondary" = "outline";
                let buttonClass = "";
                if (isAnswered) {
                  if (index === currentMCQ.correctAnswer) { buttonVariant = "default"; buttonClass = "bg-green-500 hover:bg-green-600 border-green-500 text-white"; }
                  else if (index === selectedAnswer && selectedAnswer !== currentMCQ.correctAnswer) { buttonVariant = "destructive"; }
                } else if (selectedAnswer === index) { buttonVariant = "secondary"; }
                return (
                  <Button key={index} variant={buttonVariant} className={`w-full text-left justify-start h-auto p-3 sm:p-4 touch-manipulation ${buttonClass}`} onClick={() => handleAnswerSelect(index)} disabled={isAnswered}>
                    <div className="flex items-start space-x-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium">{String.fromCharCode(65 + index)}</span>
                      <span className="text-left text-sm sm:text-base">{option}</span>
                    </div>
                  </Button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center pt-4 space-y-3 sm:space-y-0">
              <div className="w-full sm:w-auto">
                {!showHint && !isAnswered && (
                  <Button variant="outline" size="sm" onClick={() => setShowHint(true)} className="w-full sm:w-auto">Need a Hint?</Button>
                )}
              </div>
              <div className="w-full sm:w-auto">
                {!isAnswered ? (
                  <Button onClick={handleSubmitAnswer} disabled={selectedAnswer === null} className="px-6 w-full sm:w-auto" size="lg">Submit Answer</Button>
                ) : (
                  <Button onClick={handleNext} className="px-6 w-full sm:w-auto" size="lg">{isLastQuestion ? 'Complete' : 'Next Step'}</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}