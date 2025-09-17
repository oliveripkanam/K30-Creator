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
      // Fetch recent questions within timeframe (cap to 30 for performance)
      const { data: qRows, error: qErr } = await supabase
        .from('questions')
        .select('id, decoded_at, marks, time_spent_minutes, tokens_earned')
        .eq('user_id', userId)
        .gte('decoded_at', since.toISOString())
        .order('decoded_at', { ascending: false })
        .limit(30);
      if (qErr) throw qErr;
      const questions = qRows || [];
      if (questions.length === 0) {
        setDecodes([]);
        setAggregates(undefined);
        setState('empty');
        return;
      }

      // Fetch mcq steps for those questions
      const ids = questions.map((q: any) => q.id);
      const { data: sRows, error: sErr } = await supabase
        .from('mcq_steps')
        .select('question_id, is_correct, user_answer, correct_label')
        .in('question_id', ids);
      if (sErr) throw sErr;
      const steps = sRows || [];

      // Group steps by question and compute per-decode accuracy
      const stepsByQ = new Map<string, any[]>();
      for (const s of steps) {
        const arr = stepsByQ.get(s.question_id) || [];
        arr.push(s);
        stepsByQ.set(s.question_id, arr);
      }

      // Build decodes list (chronological ascending for chart)
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
          marks: Number(q.marks || 0),
          timeSpentMinutes: Number(q.time_spent_minutes || 0),
          tokensEarned: Number(q.tokens_earned || 0),
          accuracy: acc,
          answered: answeredCount > 0,
        };
      });

      // Aggregates
      const attemptCount = items.length;
      const answeredItems = items.filter(it => it.answered);
      const avgAccuracy = answeredItems.length > 0 ? Math.round(answeredItems.reduce((s, it) => s + it.accuracy, 0) / answeredItems.length) : 0;
      const avgMarks = attemptCount > 0 ? Number((items.reduce((s, it) => s + it.marks, 0) / attemptCount).toFixed(1)) : 0;
      const tokensTotal = items.reduce((s, it) => s + it.tokensEarned, 0);
      const times = items.map(it => it.timeSpentMinutes).sort((a, b) => a - b);
      const mid = Math.floor(times.length / 2);
      const medianTime = times.length === 0 ? 0 : times.length % 2 === 1 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2);
      const aggs: PerformanceAggregates = { avgAccuracy, attemptCount, avgMarks, medianTime, tokensTotal };

      setDecodes(items);
      setAggregates(aggs);
      setState('data');
    } catch (e) {
      setState('error');
    }
  }, [userId]);

  React.useEffect(() => { void recompute(timeframe); }, [timeframe, recompute]);

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


