import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { Dashboard } from './components/Dashboard';
import { QuestionInput } from './components/QuestionInput';
import { TextExtractor } from './components/TextExtractor';
import { TextVerification } from './components/TextVerification';
import { QuestionDecoder } from './components/QuestionDecoder';
import { MCQInterface } from './components/MCQInterface';
import { SolutionSummaryComponent } from './components/SolutionSummary';
import { QuestionHistory } from './components/QuestionHistory';

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

interface Question {
  id: string;
  content: string;
  extractedText?: string; // For photos and PDFs
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
  fileData?: { base64: string; mimeType: string; name: string };
}

interface CompletedQuestion extends Question {
  completedAt: Date;
  tokensEarned: number;
  mcqsGenerated: number;
  timeSpent: number; // in minutes
  solutionSummary: SolutionSummary;
}

interface MCQ {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  hint: string;
  explanation: string;
  step: number;
  calculationStep?: {
    formula?: string;
    substitution?: string;
    result?: string;
  };
}

interface SolutionSummary {
  finalAnswer: string;
  unit: string;
  workingSteps: string[];
  keyFormulas: string[];
}

type AppState = 'login' | 'dashboard' | 'input' | 'extractor' | 'verify' | 'decoder' | 'mcq' | 'solution' | 'history';

