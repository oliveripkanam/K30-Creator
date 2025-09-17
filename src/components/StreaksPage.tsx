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

  // Monthly calendar data (Figma-like layout)
  const today = new Date();
  const startDate = new Date(days[0]);
  const monthBlocks = React.useMemo(() => {
    const blocks: Array<{ year: number; month: number; name: string; weeks: Date[][] }> = [];
    let cur = new Date(startDate);
    cur.setDate(1);
    while (cur <= today) {
      const month = cur.getMonth();
      const year = cur.getFullYear();
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);
      const calStart = new Date(monthStart);
      calStart.setDate(monthStart.getDate() - monthStart.getDay()); // start on Sunday
      const calEnd = new Date(monthEnd);
      calEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay())); // end on Saturday
      const weeks: Date[][] = [];
      let weekStart = new Date(calStart);
      while (weekStart <= calEnd) {
        const wk: Date[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart);
          d.setDate(weekStart.getDate() + i);
          wk.push(d);
        }
        weeks.push(wk);
        weekStart.setDate(weekStart.getDate() + 7);
      }
      blocks.push({ year, month, name: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), weeks });
      cur = new Date(year, month + 1, 1);
    }
    return blocks;
  }, [startDate, today]);

  const todayKey = formatKey(new Date(new Date().setHours(0,0,0,0)));
  const isInRange = (d: Date) => d >= startDate && d <= today;
  const isSameMonth = (d: Date, m: number) => d.getMonth() === m;
  const levelFor = (c: number, dim: boolean) => {
    const base = c === 0 ? 'bg-gray-50 border-gray-200' : c < 2 ? 'bg-green-50 border-green-200' : c < 4 ? 'bg-green-100 border-green-300' : 'bg-green-200 border-green-400';
    return base + (dim ? ' opacity-30' : '');
  };

  return (
    <div className="min-h-screen bg-white">
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
            <div className="space-y-8">
              {monthBlocks.map((blk) => (
                <div key={`${blk.year}-${blk.month}`} className="space-y-2">
                  <h3 className="text-lg font-medium">{blk.name}</h3>
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                      <div key={d} className="text-center text-sm text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {blk.weeks.map((w, wi) => (
                      <div key={wi} className="grid grid-cols-7 gap-1">
                        {w.map((d, di) => {
                          const k = formatKey(d);
                          const c = countByDay[k] || 0;
                          const dim = !isSameMonth(d, blk.month) || !isInRange(d);
                          const isTodayCell = k === todayKey;
                          return (
                            <div key={di} className={`relative w-12 h-12 border rounded-lg ${levelFor(c, dim)} ${isTodayCell ? 'ring-2 ring-primary ring-offset-2' : ''}`} title={`${k} • ${c} question${c===1?'':'s'}`}>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-sm ${dim ? 'text-muted-foreground' : 'text-foreground'}`}>{d.getDate()}</span>
                              </div>
                              {c > 0 && !dim && <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-4">
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


