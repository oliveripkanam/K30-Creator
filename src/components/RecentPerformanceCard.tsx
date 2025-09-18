import React, { useState } from 'react';
import { Info, ChevronRight, TrendingUp, Clock, Target, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export interface DecodeAttempt {
  id: string;
  date: string;
  ts: number;
  marks: number;
  timeSpentMinutes: number;
  tokensEarned: number;
  accuracy: number;
}

export interface PerformanceAggregates {
  avgAccuracy: number;
  attemptCount: number;
  avgMarks: number;
  medianTime: number;
  tokensTotal: number;
}

export interface RecentPerformanceCardProps {
  state?: 'loading' | 'empty' | 'error' | 'data';
  timeframe?: '7d' | '30d' | '90d';
  compact?: boolean;
  decodes?: DecodeAttempt[];
  aggregates?: PerformanceAggregates;
  onTimeframeChange?: (timeframe: '7d' | '30d' | '90d') => void;
  onRetry?: () => void;
  onOpenHistory?: () => void;
}

const SegmentedControl: React.FC<{
  value: '7d' | '30d' | '90d';
  onChange: (value: '7d' | '30d' | '90d') => void;
}> = ({ value, onChange }) => {
  const options = [
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' },
    { key: '90d', label: '90d' }
  ] as const;

  return (
    <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-1">
      {options.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150 min-w-[40px] ${
            value === option.key
              ? 'bg-white text-blue-600 shadow-sm border border-gray-200'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const KPIChip: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}> = ({ icon, label, value, valueColor = 'text-gray-900' }) => {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:border-gray-300 transition-colors">
      <div className="text-gray-500">{icon}</div>
      <div className="flex flex-col">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <span className={`text-lg font-medium ${valueColor}`}>{value}</span>
      </div>
    </div>
  );
};

const SparklineChart: React.FC<{
  data: DecodeAttempt[];
  compact?: boolean;
}> = ({ data, compact = false }) => {
  const formatDurationFromMinutes = (mins: number): string => {
    const totalSeconds = Math.max(0, Math.round((mins || 0) * 60));
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    if (m <= 0) return `${s}s`;
    if (s === 0) return `${m} min 0s`;
    return `${m} min ${s}s`;
  };
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);
  const height = compact ? 160 : 240;
  const padding = { top: 20, right: 20, bottom: 40, left: 40 };

  if (data.length === 0) {
    return (
      <div 
        className="flex items-center justify-center border border-gray-200 rounded-lg bg-gray-50"
        style={{ height }}
      >
        <span className="text-gray-400 text-sm">No data available</span>
      </div>
    );
  }

  const containerWidth = containerRef?.offsetWidth || 400;
  const chartWidth = containerWidth - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxAccuracy = 100;
  const minAccuracy = 0;
  const points = data.map((item, index) => ({
    x: padding.left + (index * chartWidth) / Math.max(data.length - 1, 1),
    y: padding.top + chartHeight - ((item.accuracy - minAccuracy) / (maxAccuracy - minAccuracy)) * chartHeight,
    data: item
  }));

  const pathData = points.length > 1 ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}` : '';

  // x-axis hidden per request → no ticks/labels
  const xTicks: Array<{ x: number; label: string }> = [];

  return (
    <div 
      ref={setContainerRef}
      className="relative w-full border border-gray-200 rounded-lg bg-white"
      style={{ height }}
    >
      <svg width="100%" height={height} className="overflow-visible">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height={height} fill="url(#grid)" opacity="0.5" />
        <text x={padding.left - 10} y={padding.top + 5} className="text-xs fill-gray-500 text-anchor-end">100%</text>
        <text x={padding.left - 10} y={height - padding.bottom + 5} className="text-xs fill-gray-500 text-anchor-end">0%</text>
        {/* x-axis hidden */}
        <line 
          x1={padding.left} 
          y1={padding.top} 
          x2={padding.left} 
          y2={height - padding.bottom} 
          stroke="#e5e7eb" 
          strokeWidth="1"
        />
        {xTicks.map((tick, index) => (
          <g key={index}>
            <line
              x1={tick.x}
              y1={height - padding.bottom}
              x2={tick.x}
              y2={height - padding.bottom + 5}
              stroke="#d1d5db"
              strokeWidth="1"
            />
            <text
              x={tick.x}
              y={height - padding.bottom + 18}
              className="text-xs fill-gray-500 text-anchor-middle"
            >
              {tick.label}
            </text>
          </g>
        ))}
        {points.length > 1 && (
          <path
            d={`${pathData} L ${points[points.length - 1].x},${height - padding.bottom} L ${points[0].x},${height - padding.bottom} Z`}
            fill="#2563eb"
            fillOpacity="0.1"
          />
        )}
        {points.length > 1 && (
          <path
            d={pathData}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            className="drop-shadow-sm"
          />
        )}
        {points.map((point, index) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r={hoveredPoint === index ? 8 : 6}
              fill="#2563eb"
              className="cursor-pointer drop-shadow-sm transition-all duration-150"
              onMouseEnter={() => setHoveredPoint(index)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
            {hoveredPoint === index && (
              <>
                <line
                  x1={point.x}
                  y1={padding.top}
                  x2={point.x}
                  y2={height - padding.bottom}
                  stroke="#d1d5db"
                  strokeWidth="1"
                  strokeDasharray="4,4"
                />
                <foreignObject
                  x={Math.max(10, Math.min(point.x - 80, containerWidth - 170))}
                  y={Math.max(10, point.y - 70)}
                  width="160"
                  height="60"
                >
                  <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-lg text-xs">
                    <div className="font-medium">{point.data.date}</div>
                    <div className="text-gray-600">
                      {point.data.accuracy}% • {point.data.marks} marks • {formatDurationFromMinutes(point.data.timeSpentMinutes)} • {point.data.tokensEarned} tokens
                    </div>
                  </div>
                </foreignObject>
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

const RecentListItem: React.FC<{
  decode: DecodeAttempt;
  onClick?: () => void;
}> = ({ decode, onClick }) => {
  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 90) return 'bg-emerald-600 text-white'; // dark green
    if (accuracy >= 75) return 'bg-green-500 text-white';    // light green -> stronger for visibility
    if (accuracy >= 50) return 'bg-yellow-400 text-white';   // yellow stronger
    return 'bg-red-500 text-white';                          // red stronger
  };

  return (
    <div 
      className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-900">{decode.date}</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600">{decode.marks} marks</span>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Accuracy {decode.accuracy}% • {(() => { const t=Math.max(0,Math.round((decode.timeSpentMinutes||0)*60)); const m=Math.floor(t/60); const s=t%60; return m<=0?`${s}s`:`${m} min ${s}s`; })()} • {decode.tokensEarned} tokens
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded-full text-xs font-medium min-w-[44px] text-center ${getAccuracyColor(decode.accuracy)}`}>
          {decode.accuracy}%
        </span>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
};

