import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { supabase } from '../lib/supabase';

type Range = 30 | 90 | 180;

function formatKey(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function buildRangeDays(days: number): Date[] {
  const out: Date[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);
    out.push(d);
  }
  return out;
}

function computeStreaks(countByDay: Record<string, number>, days: Date[]) {
  // Current streak: consecutive days ending today
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const key = formatKey(days[i]);
    const has = (countByDay[key] || 0) > 0;
    if (has) current++; else break;
  }
  // Longest streak in range
  let longest = 0; let run = 0;
  for (let i = 0; i < days.length; i++) {
    const key = formatKey(days[i]);
    const has = (countByDay[key] || 0) > 0;
    if (has) { run++; longest = Math.max(longest, run); } else { run = 0; }
  }
  // Totals
  let daysSolved = 0; let totalQuestions = 0;
  for (const d of days) {
    const c = countByDay[formatKey(d)] || 0;
    if (c > 0) daysSolved++;
    totalQuestions += c;
  }
  return { current, longest, daysSolved, totalQuestions };
}

interface StreaksPageProps {
  userId: string;
  onBack: () => void;
}

export function StreaksPage({ userId, onBack }: StreaksPageProps) {
  const [range, setRange] = React.useState<Range>(30);
  const [days, setDays] = React.useState<Date[]>(buildRangeDays(30));
  const [countByDay, setCountByDay] = React.useState<Record<string, number>>({});
  const { current, longest, daysSolved, totalQuestions } = computeStreaks(countByDay, days);

  React.useEffect(() => { setDays(buildRangeDays(range)); }, [range]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const from = days[0]; const to = days[days.length - 1];
        const { data, error } = await supabase
          .from('questions')
          .select('decoded_at')
          .eq('user_id', userId)
          .gte('decoded_at', from.toISOString())
          .lte('decoded_at', new Date(to.getTime() + 24*60*60*1000).toISOString());
        if (error) throw error;
        const map: Record<string, number> = {};
        for (const r of (data || [])) {
          const d = new Date(r.decoded_at);
          d.setHours(0,0,0,0);
          const k = formatKey(d);
          map[k] = (map[k] || 0) + 1;
        }
        if (!cancelled) setCountByDay(map);
      } catch {
        // fallback empty; UI will show zeros
        if (!cancelled) setCountByDay({});
      }
    })();
    return () => { cancelled = true; };
  }, [userId, range, days]);

  // Prepare grid weeks (GitHub-style)
  const first = days[0];
  const startWeekday = first.getDay(); // 0 Sun ... 6 Sat
  const paddedDays: (Date | null)[] = Array(startWeekday === 0 ? 6 : startWeekday - 1).fill(null);
  // We want Monday-first grid: convert JS weekday to Mon=0..Sun=6
  const normalizeMonFirst = (d: Date) => (d.getDay() + 6) % 7;
  const padCount = normalizeMonFirst(first);
  const calendarCells: (Date | null)[] = Array(padCount).fill(null).concat(days);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < calendarCells.length; i += 7) weeks.push(calendarCells.slice(i, i + 7));

  const todayKey = formatKey(new Date(new Date().setHours(0,0,0,0)));

  const levelFor = (c: number) => c === 0 ? 'bg-gray-200' : c < 2 ? 'bg-green-200' : c < 4 ? 'bg-green-400' : 'bg-green-600';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Button>
            <h1 className="text-lg font-medium">Streaks</h1>
          </div>
          <div className="flex items-center space-x-2">
            {[30, 90, 180].map((r) => (
              <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => setRange(r as Range)}>
                Last {r} days
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Current Streak</CardDescription><CardTitle>{current} days</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Longest Streak</CardDescription><CardTitle>{longest} days</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Days Solved</CardDescription><CardTitle>{daysSolved}/{days.length}</CardTitle></CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total Questions</CardDescription><CardTitle>{totalQuestions}</CardTitle></CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>Each cell shows questions completed that day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="inline-grid grid-rows-7 gap-1" style={{ gridAutoFlow: 'column' }}>
                {weeks.map((w, wi) => (
                  <div key={wi} className="grid grid-rows-7 gap-1">
                    {Array.from({ length: 7 }).map((_, ri) => {
                      const d = w?.[ri] || null;
                      const k = d ? formatKey(d) : '';
                      const count = d ? (countByDay[k] || 0) : 0;
                      const isToday = d && k === todayKey;
                      return (
                        <div key={ri} className={`w-4 h-4 rounded ${d ? levelFor(count) : 'bg-transparent'} ${isToday ? 'ring-2 ring-blue-500' : ''}`} title={d ? `${k} • ${count} question${count===1?'':'s'}` : ''} />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-3">
              <span>Less</span>
              <div className="w-4 h-3 rounded bg-gray-200" />
              <div className="w-4 h-3 rounded bg-green-200" />
              <div className="w-4 h-3 rounded bg-green-400" />
              <div className="w-4 h-3 rounded bg-green-600" />
              <span>More</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


