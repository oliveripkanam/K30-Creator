import React from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';

interface RadarData {
  topic: string;
  proficiency: number;
  maxScore: number;
}

interface RadarChartProps {
  data: RadarData[];
  className?: string;
}

export function MechanicsRadarChart({ data, className = "" }: RadarChartProps) {
  return (
    <div className={`w-full h-full ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <PolarGrid 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
          />
          <PolarAngleAxis 
            dataKey="topic" 
            tick={{ 
              fontSize: 12, 
              fill: 'hsl(var(--foreground))', 
              textAnchor: 'middle' 
            }}
            className="text-xs"
          />
          <PolarRadiusAxis 
            domain={[0, 100]} 
            tick={{ 
              fontSize: 10, 
              fill: 'hsl(var(--muted-foreground))' 
            }}
            tickCount={6}
            angle={90}
          />
          <Radar
            name="Proficiency"
            dataKey="proficiency"
            stroke="hsl(var(--chart-1))"
            fill="hsl(var(--chart-1))"
            fillOpacity={0.1}
            strokeWidth={2}
            dot={{ 
              fill: 'hsl(var(--chart-1))', 
              strokeWidth: 2, 
              stroke: 'hsl(var(--background))',
              r: 4 
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}