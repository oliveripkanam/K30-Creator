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
        <Card>
          <CardHeader>
            <CardTitle>Next Milestone: {next}</CardTitle>
            <CardDescription>You're {toGo} question{toGo===1?'':'s'} away</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{questionsDecoded} decoded</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-3" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MILESTONES.map((m) => {
            const reached = questionsDecoded >= m;
            const reward = MILESTONE_REWARDS[m] || 0;
            const inRange = !reached && prev < m && next >= m;
            const localPct = inRange ? Math.max(0, Math.min(100, Math.round(((questionsDecoded - prev) / (m - prev)) * 100))) : reached ? 100 : 0;
            return (
              <Card key={m} className={reached ? 'border-green-300' : 'border-gray-200'}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{m} Decodes</CardTitle>
                    {reached ? (
                      <Badge variant="secondary">Awarded +{reward}</Badge>
                    ) : (
                      <Badge variant="outline">+{reward} tokens</Badge>
                    )}
                  </div>
                  <CardDescription>
                    {reached ? 'Completed' : inRange ? `In progress • ${localPct}%` : 'Locked'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Progress value={localPct} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}


