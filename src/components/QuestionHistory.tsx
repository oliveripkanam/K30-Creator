import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { supabase } from '../lib/supabase';

interface SolutionSummary {
  finalAnswer: string;
  unit: string;
  workingSteps: string[];
  keyFormulas: string[];
}

interface Question {
  id: string;
  content: string;
  extractedText?: string;
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
}

interface CompletedQuestion extends Question {
  completedAt: Date;
  tokensEarned: number;
  mcqsGenerated: number;
  timeSpent: number;
  solutionSummary: SolutionSummary;
}

interface QuestionHistoryProps { userId: string; onBack: () => void; onOpenDetail?: (id: string) => void; }

export function QuestionHistory({ userId, onBack, onOpenDetail }: QuestionHistoryProps) {
  const [completedQuestions, setCompletedQuestions] = useState<CompletedQuestion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let aborted = false;
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try Supabase client first with a timeout, then REST fallback using access token
        const clientSelect = supabase
          .from('questions')
          .select('*')
          .eq('user_id', userId)
          .order('decoded_at', { ascending: false });
        const clientTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('client select timeout after 6s')), 6000));
        let rows: any[] | null = null;
        try {
          const { data, error } = (await Promise.race([clientSelect, clientTimeout])) as any;
          if (error) throw error;
          rows = data || [];
          // eslint-disable-next-line no-console
          console.log('[history] client select ok', rows.length);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[history] client select failed, trying REST');
          // REST fallback
          try {
            const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
            const envAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string;
            let accessToken = '';
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i) || '';
              if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
                const v = localStorage.getItem(k) || '';
                const parsed = JSON.parse(v || '{}');
                accessToken = parsed?.access_token || '';
                if (accessToken) break;
              }
            }
            const url = `${envUrl}/rest/v1/questions?select=*&user_id=eq.${encodeURIComponent(userId)}&order=decoded_at.desc`;
            const resp = await fetch(url, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'apikey': envAnon,
              } as any,
            });
            // eslint-disable-next-line no-console
            console.log('[history] REST select status', resp.status);
            if (!resp.ok) {
              const txt = await resp.text();
              throw new Error(`rest select failed ${resp.status}: ${txt}`);
            }
            rows = await resp.json();
          } catch (restErr: any) {
            throw restErr;
          }
        }
        if (aborted) return;
        const mapped: CompletedQuestion[] = (rows || []).map((q: any) => ({
          id: q.id,
          content: q.original_input || '',
          extractedText: q.extracted_text || undefined,
          marks: q.marks,
          type: q.source_type,
          timestamp: new Date(q.decoded_at),
          completedAt: new Date(q.decoded_at),
          tokensEarned: q.tokens_earned || 0,
          mcqsGenerated: q.marks || 0,
          timeSpent: ((q.time_spent_seconds ?? null) != null ? Number(q.time_spent_seconds) / 60 : (q.time_spent_minutes || 0)),
          solutionSummary: q.solution_summary ? JSON.parse(q.solution_summary) : { finalAnswer: '', unit: '', workingSteps: [], keyFormulas: [] }
        }));
        setCompletedQuestions(mapped);
      } catch (e: any) {
        if (aborted) return;
        setError(e.message || 'Failed to load history');
      } finally {
        if (aborted) return;
        setLoading(false);
      }
    };
    fetchHistory();
    const onRefresh = () => fetchHistory();
    const onOptimistic = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail as any;
        if (!detail) return;
        setCompletedQuestions(prev => {
          // Avoid duplicates by id
          if (prev.some(p => (p as any).id === detail.id)) return prev;
          const mapped: CompletedQuestion = {
            id: detail.id,
            content: detail.content || '',
            extractedText: detail.extractedText || undefined,
            marks: detail.marks || 0,
            type: detail.type || 'text',
            timestamp: new Date(detail.completedAt || new Date()),
            completedAt: new Date(detail.completedAt || new Date()),
            tokensEarned: detail.tokensEarned || 0,
            mcqsGenerated: detail.mcqsGenerated || 0,
            timeSpent: detail.timeSpent || 0,
            solutionSummary: detail.solutionSummary || { finalAnswer: '', unit: '', workingSteps: [], keyFormulas: [] },
          };
          return [mapped, ...prev];
        });
      } catch {}
    };
    window.addEventListener('k30:history:refresh', onRefresh);
    window.addEventListener('k30:history:optimistic', onOptimistic as any);
    return () => {
      aborted = true;
      window.removeEventListener('k30:history:refresh', onRefresh);
      window.removeEventListener('k30:history:optimistic', onOptimistic as any);
    };
  }, [userId]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'marks' | 'tokens'>('date');
  const [filterType, setFilterType] = useState<'all' | 'photo' | 'file' | 'text'>('all');

  const filteredAndSortedQuestions = completedQuestions
    .filter(question => {
      const matchesSearch = question.extractedText?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           question.content.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || question.type === filterType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
        case 'marks':
          return b.marks - a.marks;
        case 'tokens':
          return b.tokensEarned - a.tokensEarned;
        default:
          return 0;
      }
    });

  const totalTokensEarned = completedQuestions.reduce((sum, q) => sum + q.tokensEarned, 0);
  const totalTimeSpent = completedQuestions.reduce((sum, q) => sum + q.timeSpent, 0);
  const averageMarks = completedQuestions.length > 0 
    ? (completedQuestions.reduce((sum, q) => sum + q.marks, 0) / completedQuestions.length).toFixed(1)
    : '0';

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'photo':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'file':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'text':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <h1 className="text-lg sm:text-xl font-medium">Question History</h1>
          </div>
          <Badge variant="secondary" className="px-2 py-1 text-xs sm:text-sm">
            {completedQuestions.length} question{completedQuestions.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {loading && (
          <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center space-y-3">
              <div className="w-10 h-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
              <p className="text-sm text-blue-700">Loading history…</p>
            </div>
          </div>
        )}
        {error && (
          <Card>
            <CardContent className="p-6 text-red-600">{error}</CardContent>
          </Card>
        )}
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold">{completedQuestions.length}</p>
                  <p className="text-xs text-muted-foreground">Questions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-yellow-100 rounded flex items-center justify-center">
                  <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold">{totalTokensEarned.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Tokens</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold">{Number(totalTimeSpent).toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Minutes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-semibold">{averageMarks}</p>
                  <p className="text-xs text-muted-foreground">Avg. Marks</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filter & Search</CardTitle>
            <CardDescription>Find specific questions from your history</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="w-full">
                <Input
                  placeholder="Search questions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Select value={sortBy} onValueChange={(value: 'date' | 'marks' | 'tokens') => setSortBy(value)}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="marks">Marks</SelectItem>
                    <SelectItem value="tokens">Tokens</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={(value: 'all' | 'photo' | 'file' | 'text') => setFilterType(value)}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="photo">Photo</SelectItem>
                    <SelectItem value="file">File</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Question List */}
        <div className="space-y-4">
          {filteredAndSortedQuestions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No questions found</h3>
                <p className="text-gray-500">
                  {searchTerm || filterType !== 'all' 
                    ? 'Try adjusting your search or filter criteria.'
                    : 'Complete some questions to see them here!'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredAndSortedQuestions.map((question) => (
              <Card 
                key={question.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => onOpenDetail && onOpenDetail(question.id)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        {getTypeIcon(question.type)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {question.type === 'photo' ? 'Photo' : question.type === 'file' ? 'PDF' : 'Text'}
                          </Badge>
                          {/* Hide marks chip to avoid confusion when AI decides MCQ count */}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Completed {formatDate(question.completedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center space-x-1 mb-1">
                        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-sm font-medium text-yellow-600">
                          +{question.tokensEarned}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(() => { const t=Math.max(0,Math.round(((question.timeSpent||0))*60)); const m=Math.floor(t/60); const s=t%60; return m<=0?`${s}s`:`${m} min ${s}s`; })()} · {question.mcqsGenerated || 0} MCQs
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-1">Question:</p>
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                        {question.extractedText || question.content}
                      </p>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Solution:</p>
                        <p className="text-sm text-green-700 bg-green-50 p-2 rounded">
                          <span className="font-medium">Answer:</span> {question.solutionSummary.finalAnswer}
                          {question.solutionSummary.unit && (
                            <span className="text-muted-foreground"> {question.solutionSummary.unit}</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">Key Points:</p>
                        <div className="flex flex-wrap gap-1 max-w-full overflow-hidden">
                          {(question.solutionSummary.workingSteps || []).slice(0, 2).map((p, index) => (
                            <Badge key={index} variant="outline" className="text-xs whitespace-normal break-words">
                              {p.slice(0, 140)}{p.length > 140 ? '…' : ''}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}