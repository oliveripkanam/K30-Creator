import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import { MechanicsRadarChart } from './RadarChart';

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
}

export function Dashboard({ user, onStartDecoding, onViewHistory, onLogout }: DashboardProps) {
  const streakGoal = 30;
  const nextMilestone = Math.ceil(user.questionsDecoded / 10) * 10;
  const progressToNextMilestone = ((user.questionsDecoded % 10) / 10) * 100;

  // Mock performance data across different mechanics topics
  const performanceData = [
    { topic: "Forces", proficiency: 85, maxScore: 100 },
    { topic: "Projectile Motion", proficiency: 92, maxScore: 100 },
    { topic: "Momentum", proficiency: 78, maxScore: 100 },
    { topic: "Energy", proficiency: 88, maxScore: 100 },
    { topic: "Circular Motion", proficiency: 65, maxScore: 100 },
    { topic: "Oscillations", proficiency: 72, maxScore: 100 }
  ];

  // Get top 3 most common mistakes
  const topMistakes = user.commonMistakes
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
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
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-xl sm:text-2xl">{user.questionsDecoded}</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Questions Decoded</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm text-muted-foreground space-y-1 sm:space-y-0">
                <span>Milestone: {nextMilestone}</span>
                <span>{10 - (user.questionsDecoded % 10)} to go</span>
              </div>
              <Progress value={progressToNextMilestone} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
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

        {/* Common Mistakes Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>Top 3 Common Mistakes</span>
            </CardTitle>
            <CardDescription>Areas that need your attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {topMistakes.map((mistake, index) => (
                <div key={mistake.id} className="p-4 rounded-lg border border-orange-200 bg-orange-50/50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center text-sm font-medium text-orange-800">
                        {index + 1}
                      </span>
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">
                        {mistake.category}
                      </Badge>
                    </div>
                    <span className="text-xs font-medium text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                      {mistake.count}x
                    </span>
                  </div>
                  <p className="text-sm text-orange-800 mb-3 leading-relaxed">{mistake.description}</p>
                  <div className="flex items-center text-xs text-orange-600">
                    <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Last seen: {mistake.lastOccurred.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start space-x-2">
                <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-blue-700">
                  Focus on these patterns during your next problem-solving sessions. AI will help you avoid these mistakes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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