export const RecentPerformanceCard: React.FC<RecentPerformanceCardProps> = ({
  state = 'data',
  timeframe = '30d',
  compact = false,
  decodes = [],
  aggregates,
  onTimeframeChange,
  onRetry,
  onOpenHistory
}) => {
  const [currentTimeframe, setCurrentTimeframe] = useState(timeframe);

  const handleTimeframeChange = (newTimeframe: '7d' | '30d' | '90d') => {
    setCurrentTimeframe(newTimeframe);
    onTimeframeChange?.(newTimeframe);
  };

  if (state === 'loading') {
    return (
      <Card className={`w-full ${compact ? 'p-4' : 'p-6'} space-y-4`}>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className={`w-full ${compact ? 'h-40' : 'h-60'}`} />
        <div className="flex gap-3 flex-wrap">
          {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-32" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (state === 'error') {
    return (
      <Card className={`w-full ${compact ? 'p-4' : 'p-6'} text-center space-y-4`}>
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <div>
          <h3 className="text-lg font-medium text-gray-900">We couldn't load your performance</h3>
          <p className="text-gray-600 mt-1">Please try again</p>
        </div>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </Card>
    );
  }

  if (state === 'empty') {
    return (
      <Card className={`w-full ${compact ? 'p-4' : 'p-6'} text-center space-y-4`}>
        <TrendingUp className="w-16 h-16 text-gray-300 mx-auto" />
        <div>
          <h3 className="text-lg font-medium text-gray-900">No recent activity</h3>
          <p className="text-gray-600 mt-1">Solve your first question to see your trend here.</p>
        </div>
        <Button variant="outline">
          Start Decoding
        </Button>
      </Card>
    );
  }

  const safeAggregates: PerformanceAggregates = aggregates || {
    avgAccuracy: 0,
    attemptCount: decodes.length,
    avgMarks: 0,
    medianTime: 0,
    tokensTotal: 0,
  };

  return (
    <Card className={`w-full ${compact ? 'p-4' : 'p-6'} space-y-4`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-centered gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Recent Performance Trend</h2>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-4 h-4 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Shows accuracy percentage for each decode attempt</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <p className="text-sm text-gray-600">Accuracy per decode</p>
        </div>
        <SegmentedControl
          value={currentTimeframe}
          onChange={handleTimeframeChange}
        />
      </div>

      <div className="w-full">
        <SparklineChart data={decodes} compact={compact} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3">
        <KPIChip
          icon={<Target className="w-4 h-4" />}
          label="Avg Accuracy"
          value={`${safeAggregates.avgAccuracy}%`}
          valueColor={safeAggregates.avgAccuracy >= 70 ? 'text-green-600' : 'text-gray-900'}
        />
        <KPIChip
          icon={<TrendingUp className="w-4 h-4" />}
          label="Attempts"
          value={safeAggregates.attemptCount.toString()}
        />
        <KPIChip
          icon={<Clock className="w-4 h-4" />}
          label="Median Time"
          value={`${Math.floor(Math.max(0, Math.round((safeAggregates.medianTime || 0) * 60)) / 60)} min ${Math.max(0, Math.round((safeAggregates.medianTime || 0) * 60)) % 60}s`}
        />
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-900">Recent Activity</h3>
        <div className="space-y-2">
          {([...decodes].sort((a,b)=>b.ts-a.ts)).slice(0, 5).map((decode) => (
            <RecentListItem
              key={decode.id}
              decode={decode}
              onClick={() => onOpenHistory && onOpenHistory()}
            />
          ))}
        </div>
        <Button variant="ghost" className="w-full text-sm text-blue-600 hover:text-blue-700" onClick={() => onOpenHistory && onOpenHistory()}>
          View History
        </Button>
      </div>
    </Card>
  );
};


