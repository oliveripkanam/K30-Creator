import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import { MechanicsRadarChart } from './RadarChart';
import { RecentPerformanceCardContainer } from './RecentPerformanceCardContainer';
import { supabase } from '../lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { MILESTONES } from '../constants/catalog';

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

interface DashboardProps {
  user: User;
  onStartDecoding: () => void;
  onViewHistory: () => void;
  onLogout: () => void;
  onOpenMilestones?: () => void;
  onOpenStreaks?: () => void;
}

// Small sparkline component that queries last 10 decodes and computes accuracy
function TrendSparkline({ userId }: { userId: string }) {
  const [points, setPoints] = React.useState<Array<{ x: number; y: number; label: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        // 1) Fetch last 10 questions for this user
        const { data: qRows, error: qErr } = await supabase
          .from('questions')
          .select('id, decoded_at, marks, time_spent_minutes, time_spent_seconds, tokens_earned')
          .eq('user_id', userId)
          .order('decoded_at', { ascending: false })
          .limit(10);
        if (qErr) throw qErr;
        const questions = qRows || [];
        if (questions.length === 0) { if (!cancelled) { setPoints([]); setLoading(false); } return; }

        const ids = questions.map((q: any) => q.id);
        // 2) Fetch steps for those questions
        const { data: sRows, error: sErr } = await supabase
          .from('mcq_steps')
          .select('question_id, is_correct, user_answer, correct_label')
          .in('question_id', ids);
        if (sErr) throw sErr;
        const steps = sRows || [];

        // 3) Group and compute accuracy per question in chronological order (oldest→newest for sparkline)
        const byQ = new Map<string, any[]>();
        for (const s of steps) {
          const arr = byQ.get(s.question_id) || []; arr.push(s); byQ.set(s.question_id, arr);
        }
        const chronological = [...questions].sort((a: any, b: any) => new Date(a.decoded_at).getTime() - new Date(b.decoded_at).getTime());
        const computed = chronological.map((q: any, idx: number) => {
          const list = byQ.get(q.id) || [];
          const total = list.length || 1;
          let correct = 0;
          for (const s of list) {
            const isTrue = s.is_correct === true || (s.user_answer && s.correct_label && String(s.user_answer).toUpperCase() === String(s.correct_label).toUpperCase());
            if (isTrue) correct += 1;
          }
          const acc = Math.round((correct / total) * 100);
          const secs = Math.max(0, Math.round(((q.time_spent_seconds ?? null) != null ? Number(q.time_spent_seconds) : (q.time_spent_minutes || 0) * 60)));
          const mm = Math.floor(secs / 60); const ss = secs % 60;
          const timeFmt = mm <= 0 ? `${ss}s` : `${mm} min ${ss}s`;
          const label = `${new Date(q.decoded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} • ${acc}% • ${q.marks || 0} marks • ${timeFmt} • ${q.tokens_earned || 0} tokens`;
          return { x: idx, y: acc, label };
        });
        if (!cancelled) setPoints(computed);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load trend');
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading trend…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }
  if (points.length < 2) {
    return (
      <div className="p-4 bg-muted/50 rounded border text-sm text-muted-foreground">
        A trend will appear when you’ve completed a couple of decodes.
      </div>
    );
  }

  // Render a simple SVG sparkline
  const width = 600; const height = 100; const padding = 12;
  const xs = points.map((p, i) => padding + (i * (width - 2 * padding)) / (points.length - 1));
  const ys = points.map(p => padding + (height - 2 * padding) * (1 - p.y / 100));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x},${ys[i]}`).join(' ');

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="min-w-[600px]">
        <path d={path} fill="none" stroke="#2563eb" strokeWidth={2} />
        {xs.map((x, i) => (
          <g key={i}>
            <circle cx={x} cy={ys[i]} r={3} fill="#2563eb">
              <title>{points[i].label}</title>
            </circle>
          </g>
        ))}
        {/* y-axis labels */}
        <text x={4} y={padding + 4} fontSize="10" fill="#64748b">100%</text>
        <text x={4} y={height - padding} fontSize="10" fill="#64748b">0%</text>
      </svg>
    </div>
  );
}

export function Dashboard({ user, onStartDecoding, onViewHistory, onLogout, onOpenMilestones, onOpenStreaks }: DashboardProps) {
  const streakGoal = 30;
  const nextMilestone = Math.ceil(user.questionsDecoded / 10) * 10;
  const prevMilestone = [...MILESTONES].filter(m => m <= user.questionsDecoded).sort((a,b)=>a-b).pop() || 0;
  const nextMilestoneVal = [...MILESTONES].find(m => m > user.questionsDecoded) || MILESTONES[MILESTONES.length - 1];
  const progressToNextMilestone = user.questionsDecoded === prevMilestone && user.questionsDecoded !== 0
    ? 100
    : Math.max(0, Math.min(100, ((user.questionsDecoded - prevMilestone) / (nextMilestoneVal - prevMilestone)) * 100));

  // Mock performance data across different mechanics topics
  const performanceData = [
    { topic: "Forces", proficiency: 85, maxScore: 100 },
    { topic: "Projectile Motion", proficiency: 92, maxScore: 100 },
    { topic: "Momentum", proficiency: 78, maxScore: 100 },
    { topic: "Energy", proficiency: 88, maxScore: 100 },
    { topic: "Circular Motion", proficiency: 65, maxScore: 100 },
    { topic: "Oscillations", proficiency: 72, maxScore: 100 }
  ];

  // Trend sparkline data (to be fed from API soon; temporary derived from user totals if needed)
  // Inline mini component for sparkline; query will be added in App and passed via context later if needed
  const TrendSparkline: any = () => null as any;
  TrendSparkline.Definitions = () => null as any;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Trend sparkline removed; using RecentPerformanceCardContainer */}
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 48 48" strokeWidth="1.5">
                {/* Opened box at bottom - larger size */}
                <g>
                  {/* Box base */}
                  <rect x="8" y="30" width="32" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
                  
                  {/* Box flaps - opened outward */}
                  <path d="M8 30 L4 26 L8 26" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M40 30 L44 26 L40 26" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M24 30 L24 24 L20 24" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M24 30 L24 24 L28 24" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
                
                {/* Brain outline - larger and positioned on top of opened box */}
                <path 
                  d="M12 30c0-3 2-6 4-7 2-3 4-4 8-4s6 1 8 4c2 1 4 4 4 7 0 1.5-0.5 3-1 4 0.5 1.5 1 2.5 1 4 0 3-2 6-4 7-1.5 1.5-3 1.5-4.5 1.5-1.5 3-4.5 4.5-7.5 4.5s-6-1.5-7.5-4.5c-1.5 0-3 0-4.5-1.5-2-1-4-4-4-7 0-1.5 0.5-2.5 1-4-0.5-1-1-2.5-1-4z" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                
                {/* Brain details - left hemisphere curves */}
                <path 
                  d="M16 22c2-1.5 3-1.5 4.5 0" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <path 
                  d="M14 28c2-1 3-1 4.5 0" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <path 
                  d="M15 34c1.5-0.5 2.5-0.5 4 0" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                
                {/* Brain details - right hemisphere curves */}
                <path 
                  d="M27.5 22c2-1.5 3-1.5 4.5 0" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <path 
                  d="M29.5 28c2-1 3-1 4.5 0" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                <path 
                  d="M29 34c1.5-0.5 2.5-0.5 4 0" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
                
                {/* Brain division line */}
                <path 
                  d="M24 20 L24 38" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                  opacity="0.4"
                />
                
                {/* AI text inside brain - larger */}
                <text x="24" y="30" textAnchor="middle" dominantBaseline="middle" fontSize="7" fontWeight="bold" fill="currentColor" stroke="none">
                  AI
                </text>
              </svg>
            </div>
            <h1 className="text-lg sm:text-xl font-medium">AI Maths Decoder</h1>
          </div>
          <Button variant="outline" size="sm" onClick={onLogout} className="text-sm">
            <span className="hidden sm:inline">Sign Out</span>
            <span className="sm:hidden">Exit</span>
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        {/* Welcome Section */}
        <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Avatar className="w-12 h-12 sm:w-16 sm:h-16">
              <AvatarImage src={user.avatar || '/img/microsoft-default.png'} alt={user.name} />
              <AvatarFallback>{user.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-lg sm:text-xl mb-1">Welcome back, {user.name.split(' ')[0]}!</h2>
              <p className="text-muted-foreground text-sm sm:text-base">Ready to decode some mechanics problems?</p>
              <div className="flex items-center justify-center sm:justify-start space-x-2 mt-2">
                <div className="flex items-center space-x-1 bg-yellow-100 px-2 py-1 rounded-full">
                  <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-sm font-medium text-yellow-700">{user.tokens.toLocaleString()}</span>
                  <span className="text-xs text-yellow-600">tokens</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
              <Button onClick={onStartDecoding} size="lg" className="h-12 px-6 sm:px-8 w-full sm:w-auto">
                Start Decoding
              </Button>
              <Button onClick={onViewHistory} variant="outline" size="sm" className="w-full sm:w-auto">
                View History
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card role="button" onClick={onOpenMilestones} className="cursor-pointer">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xl sm:text-2xl">{user.questionsDecoded}</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Questions Decoded</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm text-muted-foreground space-y-1 sm:space-y-0">
                <span>Next milestone: {nextMilestoneVal}</span>
                <span>{Math.max(0, nextMilestoneVal - user.questionsDecoded)} to go</span>
              </div>
              <Progress value={progressToNextMilestone} className="mt-2" />
            </CardContent>
          </Card>

          <Card role="button" onClick={onOpenStreaks} className="cursor-pointer">
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xl sm:text-2xl flex items-center">
                {user.currentStreak}
                <span className="ml-2 text-base sm:text-lg">🔥</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Day Streak</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm text-muted-foreground space-y-1 sm:space-y-0">
                <span>Goal: {streakGoal}</span>
                <span>{streakGoal - user.currentStreak} to go</span>
              </div>
              <Progress value={(user.currentStreak / streakGoal) * 100} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xl sm:text-2xl">{user.totalMarks}</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Total Marks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs sm:text-sm text-muted-foreground">
                Avg: {user.questionsDecoded > 0 ? (user.totalMarks / user.questionsDecoded).toFixed(1) : 0} per question
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xl sm:text-2xl flex items-center">
                {user.tokens.toLocaleString()}
                <span className="ml-2 text-base sm:text-lg">⭐</span>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Tokens Earned</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xs sm:text-sm text-muted-foreground">
                Solve quickly for bonus tokens
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Performance Trend (designed card) */}
        <RecentPerformanceCardContainer userId={user.id} onOpenHistory={onViewHistory} />

        {/* Performance Portfolio - Radar Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Performance Portfolio</CardTitle>
              <CardDescription>Your proficiency across mechanics topics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 sm:h-80">
                <MechanicsRadarChart data={performanceData} />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overall Average:</span>
                  <span className="font-medium">
                    {Math.round(performanceData.reduce((acc, item) => acc + item.proficiency, 0) / performanceData.length)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Strongest Area:</span>
                  <span className="font-medium text-green-600">
                    {performanceData.reduce((prev, current) => 
                      (prev.proficiency > current.proficiency) ? prev : current
                    ).topic}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Focus Area:</span>
                  <span className="font-medium text-orange-600">
                    {performanceData.reduce((prev, current) => 
                      (prev.proficiency < current.proficiency) ? prev : current
                    ).topic}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Achievement Badges */}
          <Card>
            <CardHeader>
              <CardTitle>Achievements</CardTitle>
              <CardDescription>Your progress milestones</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {user.questionsDecoded >= 1 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    🚀 First Question
                  </Badge>
                )}
                {user.questionsDecoded >= 10 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    📊 Problem Solver
                  </Badge>
                )}
                {user.questionsDecoded >= 25 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    🎯 Sharpshooter
                  </Badge>
                )}
                {user.currentStreak >= 7 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    🔥 Week Warrior
                  </Badge>
                )}
                {user.currentStreak >= 30 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    🏆 Month Master
                  </Badge>
                )}
                {user.totalMarks >= 100 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    💯 Century Club
                  </Badge>
                )}
                {user.tokens >= 500 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    💰 Token Collector
                  </Badge>
                )}
                {user.tokens >= 1000 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    🌟 Star Performer
                  </Badge>
                )}
                {user.tokens >= 2000 && (
                  <Badge variant="secondary" className="px-3 py-1">
                    👑 Token King
                  </Badge>
                )}
              </div>
              
              {/* Topic-specific achievements */}
              <Separator className="my-4" />
              <div className="space-y-3">
                <p className="text-sm font-medium">Topic Mastery</p>
                <div className="space-y-2">
                  {performanceData.map((topic, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{topic.topic}</span>
                      <div className="flex items-center space-x-2">
                        <Progress value={topic.proficiency} className="w-16 h-2" />
                        <span className="text-xs font-medium w-8">{topic.proficiency}%</span>
                        {topic.proficiency >= 90 && (
                          <Badge variant="default" className="text-xs px-1 py-0">🏅</Badge>
                        )}
                        {topic.proficiency >= 80 && topic.proficiency < 90 && (
                          <Badge variant="secondary" className="text-xs px-1 py-0">⭐</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Questions</CardTitle>
            <CardDescription>Your latest decoded problems</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { topic: "Projectile Motion", marks: 6, time: "2 hours ago", difficulty: "Hard" },
                { topic: "Forces and Equilibrium", marks: 4, time: "1 day ago", difficulty: "Medium" },
                { topic: "Momentum Conservation", marks: 5, time: "2 days ago", difficulty: "Hard" },
              ].map((question, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <h4 className="font-medium">{question.topic}</h4>
                    <p className="text-sm text-muted-foreground">{question.time}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Badge variant={question.difficulty === 'Hard' ? 'destructive' : question.difficulty === 'Medium' ? 'default' : 'secondary'}>
                      {question.difficulty}
                    </Badge>
                    <span className="font-medium">{question.marks} marks</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}