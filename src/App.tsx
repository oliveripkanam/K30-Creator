import React, { useState, useEffect, useRef } from 'react';
import { LoginPage } from './components/LoginPage';
import { supabase } from './lib/supabase';
import { Dashboard } from './components/Dashboard';
import { QuestionInput } from './components/QuestionInput';
import { TextExtractor } from './components/TextExtractor';
import { TextVerification } from './components/TextVerification';
import { QuestionDecoder } from './components/QuestionDecoder';
import { MCQInterface } from './components/MCQInterface';
import { SolutionSummaryComponent } from './components/SolutionSummary';
import { ReviewPage } from './components/ReviewPage';
import { QuestionHistory } from './components/QuestionHistory';
import { QuestionDetail } from './components/QuestionDetail';

interface MistakeType {
  id: string;
  category: string;
  description: string;
  count: number;
  lastOccurred: Date;
  examples: string[];
}

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  questionsDecoded: number;
  currentStreak: number;
  totalMarks: number;
  tokens: number;
  provider: 'apple' | 'microsoft' | 'google';
  commonMistakes: MistakeType[];
}

interface Question {
  id: string;
  content: string;
  extractedText?: string; // For photos and PDFs
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
  fileData?: { base64: string; mimeType: string; name: string };
}

interface CompletedQuestion extends Question {
  completedAt: Date;
  tokensEarned: number;
  mcqsGenerated: number;
  timeSpent: number; // in minutes
  solutionSummary: SolutionSummary;
}

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

interface SolutionSummary {
  finalAnswer: string;
  unit: string;
  workingSteps: string[];
  keyFormulas: string[];
}

type AppState = 'login' | 'dashboard' | 'input' | 'extractor' | 'verify' | 'decoder' | 'mcq' | 'solution' | 'history' | 'history_detail' | 'review';
const [selectedHistoryId, setSelectedHistoryId] = [undefined as any];