export default function App() {
  const [currentState, setCurrentState] = useState<AppState>('login');
  const [user, setUser] = useState<User | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [mcqs, setMCQs] = useState<MCQ[]>([]);
  const [currentMCQIndex, setCurrentMCQIndex] = useState(0);
  const [solutionSummary, setSolutionSummary] = useState<SolutionSummary | null>(null);
  const [completedQuestions, setCompletedQuestions] = useState<CompletedQuestion[]>([]);
  const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);

  // Mock user authentication
  const handleLogin = (provider: 'apple' | 'microsoft' | 'google') => {
    const mockUser: User = {
      id: '1',
      name: 'John Doe',
      email: 'john.doe@email.com',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
      questionsDecoded: 45,
      currentStreak: 7,
      totalMarks: 180,
      tokens: 1250,
      provider,
      commonMistakes: [
        {
          id: 'mistake-1',
          category: 'Forces',
          description: 'Forgetting to resolve forces into components',
          count: 12,
          lastOccurred: new Date('2024-01-12'),
          examples: ['Inclined plane problems', 'Projectile motion with air resistance']
        },
        {
          id: 'mistake-2',
          category: 'Kinematics',
          description: 'Using wrong kinematic equation',
          count: 8,
          lastOccurred: new Date('2024-01-10'),
          examples: ['Choosing s = ut + ½at² when initial velocity is unknown', 'Using v² = u² + 2as for time calculations']
        },
        {
          id: 'mistake-3',
          category: 'Energy',
          description: 'Not accounting for energy losses',
          count: 6,
          lastOccurred: new Date('2024-01-08'),
          examples: ['Friction in sliding problems', 'Air resistance in projectile motion']
        },
        {
          id: 'mistake-4',
          category: 'Units',
          description: 'Unit conversion errors',
          count: 5,
          lastOccurred: new Date('2024-01-06'),
          examples: ['km/h to m/s conversions', 'Degree to radian conversions']
        },
        {
          id: 'mistake-5',
          category: 'Momentum',
          description: 'Sign errors in collision problems',
          count: 4,
          lastOccurred: new Date('2024-01-05'),
          examples: ['Negative velocity directions', 'Before/after collision momentum']
        }
      ]
    };
    setUser(mockUser);
    setCurrentState('dashboard');
    
    // Load mock completed questions
    loadMockCompletedQuestions();
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentState('login');
  };

  const handleQuestionSubmit = (question: Question) => {
    setCurrentQuestion(question);
    setQuestionStartTime(new Date());
    // For text questions, skip extraction and go directly to decoder
    if (question.type === 'text') {
      const updatedQuestion = { ...question, extractedText: question.content };
      setCurrentQuestion(updatedQuestion);
      setCurrentState('decoder');
    } else {
      setCurrentState('extractor');
    }
  };

  const handleTextExtracted = (updatedQuestion: Question) => {
    setCurrentQuestion(updatedQuestion);
    // Immediately start decoding to reduce perceived wait; allow edit via Back
    setCurrentState('decoder');
  };

  const handleTextVerified = (verifiedQuestion: Question) => {
    setCurrentQuestion(verifiedQuestion);
    setCurrentState('decoder');
  };

  const handleQuestionDecoded = (generatedMCQs: MCQ[], solution: SolutionSummary) => {
    setMCQs(generatedMCQs);
    setSolutionSummary(solution);
    setCurrentMCQIndex(0);
    setCurrentState('mcq');
  };

  const handleMCQComplete = () => {
    setCurrentState('solution');
  };

  const handleSolutionComplete = () => {
    if (user && currentQuestion && solutionSummary && questionStartTime) {
      const timeSpent = Math.round((new Date().getTime() - questionStartTime.getTime()) / (1000 * 60));
      const tokensEarned = calculateTokens(currentQuestion.marks, mcqs.length, timeSpent);
      
      const completedQuestion: CompletedQuestion = {
        ...currentQuestion,
        completedAt: new Date(),
        tokensEarned,
        mcqsGenerated: mcqs.length,
        timeSpent,
        solutionSummary
      };
      
      setCompletedQuestions(prev => [completedQuestion, ...prev]);
      
      setUser({
        ...user,
        questionsDecoded: user.questionsDecoded + 1,
        currentStreak: user.currentStreak + 1,
        totalMarks: user.totalMarks + currentQuestion.marks,
        tokens: user.tokens + tokensEarned
      });
    }
    setCurrentState('dashboard');
  };

  const calculateTokens = (marks: number, mcqCount: number, timeSpent: number): number => {
    let baseTokens = marks * 10; // 10 tokens per mark
    let bonusTokens = 0;
    
    // Time bonus: faster completion gets more tokens
    if (timeSpent <= 5) bonusTokens += 50;
    else if (timeSpent <= 10) bonusTokens += 30;
    else if (timeSpent <= 15) bonusTokens += 10;
    
    // MCQ completion bonus
    bonusTokens += mcqCount * 5;
    
    return baseTokens + bonusTokens;
  };

  const loadMockCompletedQuestions = () => {
    // Add some mock completed questions for demonstration
    const mockQuestions: CompletedQuestion[] = [
      {
        id: 'completed-1',
        content: 'A projectile is launched from ground level with an initial velocity of 25 m/s at an angle of 45° to the horizontal.',
        extractedText: 'A projectile is launched from ground level with an initial velocity of 25 m/s at an angle of 45° to the horizontal.',
        marks: 6,
        type: 'text',
        timestamp: new Date('2024-01-15'),
        completedAt: new Date('2024-01-15'),
        tokensEarned: 95,
        mcqsGenerated: 3,
        timeSpent: 12,
        solutionSummary: {
          finalAnswer: '31.9 m, 3.61 s, 63.8 m',
          unit: 'm, s, m',
          workingSteps: ['Used kinematic equations', 'Applied projectile motion formulas'],
          keyFormulas: ['v² = u² + 2as', 's = ut + ½at²']
        }
      },
      {
        id: 'completed-2',
        content: 'mechanics_problem_2.jpg',
        extractedText: 'A 5 kg block slides down a frictionless incline of 30° to the horizontal.',
        marks: 4,
        type: 'photo',
        timestamp: new Date('2024-01-14'),
        completedAt: new Date('2024-01-14'),
        tokensEarned: 75,
        mcqsGenerated: 2,
        timeSpent: 8,
        solutionSummary: {
          finalAnswer: '4.9 m/s², 9.9 m/s, 2.02 s',
          unit: 'm/s², m/s, s',
          workingSteps: ['Resolved forces parallel to incline', 'Applied Newton\'s second law'],
          keyFormulas: ['F = ma', 'v² = u² + 2as']
        }
      }
    ];
    setCompletedQuestions(mockQuestions);
  };

  const renderCurrentState = () => {
    switch (currentState) {
      case 'login':
        return <LoginPage onLogin={handleLogin} />;
      case 'dashboard':
        return (
          <Dashboard 
            user={user!} 
            onStartDecoding={() => setCurrentState('input')}
            onViewHistory={() => setCurrentState('history')}
            onLogout={handleLogout}
          />
        );
      case 'input':
        return (
          <QuestionInput 
            onSubmit={handleQuestionSubmit}
            onBack={() => setCurrentState('dashboard')}
          />
        );
      case 'extractor':
        return (
          <TextExtractor 
            question={currentQuestion!}
            onTextExtracted={handleTextExtracted}
            onBack={() => setCurrentState('input')}
          />
        );
      case 'verify':
        return (
          <TextVerification 
            question={currentQuestion!}
            onVerified={handleTextVerified}
            onBack={() => setCurrentState('extractor')}
          />
        );
      case 'decoder':
        return (
          <QuestionDecoder 
            question={currentQuestion!}
            onDecoded={handleQuestionDecoded}
            onBack={() => currentQuestion?.type === 'text' ? setCurrentState('input') : setCurrentState('verify')}
          />
        );
      case 'mcq':
        return (
          <MCQInterface 
            mcqs={mcqs}
            currentIndex={currentMCQIndex}
            originalQuestion={currentQuestion!}
            onNext={() => setCurrentMCQIndex(prev => prev + 1)}
            onComplete={handleMCQComplete}
            onBack={() => setCurrentState('decoder')}
          />
        );
      case 'solution':
        return (
          <SolutionSummaryComponent
            originalQuestion={currentQuestion!}
            solution={solutionSummary!}
            onComplete={handleSolutionComplete}
            onBack={() => setCurrentState('mcq')}
          />
        );
      case 'history':
        return (
          <QuestionHistory
            completedQuestions={completedQuestions}
            onBack={() => setCurrentState('dashboard')}
          />
        );
      default:
        return <LoginPage onLogin={handleLogin} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {renderCurrentState()}
    </div>
  );
}