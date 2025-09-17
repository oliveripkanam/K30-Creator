import React, { useState } from 'react';
import { RecentPerformanceCard } from './components/RecentPerformanceCard';

export default function App() {
  const [currentState, setCurrentState] = useState<'loading' | 'empty' | 'error' | 'data'>('data');
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d');

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Demo Controls */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold mb-4">Demo Controls</h2>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
              <select 
                value={currentState} 
                onChange={(e) => setCurrentState(e.target.value as any)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="data">Data</option>
                <option value="loading">Loading</option>
                <option value="empty">Empty</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
        </div>

        {/* Desktop Version */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Desktop</h2>
          <RecentPerformanceCard
            state={currentState}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            onRetry={() => setCurrentState('data')}
          />
        </div>

        {/* Tablet Version */}
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold mb-4">Tablet</h2>
          <RecentPerformanceCard
            state={currentState}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            onRetry={() => setCurrentState('data')}
          />
        </div>

        {/* Mobile Version (Compact) */}
        <div className="max-w-sm">
          <h2 className="text-xl font-semibold mb-4">Mobile (Compact)</h2>
          <RecentPerformanceCard
            state={currentState}
            timeframe={timeframe}
            compact={true}
            onTimeframeChange={setTimeframe}
            onRetry={() => setCurrentState('data')}
          />
        </div>
      </div>
    </div>
  );
}