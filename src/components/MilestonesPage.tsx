import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { MILESTONES, MILESTONE_REWARDS } from '../constants/catalog';

interface MilestonesPageProps {
  questionsDecoded: number;
  onBack: () => void;
}

export function MilestonesPage({ questionsDecoded, onBack }: MilestonesPageProps) {
  const prev = [...MILESTONES].filter(m => m <= questionsDecoded).sort((a,b)=>a-b).pop() || 0;
  const next = [...MILESTONES].find(m => m > questionsDecoded) || MILESTONES[MILESTONES.length - 1];
  const nxtIdx = Math.max(0, MILESTONES.indexOf(next));
  const upcoming = MILESTONES.slice(nxtIdx, nxtIdx + 3);
  const completed = MILESTONES.filter(m => m <= questionsDecoded);
  const pct = questionsDecoded === prev && questionsDecoded !== 0 ? 100 : Math.max(0, Math.min(100, Math.round(((questionsDecoded - prev) / (next - prev)) * 100)));
  const toGo = Math.max(0, next - questionsDecoded);

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
            <h1 className="text-lg font-medium">Milestones</h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Hero: Next Milestone */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2 text-white">
                  <span className="text-xl font-semibold">Next Milestone</span>
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-white/20 text-white">+{MILESTONE_REWARDS[next] || 0} tokens</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">{next} decodes</h2>
                <p className="text-white/90 mt-1">You're {toGo} question{toGo===1?'':'s'} away</p>
              </div>
              <div aria-hidden className="hidden sm:block text-white/80">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M8 21h8M12 17l-3 4h6l-3-4zm0-1c3.866 0 7-3.134 7-7V5l-3 2-4-4-4 4-3-2v4c0 3.866 3.134 7 7 7z"/>
                </svg>
              </div>
            </div>
          </div>
          <CardContent className="pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{questionsDecoded} decoded</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-4" />
            </div>
          </CardContent>
        </Card>

        {/* Upcoming (subtle) */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Upcoming</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcoming.map((m) => {
              const reward = MILESTONE_REWARDS[m] || 0;
              const inRange = prev < m && next >= m;
              const localPct = inRange ? Math.max(0, Math.min(100, Math.round(((questionsDecoded - prev) / (m - prev)) * 100))) : 0;
              return (
                <Card key={m} className="bg-muted/40 border-dashed">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-muted-foreground">{m} decodes</CardTitle>
                      <Badge variant="outline" className="text-xs">+{reward}</Badge>
                    </div>
                    <CardDescription className="text-xs">{inRange ? `In progress • ${localPct}%` : 'Locked'}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress value={localPct} className="h-1.5" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Completed (compact chips) */}
        {completed.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Completed</h3>
            <div className="flex flex-wrap gap-2">
              {completed.map((m) => (
                <span key={m} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">
                  <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                  {m} (+{MILESTONE_REWARDS[m] || 0})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


