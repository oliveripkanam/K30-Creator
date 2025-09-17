import React from 'react';
import { supabase } from '../lib/supabase';
import { RecentPerformanceCard, DecodeAttempt, PerformanceAggregates } from './RecentPerformanceCard';

interface Props {
  userId: string;
  onOpenHistory?: () => void;
}

type Timeframe = '7d' | '30d' | '90d';

export function RecentPerformanceCardContainer({ userId, onOpenHistory }: Props) {
  const [timeframe, setTimeframe] = React.useState<Timeframe>('30d');
  const [state, setState] = React.useState<'loading' | 'empty' | 'error' | 'data'>('loading');
  const [decodes, setDecodes] = React.useState<DecodeAttempt[]>([]);
  const [aggregates, setAggregates] = React.useState<PerformanceAggregates | undefined>();

  const computeSince = (tf: Timeframe): Date => {
    const days = tf === '7d' ? 7 : tf === '30d' ? 30 : 90;
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0,0,0,0);
    return start;
  };

  const formatDisplayDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const recompute = React.useCallback(async (tf: Timeframe) => {
    setState('loading');
    try {
      const since = computeSince(tf);
      
      // Helper: REST select fallback using access_token from localStorage (handles session hiccups in dev)
      const getAccessToken = (): string => {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i) || '';
            if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
              const v = localStorage.getItem(k) || '';
              const parsed = JSON.parse(v || '{}');
              const t = parsed?.access_token || '';
              if (t) return t;
            }
          }
        } catch {}
        return '';
      };

      const restSelect = async (path: string) => {
        const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string;
        const envAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string;
        const token = getAccessToken();
        if (!envUrl || !envAnon || !token) throw new Error('missing env/token');
        const resp = await fetch(`${envUrl}/rest/v1/${path}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': envAnon,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          } as any,
        });
        if (!resp.ok) throw new Error(`rest ${path} failed ${resp.status}`);
        return (await resp.json()) as any[];
      };

      // Fetch recent questions within timeframe (cap to 30 for performance)
      const questionsPromise = supabase
        .from('questions')
        .select('id, decoded_at, marks, time_spent_minutes, time_spent_seconds, tokens_earned')
        .eq('user_id', userId)
        .gte('decoded_at', since.toISOString())
        .order('decoded_at', { ascending: false })
        .limit(30);

      // Hard timeout to avoid indefinite loading
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('questions timeout')), 6000));
      let qRows: any[] | null = null;
      try {
        const { data, error } = (await Promise.race([questionsPromise, timeout])) as any;
        if (error) throw error;
        qRows = data || [];
      } catch {
        // REST fallback
        const sinceIso = encodeURIComponent(since.toISOString());
        qRows = await restSelect(`questions?select=id,decoded_at,marks,time_spent_minutes,time_spent_seconds,tokens_earned&user_id=eq.${encodeURIComponent(userId)}&decoded_at=gte.${sinceIso}&order=decoded_at.desc&limit=30`);
      }

      const questions = qRows || [];
      if (questions.length === 0) {
        setDecodes([]);
        setAggregates(undefined);
        setState('empty');
        return;
      }

      // Fetch mcq steps for those questions
      const ids = questions.map((q: any) => q.id);
      let steps: any[] = [];
      try {
        const stepsPromise = supabase
          .from('mcq_steps')
          .select('question_id, is_correct, user_answer, correct_label')
          .in('question_id', ids);
        const stepsTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('steps timeout')), 6000));
        const { data, error } = (await Promise.race([stepsPromise, stepsTimeout])) as any;
        if (error) throw error;
        steps = data || [];
      } catch {
        // REST fallback with in.() filter
        const list = `(${ids.map(id => encodeURIComponent(id)).join(',')})`;
        steps = await restSelect(`mcq_steps?select=question_id,is_correct,user_answer,correct_label&question_id=in.${list}`);
      }

      // Group steps by question and compute per-decode accuracy
      const stepsByQ = new Map<string, any[]>();
      for (const s of steps) {
        const arr = stepsByQ.get(s.question_id) || [];
        arr.push(s);
        stepsByQ.set(s.question_id, arr);
      }

      // Build decodes list (chronological ascending for chart)
      // chronological for chart, but we will sort desc for the recent list in the Card
      const chronological = [...questions].sort((a: any, b: any) => new Date(a.decoded_at).getTime() - new Date(b.decoded_at).getTime());
      const items: DecodeAttempt[] = chronological.map((q: any) => {
        const list = stepsByQ.get(q.id) || [];
        const total = list.length || 1;
        let correct = 0;
        let answeredCount = 0;
        for (const s of list) {
          const hasAnswer = !!s.user_answer;
          if (hasAnswer) answeredCount += 1;
          const isTrue = s.is_correct === true || (hasAnswer && s.correct_label && String(s.user_answer).toUpperCase() === String(s.correct_label).toUpperCase());
          if (isTrue) correct += 1;
        }
        const acc = answeredCount > 0 ? Math.round((correct / total) * 100) : 0;
        return {
          id: q.id,
          date: formatDisplayDate(q.decoded_at),
          ts: new Date(q.decoded_at).getTime(),
          marks: Number(q.marks || 0),
          timeSpentMinutes: (() => { const secs = (q.time_spent_seconds ?? null); return secs != null ? (secs / 60) : Number(q.time_spent_minutes || 0); })(),
          tokensEarned: Number(q.tokens_earned || 0),
          accuracy: acc,
          answered: answeredCount > 0,
        };
      });

      // Aggregates
      // De-duplicate by id in case strict-mode or event race caused duplicate inserts
      const uniqueById = new Map<string, DecodeAttempt>();
      for (const it of items) uniqueById.set(it.id, it);
      const deduped = Array.from(uniqueById.values());
      const attemptCount = deduped.length;
      const answeredItems = deduped.filter(it => it.answered);
      const avgAccuracy = answeredItems.length > 0 ? Math.round(answeredItems.reduce((s, it) => s + it.accuracy, 0) / answeredItems.length) : 0;
      const avgMarks = attemptCount > 0 ? Number((deduped.reduce((s, it) => s + it.marks, 0) / attemptCount).toFixed(1)) : 0;
      const tokensTotal = deduped.reduce((s, it) => s + it.tokensEarned, 0);
      const times = deduped.map(it => it.timeSpentMinutes).sort((a, b) => a - b);
      const mid = Math.floor(times.length / 2);
      const medianTime = times.length === 0 ? 0 : times.length % 2 === 1 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2);
      const aggs: PerformanceAggregates = { avgAccuracy, attemptCount, avgMarks, medianTime, tokensTotal };

      setDecodes(deduped);
      setAggregates(aggs);
      setState('data');
    } catch (e) {
      setState('error');
    }
  }, [userId]);

  React.useEffect(() => { void recompute(timeframe); }, [timeframe, recompute]);

  // Refresh when a decode completes (App dispatches these events)
  React.useEffect(() => {
    const onRefresh = () => void recompute(timeframe);
    window.addEventListener('k30:history:refresh', onRefresh);
    return () => window.removeEventListener('k30:history:refresh', onRefresh);
  }, [timeframe, recompute]);

  return (
    <RecentPerformanceCard
      state={state}
      timeframe={timeframe}
      decodes={decodes}
      aggregates={aggregates}
      onTimeframeChange={setTimeframe}
      onRetry={() => void recompute(timeframe)}
      onOpenHistory={onOpenHistory}
    />
  );
}


