import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';

interface SolutionSummary { finalAnswer: string; unit: string; workingSteps: string[]; keyFormulas: string[] }

interface DetailProps { questionId: string; onBack: () => void }

export function QuestionDetail({ questionId, onBack }: DetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);

  useEffect(() => {
    let aborted = false;
    const fetchAll = async () => {
      setLoading(true); setError(null);
      try {
        // Parallel fetch with hard timeouts
        const qPromise = supabase.from('questions').select('id, decoded_at, original_input, extracted_text, marks, solution_summary').eq('id', questionId).single();
        const sPromise = supabase.from('mcq_steps').select('question_id, step_index, prompt, choices, correct_label, user_answer, is_correct').eq('question_id', questionId).order('step_index', { ascending: true });
        const to = (p: Promise<any>, ms: number) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
        const [qRes, sRes] = await Promise.allSettled([to(qPromise as any, 6000), to(sPromise as any, 6000)]);
        if (aborted) return;
        if (qRes.status === 'fulfilled') {
          const { data, error } = qRes.value as any; if (error) throw error; setQuestion(data);
        }
        if (sRes.status === 'fulfilled') {
          const { data, error } = sRes.value as any; if (error) throw error; setSteps(data || []);
        }
      } catch (e: any) {
        if (aborted) return;
        setError(e.message || 'Failed to load question');
      } finally { if (!aborted) setLoading(false); }
    };
    fetchAll();
    return () => { aborted = true };
  }, [questionId]);

  const summary: SolutionSummary = question?.solution_summary ? JSON.parse(question.solution_summary) : { finalAnswer: '', unit: '', workingSteps: [], keyFormulas: [] };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Button>
            <h1 className="text-xl">Question Details</h1>
          </div>
          {/* hide marks to avoid mismatch with MCQ count */}
        </div>
      </div>
      {loading && (
        <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
            <p className="text-sm text-blue-700">Loading…</p>
          </div>
        </div>
      )}
      {!loading && error && (
        <div className="max-w-4xl mx-auto p-4">
          <Card><CardContent className="p-6 text-red-600">{error}</CardContent></Card>
        </div>
      )}
      {!loading && question && (
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Original Question</CardTitle>
              <CardDescription>Completed {new Date(question.decoded_at).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm bg-gray-50 p-3 rounded">{question.extracted_text || question.original_input}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Solution Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm"><span className="font-medium">Answer:</span> {summary.finalAnswer}{summary.unit ? ` ${summary.unit}` : ''}</p>
              <div className="space-y-2">
                {summary.workingSteps?.map((s, i) => (
                  <div key={i} className="flex items-start space-x-2">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs text-blue-700">{i+1}</div>
                    <p className="text-sm bg-gray-50 p-2 rounded flex-1">{s}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>See How You Did</CardTitle>
              <CardDescription>Per-step answers and explanations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className={`p-3 rounded border ${s.is_correct === true ? 'bg-green-50 border-green-200' : s.is_correct === false ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">Step {s.step_index + 1}</span>
                    <div className="flex items-center space-x-2 text-xs">
                      <Badge variant="outline">Correct: {s.correct_label}</Badge>
                      {s.user_answer && <Badge variant="outline">You: {s.user_answer}</Badge>}
                    </div>
                  </div>
                  <p className="text-sm mb-2">{s.prompt}</p>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Array.isArray(s.choices) && (s.choices as any[]).map((c: any, idx: number) => {
                      const label = (c?.label ?? String.fromCharCode(65 + idx)).toString();
                      const text = (c?.text ?? c ?? '').toString();
                      const isCorrect = String(s.correct_label || '').toUpperCase() === label.toUpperCase();
                      const isUser = String(s.user_answer || '').toUpperCase() === label.toUpperCase();
                      const cls = isCorrect
                        ? 'border-green-300 bg-green-50'
                        : isUser
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-white';
                      return (
                        <div key={idx} className={`text-sm border rounded p-2 flex items-start space-x-2 ${cls}`}>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${isCorrect ? 'bg-green-600 text-white' : isUser ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>{label}</span>
                          <span className="flex-1">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}


