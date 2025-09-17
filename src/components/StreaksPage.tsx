import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ChevronLeft, ChevronRight, Flame, Target, Calendar as CalIcon, Hash } from 'lucide-react';
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

  // Simple-calendar view state
  const [currentDate, setCurrentDate] = React.useState<Date>(new Date());
  const today = new Date();
  const isToday = (d: Date) => d.toDateString() === today.toDateString();
  const isCurrentMonth = (d: Date) => d.getMonth() === currentDate.getMonth();
  const formatKey = (d: Date) => {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  const generateWeeks = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const start = new Date(firstDay);
    start.setDate(start.getDate() - firstDay.getDay()); // Sunday start
    const weeks: Date[][] = [];
    let cursor = new Date(start);
    for (let w = 0; w < 6; w++) {
      const row: Date[] = [];
      for (let d = 0; d < 7; d++) { row.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
      weeks.push(row);
      if (cursor > lastDay && w >= 3) break;
    }
    return weeks;
  };
  const weeks = generateWeeks();
  const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const navigateMonth = (dir: 'prev' | 'next') => {
    const nd = new Date(currentDate);
    nd.setMonth(nd.getMonth() + (dir === 'prev' ? -1 : 1));
    setCurrentDate(nd);
  };

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

  const todayKey = formatKey(new Date(new Date().setHours(0,0,0,0)));
  const activityLevel = (c: number) => c === 0 ? 'none' : c <= 2 ? 'low' : c <= 4 ? 'medium' : 'high';
  const cellColor = (level: string, currentMonth: boolean) => {
    const dim = currentMonth ? '' : ' opacity-40';
    switch (level) {
      case 'low': return 'bg-green-50 border-green-200' + dim;
      case 'medium': return 'bg-green-100 border-green-300' + dim;
      case 'high': return 'bg-green-200 border-green-400' + dim;
      default: return 'bg-background border-border' + dim;
    }
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

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header (month navigation) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')} className="h-10 w-10"><ChevronLeft className="h-5 w-5" /></Button>
            <h1 className="text-3xl font-semibold text-foreground">{monthYear}</h1>
            <Button variant="outline" size="icon" onClick={() => navigateMonth('next')} className="h-10 w-10"><ChevronRight className="h-5 w-5" /></Button>
          </div>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Today</Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[{t:'Current Streak',v:`${current} days`,Icon:Flame,color:'text-orange-600'},{t:'Longest Streak',v:`${longest} days`,Icon:Target,color:'text-green-600'},{t:'Days Active',v:`${daysSolved} of ${days.length}`,Icon:CalIcon,color:'text-green-700'},{t:'Total Questions',v:`${totalQuestions}`,Icon:Hash,color:'text-purple-600'}].map((c,idx)=> (
            <Card key={idx}><CardContent className="p-4"><div className="flex items-center gap-3"><c.Icon className={`h-5 w-5 ${c.color}`} /><div><p className="text-sm text-muted-foreground">{c.t}</p><div className="text-2xl font-medium">{c.v}</div></div></div></CardContent></Card>
          ))}
        </div>

        {/* Calendar grid */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-7 gap-4 mb-4">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d)=>(<div key={d} className="text-center py-2"><span className="text-sm font-medium text-muted-foreground">{d}</span></div>))}
            </div>
            <div className="space-y-2">
              {weeks.map((wk, wi)=> (
                <div key={wi} className="grid grid-cols-7 gap-4">
                  {wk.map((d, di)=>{
                    const k = formatKey(d);
                    const c = countByDay[k] || 0;
                    const level = activityLevel(c);
                    const isCur = isCurrentMonth(d);
                    const isTod = isToday(d);
                    return (
                      <div key={di} className={`relative h-16 rounded-lg border-2 transition-all ${cellColor(level, isCur)} ${isTod ? 'ring-2 ring-primary ring-offset-2' : ''} ${!isCur ? 'opacity-60' : ''}`} title={`${k} • ${c} question${c===1?'':'s'}`}>
                        <div className="absolute top-2 left-2"><span className={`text-lg font-medium ${isTod ? 'text-primary' : isCur ? 'text-foreground' : 'text-muted-foreground'}`}>{d.getDate()}</span></div>
                        {c > 0 && isCur && <div className="absolute top-2 right-2 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" />{c>1 && <span className="text-xs font-medium text-green-700">{c}</span>}</div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground mt-4">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded border bg-background"></div><span>No activity</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-100 border-green-200"></div><span>Low activity</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-200 border-green-300"></div><span>High activity</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


