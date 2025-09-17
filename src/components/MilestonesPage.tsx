import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { MILESTONES, MILESTONE_REWARDS } from '../constants/catalog';

type MilestoneStatus = 'completed' | 'in-progress' | 'locked';

interface MilestoneView {
  milestone: number;
  reward: number;
  status: MilestoneStatus;
  progressPercent: number;
}

interface MilestonesPageProps {
  questionsDecoded: number;
  onBack: () => void;
}

export function MilestonesPage({ questionsDecoded, onBack }: MilestonesPageProps) {
  const prevCompleted = useMemo(() => {
    return [...MILESTONES].filter(m => m <= questionsDecoded).sort((a,b)=>a-b).pop() || 0;
  }, [questionsDecoded]);

  const nextMilestone = useMemo(() => {
    return [...MILESTONES].find(m => m > questionsDecoded) || MILESTONES[MILESTONES.length - 1];
  }, [questionsDecoded]);

  const overallPct = useMemo(() => {
    if (questionsDecoded === prevCompleted && questionsDecoded !== 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((questionsDecoded - prevCompleted) / (nextMilestone - prevCompleted)) * 100)));
  }, [questionsDecoded, prevCompleted, nextMilestone]);

  const toGo = Math.max(0, nextMilestone - questionsDecoded);

  const milestoneViews: MilestoneView[] = useMemo(() => {
    return MILESTONES.map((m) => {
      const reward = MILESTONE_REWARDS[m] || 0;
      let status: MilestoneStatus = 'locked';
      if (questionsDecoded >= m) {
        status = 'completed';
      } else if (prevCompleted < m && nextMilestone >= m) {
        status = 'in-progress';
      }
      let progressPercent = 0;
      if (status === 'completed') progressPercent = 100;
      else if (status === 'in-progress') {
        const baseline = prevCompleted;
        progressPercent = Math.max(0, Math.min(100, Math.round(((questionsDecoded - baseline) / (m - baseline)) * 100)));
      }
      return { milestone: m, reward, status, progressPercent };
    });
  }, [questionsDecoded, prevCompleted, nextMilestone]);

  const [selected, setSelected] = useState<MilestoneView | null>(null);

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
            <h1 className="text-lg font-medium">Milestones</h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {/* Next Milestone Banner */}
        <Card className="mx-0">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-medium">Next milestone: {nextMilestone}</h2>
                <p className="text-muted-foreground">You're {toGo} question{toGo===1?'':'s'} away</p>
              </div>
              <Button variant="link" size="sm" className="text-primary" onClick={onBack}>View streaks</Button>
            </div>
            <div className="space-y-2">
              <Progress value={overallPct} className="h-3" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{questionsDecoded} decoded</span>
                <span>{overallPct}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Milestone Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {milestoneViews.map((mv) => (
            <Card
              key={mv.milestone}
              className={`cursor-pointer transition-all hover:shadow-md
                ${mv.status === 'completed' ? 'border-green-200 bg-green-50' : ''}
                ${mv.status === 'in-progress' ? 'border-gray-200 bg-white' : ''}
                ${mv.status === 'locked' ? 'border-gray-200 bg-gray-50' : ''}
              `}
              onClick={() => setSelected(mv)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-medium">{mv.milestone} Decodes</h3>
                </div>
                <Badge
                  variant={mv.status === 'completed' ? 'default' : mv.status === 'in-progress' ? 'secondary' : 'outline'}
                  className={`${mv.status === 'completed' ? 'bg-green-100 text-green-800 border-green-200' : ''} mb-3`}
                >
                  {mv.status === 'completed' ? `Awarded +${mv.reward}` : `+${mv.reward} tokens`}
                </Badge>
                <div className="space-y-2">
                  <p className={`text-sm ${mv.status === 'completed' ? 'text-green-700' : mv.status === 'locked' ? 'text-gray-500' : 'text-muted-foreground'}`}>
                    {mv.status === 'completed' ? 'Completed' : mv.status === 'in-progress' ? `In progress • ${mv.progressPercent}%` : 'Locked'}
                  </p>
                  {mv.status === 'in-progress' && (
                    <Progress value={mv.progressPercent} className="h-2" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.milestone} Decodes Milestone</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant={selected.status === 'completed' ? 'default' : 'secondary'}>
                    {selected.status === 'completed' ? `Awarded +${selected.reward}` : `+${selected.reward} tokens`}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {selected.status === 'completed' ? 'Completed' : selected.status === 'in-progress' ? `${questionsDecoded}/${selected.milestone} decodes` : 'Not yet unlocked'}
                  </span>
                </div>
                {selected.status === 'in-progress' && (
                  <div className="space-y-2">
                    <Progress value={selected.progressPercent} className="h-2" />
                    <p className="text-sm text-muted-foreground">{selected.progressPercent}% complete</p>
                  </div>
                )}
                <div className="space-y-2">
                  <h4 className="font-medium">Progress</h4>
                  <ul className="space-y-1">
                    {(
                      selected.status === 'completed' ? [
                        'Great job! You\'ve earned these tokens.',
                        'Keep decoding to reach the next milestone.',
                      ] : selected.status === 'in-progress' ? [
                        'You\'re making great progress!',
                        'Keep answering questions to reach this milestone.',
                      ] : [
                        'Complete previous milestones to unlock this one.',
                        'Each question you decode brings you closer to rewards.',
                      ]
                    ).map((tip, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