export default function App() {
  const [currentState, setCurrentState] = useState<AppState>('login');
  const [user, setUser] = useState<User | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [mcqs, setMCQs] = useState<MCQ[]>([]);
  const [currentMCQIndex, setCurrentMCQIndex] = useState(0);
  const [solutionSummary, setSolutionSummary] = useState<SolutionSummary | null>(null);
  const [completedQuestions, setCompletedQuestions] = useState<CompletedQuestion[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);
  const [hasPersisted, setHasPersisted] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const autoSaveTriggeredRef = useRef<boolean>(false);
  // Removed session hydration on refresh by request

  // Mock user authentication (fallback)
  const handleLogin = (provider: 'apple' | 'microsoft' | 'google') => {
    const mockUser: User = {
      id: '1',
      name: 'John Doe',
      email: 'john.doe@email.com',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
      questionsDecoded: 45,
      currentStreak: 7,
      totalMarks: 180,
      tokens: 1250,
      provider,
      commonMistakes: [
        {
          id: 'mistake-1',
          category: 'Forces',
          description: 'Forgetting to resolve forces into components',
          count: 12,
          lastOccurred: new Date('2024-01-12'),
          examples: ['Inclined plane problems', 'Projectile motion with air resistance']
        },
        {
          id: 'mistake-2',
          category: 'Kinematics',
          description: 'Using wrong kinematic equation',
          count: 8,
          lastOccurred: new Date('2024-01-10'),
          examples: ['Choosing s = ut + ½at² when initial velocity is unknown', 'Using v² = u² + 2as for time calculations']
        },
        {
          id: 'mistake-3',
          category: 'Energy',
          description: 'Not accounting for energy losses',
          count: 6,
          lastOccurred: new Date('2024-01-08'),
          examples: ['Friction in sliding problems', 'Air resistance in projectile motion']
        },
        {
          id: 'mistake-4',
          category: 'Units',
          description: 'Unit conversion errors',
          count: 5,
          lastOccurred: new Date('2024-01-06'),
          examples: ['km/h to m/s conversions', 'Degree to radian conversions']
        },
        {
          id: 'mistake-5',
          category: 'Momentum',
          description: 'Sign errors in collision problems',
          count: 4,
          lastOccurred: new Date('2024-01-05'),
          examples: ['Negative velocity directions', 'Before/after collision momentum']
        }
      ]
    };
    setUser(mockUser);
    setCurrentState('dashboard');
    
    // Load mock completed questions
    loadMockCompletedQuestions();
  };

  const handleLogout = async () => {
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
    setCurrentState('login');
  };

  // Supabase OAuth
  const handleOAuth = async (provider: 'google' | 'azure' | 'apple') => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  // On auth state change, load/create profile and set user (no refresh hydration)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const authUser = session?.user;
      if (!authUser) {
        setUser(null);
        setCurrentState('login');
        return;
      }
      const displayName = authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User';
      const avatarUrl = authUser.user_metadata?.avatar_url || undefined;
      // Upsert basic profile; ignore errors for now (RLS must allow self)
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: authUser.id,
            display_name: displayName,
            avatar_url: avatarUrl,
            provider: (authUser.app_metadata?.provider as string) || null,
          })
          .select()
          .single();
      } catch (e) {
        console.warn('profiles upsert failed', e);
      }

      const hydrated: User = {
        id: authUser.id,
        name: displayName,
        email: authUser.email || '',
        avatar: avatarUrl || '/img/microsoft-default.png',
        // Defaults until DB totals are wired in later steps
        questionsDecoded: 0,
        currentStreak: 0,
        totalMarks: 0,
        tokens: 0,
        provider: (authUser.app_metadata?.provider as 'apple' | 'microsoft' | 'google') || 'google',
        commonMistakes: [],
      };
      setUser(hydrated);
      setCurrentState('dashboard');
      // Fetch DB-backed totals & streak (non-blocking)
      void refreshDashboardMetrics(hydrated.id);
      void refreshTopMistakes(hydrated.id);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const handleQuestionSubmit = (question: Question) => {
    setCurrentQuestion(question);
    setQuestionStartTime(new Date());
    // For text questions, skip extraction and go directly to decoder
    if (question.type === 'text') {
      const updatedQuestion = { ...question, extractedText: question.content };
      setCurrentQuestion(updatedQuestion);
      setCurrentState('decoder');
    } else {
      setCurrentState('extractor');
    }
  };

  const handleTextExtracted = (updatedQuestion: Question) => {
    setCurrentQuestion(updatedQuestion);
    // For photos and files, go to verification step before decoding
    if (updatedQuestion.type !== 'text') {
      setCurrentState('verify');
    } else {
      setCurrentState('decoder');
    }
  };

  const handleTextVerified = (verifiedQuestion: Question) => {
    setCurrentQuestion(verifiedQuestion);
    setCurrentState('decoder');
  };

  const handleQuestionDecoded = (generatedMCQs: MCQ[], solution: SolutionSummary) => {
    setMCQs(generatedMCQs);
    setSolutionSummary(solution);
    setCurrentMCQIndex(0);
    setCurrentState('mcq');
    setHasPersisted(false);
    // Reset review data store for this session
    try {
      (window as any).__k30_answerLog = [];
      (window as any).__k30_lastScore = { correct: [], wrong: [] };
    } catch {}
  };

  const handleMCQComplete = () => {
    setCurrentState('solution');
  };

  const saveCompletion = async (navigateAfter: boolean) => {
    if (!(user && currentQuestion && solutionSummary && questionStartTime)) return;
    const timeSpent = Math.round((new Date().getTime() - questionStartTime.getTime()) / (1000 * 60));
    const tokensEarned = calculateTokens(currentQuestion.marks, mcqs.length, timeSpent);

    // If already persisted, just navigate if requested
    if (hasPersisted) {
      console.log('[persist] already persisted; skipping');
      if (navigateAfter) setCurrentState('dashboard');
      return;
    }

    // If a save is in-flight, avoid duplicate work (React StrictMode will re-fire effects)
    if (isSaving) {
      console.log('[persist] save already in progress; skipping');
      if (navigateAfter) setCurrentState('dashboard');
      return;
    }

    console.log('[persist] auto-save starting');
    setIsSaving(true);

    const completedQuestion: CompletedQuestion = {
      ...currentQuestion,
      completedAt: new Date(),
      tokensEarned,
      mcqsGenerated: mcqs.length,
      timeSpent,
      solutionSummary
    };

    setCompletedQuestions(prev => [completedQuestion, ...prev]);

    setUser({
      ...user,
      questionsDecoded: user.questionsDecoded + 1,
      // Do not locally bump streak; server will compute real streak
      currentStreak: user.currentStreak,
      totalMarks: user.totalMarks + currentQuestion.marks,
      tokens: user.tokens + tokensEarned
    });

    try {
      // Guard getSession with timeout for visibility
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ data: { session: null } }), 2500));
      const sessRes: any = (await Promise.race([sessionPromise, timeoutPromise])) as any;
      const hasSessionNow = !!sessRes?.data?.session;
      console.log('[persist] start', { hasSession: hasSessionNow, userId: user.id });

      // Helper: REST fallback using access_token from localStorage if session missing
      const restInsertQuestions = async (): Promise<{ id?: string }> => {
        try {
          const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
          const envAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string;
          // Find access token in localStorage (key starts with sb- and ends with -auth-token)
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
          if (!envUrl || !envAnon) throw new Error('missing supabase env');
          if (!accessToken) throw new Error('missing access token');
          const body = JSON.stringify({
            user_id: user.id,
            source_type: currentQuestion.type,
            marks: currentQuestion.marks,
            original_input: currentQuestion.content,
            extracted_text: currentQuestion.extractedText ?? null,
            decoded_at: new Date().toISOString(),
            time_spent_minutes: timeSpent,
            tokens_earned: tokensEarned,
            solution_summary: solutionSummary ? JSON.stringify(solutionSummary) : null,
          });
          const resp = await fetch(`${envUrl}/rest/v1/questions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': envAnon,
              'Prefer': 'return=representation',
            } as any,
            body,
          });
          const txt = await resp.text();
          console.log('[persist] REST questions status', resp.status);
          if (!resp.ok) throw new Error(`rest insert questions failed ${resp.status}: ${txt}`);
          const arr = JSON.parse(txt || '[]');
          return arr?.[0] || {};
        } catch (err) {
          console.error('[persist] REST insert questions failed', err);
          throw err as any;
        }
      };

      const restInsertMcqSteps = async (qid: string): Promise<void> => {
        try {
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
          if (!envUrl || !envAnon) throw new Error('missing supabase env');
          if (!accessToken) throw new Error('missing access token');
          const choicesWithLabels = (options: string[]) => options.map((t, idx) => ({ label: String.fromCharCode(65 + idx), text: t }));
          const rows = mcqs.map((m, i) => ({
            question_id: qid,
            step_index: i,
            prompt: m.question,
            choices: choicesWithLabels(m.options),
            correct_label: String.fromCharCode(65 + (m.correctAnswer ?? 0)),
            user_answer: null,
            is_correct: null,
            answered_at: null,
          }));
          const resp = await fetch(`${envUrl}/rest/v1/mcq_steps`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': envAnon,
              'Prefer': 'return=minimal',
            } as any,
            body: JSON.stringify(rows),
          });
          console.log('[persist] REST mcq_steps status', resp.status);
          if (!resp.ok) {
            const txt = await resp.text();
            throw new Error(`rest insert mcq_steps failed ${resp.status}: ${txt}`);
          }
        } catch (err) {
          console.error('[persist] REST insert mcq_steps failed', err);
          throw err as any;
        }
      };

      console.log('[persist] inserting into questions...');
      let insertedId: string | undefined;
      if (!hasSessionNow) {
        // Try REST fallback first when session appears missing
        const inserted = await Promise.race([
          restInsertQuestions(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('questions insert timeout after 8s')), 8000)),
        ]) as any;
        insertedId = inserted?.id;
      } else {
        const insertQuestions = supabase
          .from('questions')
          .insert({
            user_id: user.id,
            source_type: currentQuestion.type,
            marks: currentQuestion.marks,
            original_input: currentQuestion.content,
            extracted_text: currentQuestion.extractedText ?? null,
            decoded_at: new Date().toISOString(),
            time_spent_minutes: timeSpent,
            tokens_earned: tokensEarned,
            solution_summary: solutionSummary ? JSON.stringify(solutionSummary) : null,
          })
          .select('id')
          .single();
        const abortAfter = new Promise((_, reject) => setTimeout(() => reject(new Error('questions insert timeout after 8s')), 8000));
        const { data: inserted, error } = (await Promise.race([insertQuestions, abortAfter])) as any;
        if (error) {
          console.error('[persist] insert questions failed', { error });
          throw error;
        }
        insertedId = inserted?.id;
      }

      console.log('[persist] questions insert ok', { id: insertedId });
      const questionId = insertedId;
      if (questionId) {
        // Broadcast an optimistic history item so UI updates instantly
        try {
          const optimisticItem = {
            id: questionId,
            content: currentQuestion.content,
            extractedText: currentQuestion.extractedText || undefined,
            marks: currentQuestion.marks,
            type: currentQuestion.type,
            timestamp: new Date(),
            completedAt: new Date(),
            tokensEarned,
            mcqsGenerated: mcqs.length,
            timeSpent,
            solutionSummary: solutionSummary,
          } as any;
          window.dispatchEvent(new CustomEvent('k30:history:optimistic', { detail: optimisticItem }));
        } catch {}
        const choicesWithLabels = (options: string[]) => options.map((t, idx) => ({ label: String.fromCharCode(65 + idx), text: t }));
        console.log('[persist] inserting into mcq_steps...', { questionId, count: mcqs.length });
        if (!hasSessionNow) {
          await Promise.race([
            restInsertMcqSteps(questionId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('mcq_steps insert timeout after 8s')), 8000)),
          ]);
          console.log('[persist] saved question + steps (REST)', { questionId, steps: mcqs.length });
          try { window.dispatchEvent(new Event('k30:history:refresh')); } catch {}
          await updateAnswersAndMistakes(questionId, hasSessionNow);
        } else {
          const stepsInsert = supabase.from('mcq_steps').insert(
            mcqs.map((m, i) => ({
              question_id: questionId,
              step_index: i,
              prompt: m.question,
              choices: choicesWithLabels(m.options),
              correct_label: String.fromCharCode(65 + (m.correctAnswer ?? 0)),
              user_answer: null,
              is_correct: null,
              answered_at: null,
            }))
          );
          const stepsAbort = new Promise((_, reject) => setTimeout(() => reject(new Error('mcq_steps insert timeout after 8s')), 8000));
          const { error: stepsErr } = (await Promise.race([stepsInsert, stepsAbort])) as any;
          if (stepsErr) {
            console.error('[persist] insert mcq_steps failed', { error: stepsErr });
          } else {
            console.log('[persist] saved question + steps', { questionId, steps: mcqs.length });
            try { window.dispatchEvent(new Event('k30:history:refresh')); } catch {}
            await updateAnswersAndMistakes(questionId, hasSessionNow);
          }
        }
      }
      // Refresh DB-backed totals & streak after save
      void refreshDashboardMetrics(user.id);
      setHasPersisted(true);
    } catch (e) {
      console.warn('persist completion failed', e);
    } finally {
      setIsSaving(false);
      if (navigateAfter) setCurrentState('dashboard');
    }
  };

  const handleSolutionComplete = async () => {
    // Fire-and-forget save, navigate immediately to avoid UI getting stuck
    void saveCompletion(false);
    setCurrentState('dashboard');
  };

  useEffect(() => {
    if (currentState === 'solution' && !hasPersisted && !autoSaveTriggeredRef.current) {
      autoSaveTriggeredRef.current = true;
      // Fire auto-save on entering summary (background)
      void saveCompletion(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState]);

  // Fetch totals (questions, marks, tokens) and true daily streak from DB
  const refreshDashboardMetrics = async (userId: string) => {
    try {
      // Try view for totals first
      let questionsDecoded = 0;
      let totalMarks = 0;
      let tokens = 0;
      try {
        const { data: totalsRow, error: totalsErr } = await supabase
          .from('v_user_totals')
          .select('*')
          .eq('user_id', userId)
          .single();
        if (!totalsErr && totalsRow) {
          questionsDecoded = Number(totalsRow.questions_decoded || 0);
          totalMarks = Number(totalsRow.total_marks || 0);
          tokens = Number(totalsRow.tokens || 0);
        } else {
          // Fallback compute from questions
          const { data: qAgg } = await supabase
            .from('questions')
            .select('marks, tokens_earned, id')
            .eq('user_id', userId);
          if (qAgg) {
            questionsDecoded = qAgg.length;
            totalMarks = qAgg.reduce((s: number, q: any) => s + Number(q.marks || 0), 0);
            tokens = qAgg.reduce((s: number, q: any) => s + Number(q.tokens_earned || 0), 0);
          }
        }
      } catch {}

      // Streak via RPC if available; else compute client-side
      let currentStreak = 0;
      try {
        const { data: streakVal, error: streakErr } = await supabase.rpc('fn_user_streak', { p_user_id: userId });
        if (!streakErr && typeof streakVal === 'number') {
          currentStreak = streakVal;
        } else {
          // Fallback: compute consecutive days ending today
          const { data: dates } = await supabase
            .from('questions')
            .select('decoded_at')
            .eq('user_id', userId)
            .order('decoded_at', { ascending: false })
            .limit(365);
          const set = new Set<string>((dates || []).map((r: any) => new Date(r.decoded_at).toISOString().slice(0, 10)));
          let streak = 0;
          for (let i = 0; i < 365; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            if (set.has(key)) streak += 1; else break;
          }
          currentStreak = streak;
        }
      } catch {}

      setUser((prev) => prev ? {
        ...prev,
        questionsDecoded,
        totalMarks,
        tokens,
        currentStreak,
      } : prev);
    } catch (e) {
      // Non-fatal: keep defaults if queries fail
      console.warn('refreshDashboardMetrics failed', e);
    }
  };

  // Fetch top mistakes for dashboard (aggregated across duplicate rows)
  const refreshTopMistakes = async (userId: string) => {
    try {
      const { data: rows } = await supabase
        .from('mistakes')
        .select('category, description, count, last_occurred')
        .eq('user_id', userId)
        .limit(1000);
      const aggregate = new Map<string, { id: string; category: string; description: string; count: number; lastOccurred: Date; examples: string[] }>();
      (rows || []).forEach((r: any) => {
        const key = `${r.category}|||${r.description}`;
        const cur = aggregate.get(key) || { id: key, category: r.category, description: r.description, count: 0, lastOccurred: new Date(r.last_occurred || Date.now()), examples: [] };
        cur.count += Number(r.count || 1);
        cur.lastOccurred = new Date(r.last_occurred || cur.lastOccurred);
        aggregate.set(key, cur);
      });
      const top3 = Array.from(aggregate.values()).sort((a, b) => b.count - a.count).slice(0, 3);
      setUser((prev) => prev ? { ...prev, commonMistakes: top3 } : prev);
    } catch {}
  };

  const calculateTokens = (marks: number, mcqCount: number, timeSpent: number): number => {
    let baseTokens = marks * 10; // 10 tokens per mark
    let bonusTokens = 0;
    
    // Time bonus: faster completion gets more tokens
    if (timeSpent <= 5) bonusTokens += 50;
    else if (timeSpent <= 10) bonusTokens += 30;
    else if (timeSpent <= 15) bonusTokens += 10;
    
    // MCQ completion bonus
    bonusTokens += mcqCount * 5;
    
    return baseTokens + bonusTokens;
  };

  // After inserting mcq_steps, write user's answers from the runtime log and record mistakes
  const updateAnswersAndMistakes = async (questionId: string, hasSessionNow: boolean) => {
    // Read runtime answer log (built in MCQInterface)
    let answerLog: Array<{ step: number; userAnswer?: number; correctAnswer?: number; question?: string; explanation?: string }> = [];
    try { answerLog = (window as any).__k30_answerLog || []; } catch {}
    if (!Array.isArray(answerLog) || answerLog.length === 0) return;

    const accessFromLocal = () => {
      let accessToken = '';
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const v = localStorage.getItem(k) || '';
          try { const parsed = JSON.parse(v || '{}'); accessToken = parsed?.access_token || ''; } catch {}
          if (accessToken) break;
        }
      }
      return accessToken;
    };

    const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
    const envAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string;

    for (const entry of answerLog) {
      const userLabel = typeof entry.userAnswer === 'number' ? String.fromCharCode(65 + entry.userAnswer) : null;
      const correctLabel = typeof entry.correctAnswer === 'number' ? String.fromCharCode(65 + entry.correctAnswer) : null;
      const isCorrect = userLabel && correctLabel ? userLabel === correctLabel : null;
      const stepIndex = (entry.step || 1) - 1;

      try {
        if (!hasSessionNow) {
          const token = accessFromLocal();
          // Update mcq_steps row via REST with filters
          await fetch(`${envUrl}/rest/v1/mcq_steps?question_id=eq.${questionId}&step_index=eq.${stepIndex}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': envAnon, 'Prefer': 'resolution=merge-duplicates' } as any,
            body: JSON.stringify({ user_answer: userLabel, is_correct: isCorrect, answered_at: new Date().toISOString() }),
          });
        } else {
          await supabase
            .from('mcq_steps')
            .update({ user_answer: userLabel, is_correct: isCorrect, answered_at: new Date().toISOString() })
            .eq('question_id', questionId)
            .eq('step_index', stepIndex);
        }
      } catch {}

      // Record a mistake row only when incorrect
      if (isCorrect === false && user) {
        const category = (currentQuestion as any)?.subject || 'General';
        const description = (entry.explanation || entry.question || '').toString().slice(0, 180) || 'Incorrect step';
        try {
          if (!hasSessionNow) {
            const token = accessFromLocal();
            await fetch(`${envUrl}/rest/v1/mistakes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': envAnon, 'Prefer': 'return=minimal' } as any,
              body: JSON.stringify({ user_id: user.id, category, description, count: 1, last_occurred: new Date().toISOString() }),
            });
          } else {
            await supabase
              .from('mistakes')
              .insert({ user_id: user.id, category, description, count: 1, last_occurred: new Date().toISOString() });
          }
        } catch {}
      }
    }

    // Refresh dashboard mistakes
    void refreshTopMistakes(user!.id);
  };

  const loadMockCompletedQuestions = () => {
    // Add some mock completed questions for demonstration
    const mockQuestions: CompletedQuestion[] = [
      {
        id: 'completed-1',
        content: 'A projectile is launched from ground level with an initial velocity of 25 m/s at an angle of 45° to the horizontal.',
        extractedText: 'A projectile is launched from ground level with an initial velocity of 25 m/s at an angle of 45° to the horizontal.',
        marks: 6,
        type: 'text',
        timestamp: new Date('2024-01-15'),
        completedAt: new Date('2024-01-15'),
        tokensEarned: 95,
        mcqsGenerated: 3,
        timeSpent: 12,
        solutionSummary: {
          finalAnswer: '31.9 m, 3.61 s, 63.8 m',
          unit: 'm, s, m',
          workingSteps: ['Used kinematic equations', 'Applied projectile motion formulas'],
          keyFormulas: ['v² = u² + 2as', 's = ut + ½at²']
        }
      },
      {
        id: 'completed-2',
        content: 'mechanics_problem_2.jpg',
        extractedText: 'A 5 kg block slides down a frictionless incline of 30° to the horizontal.',
        marks: 4,
        type: 'photo',
        timestamp: new Date('2024-01-14'),
        completedAt: new Date('2024-01-14'),
        tokensEarned: 75,
        mcqsGenerated: 2,
        timeSpent: 8,
        solutionSummary: {
          finalAnswer: '4.9 m/s², 9.9 m/s, 2.02 s',
          unit: 'm/s², m/s, s',
          workingSteps: ['Resolved forces parallel to incline', 'Applied Newton\'s second law'],
          keyFormulas: ['F = ma', 'v² = u² + 2as']
        }
      }
    ];
    setCompletedQuestions(mockQuestions);
  };

  const renderCurrentState = () => {
    switch (currentState) {
      case 'login':
        return <LoginPage onLogin={handleLogin} onOAuth={handleOAuth} />;
      case 'dashboard':
        return (
          <Dashboard 
            user={user!} 
            onStartDecoding={() => setCurrentState('input')}
            onViewHistory={() => setCurrentState('history')}
            onLogout={handleLogout}
          />
        );
      case 'input':
        return (
          <QuestionInput 
            onSubmit={handleQuestionSubmit}
            onBack={() => setCurrentState('dashboard')}
          />
        );
      case 'extractor':
        return (
          <TextExtractor 
            question={currentQuestion!}
            onTextExtracted={handleTextExtracted}
            onBack={() => setCurrentState('input')}
          />
        );
      case 'verify':
        return (
          <TextVerification 
            question={currentQuestion!}
            onVerified={handleTextVerified}
            onBack={() => setCurrentState('extractor')}
          />
        );
      case 'decoder':
        return (
          <QuestionDecoder 
            question={currentQuestion!}
            onDecoded={handleQuestionDecoded}
            onBack={() => currentQuestion?.type === 'text' ? setCurrentState('input') : setCurrentState('verify')}
          />
        );
      case 'mcq':
        return (
          <MCQInterface 
            mcqs={mcqs}
            currentIndex={currentMCQIndex}
            originalQuestion={currentQuestion!}
            onNext={() => setCurrentMCQIndex(prev => prev + 1)}
            onComplete={handleMCQComplete}
            onBack={() => setCurrentState('decoder')}
          />
        );
      case 'solution':
        return (
          <SolutionSummaryComponent
            originalQuestion={currentQuestion!}
            solution={solutionSummary!}
            onComplete={handleSolutionComplete}
            onBack={() => setCurrentState('mcq')}
            onSeeReview={() => setCurrentState('review')}
          />
        );
      case 'review':
        return (
          <ReviewPage
            onBackToSummary={() => setCurrentState('solution')}
          />
        );
      case 'history':
        return (
          <QuestionHistory
            userId={user!.id}
            onBack={() => setCurrentState('dashboard')}
            onOpenDetail={(id) => { setSelectedHistoryId(id); setCurrentState('history_detail'); }}
          />
        );
      case 'history_detail':
        return (
          <QuestionDetail
            questionId={selectedHistoryId!}
            onBack={() => setCurrentState('history')}
          />
        );
      default:
        return <LoginPage onLogin={handleLogin} onOAuth={handleOAuth} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {renderCurrentState()}
    </div>
  );
}