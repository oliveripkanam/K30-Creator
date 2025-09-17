import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ChevronLeft, ChevronRight, Flame, Target, Calendar as CalIcon, Hash } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface StreaksPageProps {
	userId: string;
	onBack: () => void;
}

function formatKey(d: Date): string {
	const yy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${yy}-${mm}-${dd}`;
}

export function StreaksPage({ userId, onBack }: StreaksPageProps) {
	// Calendar month navigation state (Figma SimpleCalendar)
	const [currentDate, setCurrentDate] = React.useState<Date>(new Date());
	const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);

	// Activity map for current calendar month grid and for stats (last 90 days)
	const [monthCountByDay, setMonthCountByDay] = React.useState<Record<string, number>>({});
	const [range90CountByDay, setRange90CountByDay] = React.useState<Record<string, number>>({});

	const today = new Date();
	const isToday = (d: Date) => d.toDateString() === today.toDateString();
	const isCurrentMonth = (d: Date) => d.getMonth() === currentDate.getMonth();

	const monthYear = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

	const navigateMonth = (dir: 'prev' | 'next') => {
		const nd = new Date(currentDate);
		nd.setMonth(nd.getMonth() + (dir === 'prev' ? -1 : 1));
		setCurrentDate(nd);
		setSelectedDate(null);
	};

	const goToToday = () => {
		setCurrentDate(new Date());
		setSelectedDate(null);
	};

	// Generate 5-6 weeks for current month, Sunday-start to Saturday-end
	const generateWeeks = React.useCallback(() => {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth();
		const firstDay = new Date(year, month, 1);
		const lastDay = new Date(year, month + 1, 0);
		const start = new Date(firstDay);
		start.setDate(start.getDate() - firstDay.getDay());
		const weeks: Date[][] = [];
		let cursor = new Date(start);
		for (let w = 0; w < 6; w++) {
			const row: Date[] = [];
			for (let d = 0; d < 7; d++) { row.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
			weeks.push(row);
			if (cursor > lastDay && w >= 3) break;
		}
		return weeks;
	}, [currentDate]);

	const weeks = generateWeeks();

	// Supabase fetch for current calendar grid (month view)
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				if (weeks.length === 0) return;
				const start = new Date(weeks[0][0]);
				const end = new Date(weeks[weeks.length - 1][6]);
				end.setHours(23,59,59,999);
				const { data, error } = await supabase
					.from('questions')
					.select('decoded_at')
					.eq('user_id', userId)
					.gte('decoded_at', start.toISOString())
					.lte('decoded_at', end.toISOString());
				if (error) throw error;
				const map: Record<string, number> = {};
				for (const r of (data || [])) {
					const d = new Date(r.decoded_at);
					d.setHours(0,0,0,0);
					const k = formatKey(d);
					map[k] = (map[k] || 0) + 1;
				}
				if (!cancelled) setMonthCountByDay(map);
			} catch {
				if (!cancelled) setMonthCountByDay({});
			}
		})();
		return () => { cancelled = true; };
	}, [userId, weeks]);

	// Supabase fetch for stats (last 90 days from today)
	React.useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const start = new Date();
				start.setDate(start.getDate() - 89);
				start.setHours(0,0,0,0);
				const end = new Date();
				end.setHours(23,59,59,999);
				const { data, error } = await supabase
					.from('questions')
					.select('decoded_at')
					.eq('user_id', userId)
					.gte('decoded_at', start.toISOString())
					.lte('decoded_at', end.toISOString());
				if (error) throw error;
				const map: Record<string, number> = {};
				for (const r of (data || [])) {
					const d = new Date(r.decoded_at);
					d.setHours(0,0,0,0);
					const k = formatKey(d);
					map[k] = (map[k] || 0) + 1;
				}
				if (!cancelled) setRange90CountByDay(map);
			} catch {
				if (!cancelled) setRange90CountByDay({});
			}
		})();
		return () => { cancelled = true; };
	}, [userId]);

	// Compute stats from last 90 days map
	const stats = React.useMemo(() => {
		const days: string[] = [];
		const start = new Date();
		start.setDate(start.getDate() - 89);
		start.setHours(0,0,0,0);
		for (let i = 0; i < 90; i++) {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			days.push(formatKey(d));
		}
		// current streak (from today backwards)
		let current = 0;
		for (let i = 89; i >= 0; i--) {
			const key = days[i];
			if ((range90CountByDay[key] || 0) > 0) current++; else break;
		}
		// longest streak
		let longest = 0; let run = 0;
		for (let i = 0; i < 90; i++) {
			const key = days[i];
			if ((range90CountByDay[key] || 0) > 0) { run++; longest = Math.max(longest, run); } else { run = 0; }
		}
		// days solved and total questions
		let daysSolved = 0; let totalQuestions = 0;
		for (const k of days) {
			const c = range90CountByDay[k] || 0;
			if (c > 0) daysSolved++;
			totalQuestions += c;
		}
		return { current, longest, daysSolved, totalQuestions };
	}, [range90CountByDay]);

	const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

	// Days Active: use current calendar month instead of fixed 90
	const daysInMonth = React.useMemo(() => {
		return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
	}, [currentDate]);

	const monthDaysSolved = React.useMemo(() => {
		let solved = 0;
		for (let d = 1; d <= daysInMonth; d++) {
			const key = formatKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), d));
			if ((monthCountByDay[key] || 0) > 0) solved++;
		}
		return solved;
	}, [monthCountByDay, currentDate, daysInMonth]);

	const getActivityLevel = (count: number) => {
		if (count === 0) return 'none';
		if (count <= 2) return 'low';
		if (count <= 4) return 'medium';
		return 'high';
	};

	const getActivityColor = (level: string, currentMonth: boolean) => {
		const opacity = currentMonth ? '' : ' opacity-40';
		switch (level) {
			case 'low': return 'bg-green-50 border-green-200' + opacity; // lightest
			case 'medium': return 'bg-green-100 border-green-500' + opacity; // medium
			case 'high': return 'border-green-600' + opacity; // inline bg applied below (green-200)
			default: return 'bg-background border-border' + opacity;
		}
	};

	const getActivityInlineStyle = (level: string, currentMonth: boolean): React.CSSProperties | undefined => {
		if (!currentMonth) return undefined;
		if (level === 'high') {
			// Tailwind bg-green-200 hex: #bbf7d0
			return { backgroundColor: '#bbf7d0' };
		}
		return undefined;
	};

	const handleDateClick = (date: Date) => {
		if (!isCurrentMonth(date)) return;
		setSelectedDate(selectedDate && selectedDate.toDateString() === date.toDateString() ? null : date);
	};

	const formatDateISO = (date: Date) => {
		return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
	};

	return (
		<div className="min-h-screen bg-white">
			{/* Top bar: back and title to match our app */}
			<div className="bg-white shadow-sm border-b">
				<div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Button variant="ghost" size="sm" onClick={onBack}>
							<svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
							</svg>
							Back
						</Button>
						<h1 className="text-lg font-medium">Streaks</h1>
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
					<Button variant="outline" onClick={goToToday}>Today</Button>
				</div>

				{/* Stats (90d) */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					{[
						{t:'Current Streak',v:`${stats.current} day${stats.current===1?'':'s'}`,Icon:Flame,color:'text-orange-600'},
						{t:'Longest Streak',v:`${stats.longest} day${stats.longest===1?'':'s'}`,Icon:Target,color:'text-green-600'},
						{t:'Days Active',v:`${monthDaysSolved}/${daysInMonth}`,Icon:CalIcon,color:'text-green-700'},
						{t:'Total Questions',v:`${stats.totalQuestions}`,Icon:Hash,color:'text-purple-600'}
					].map((c,idx)=> (
						<Card key={idx}>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<c.Icon className={`h-5 w-5 ${c.color}`} />
									<div>
										<p className="text-sm text-muted-foreground">{c.t}</p>
										<div className="text-2xl font-medium">{c.v}</div>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>

				{/* Calendar */}
				<Card>
					<CardContent className="p-6">
						{/* Day headers */}
						<div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(7,minmax(0,1fr))' }}>
							{dayNames.map((d)=>(
								<div key={d} className="text-center py-2">
									<span className="text-sm font-medium text-muted-foreground">{d}</span>
								</div>
							))}
						</div>

						{/* Calendar grid */}
						<div className="space-y-2">
							{weeks.map((wk, wi)=> (
								<div key={wi} className="grid gap-4" style={{ gridTemplateColumns: 'repeat(7,minmax(0,1fr))' }}>
									{wk.map((d, di)=>{
										const key = formatKey(d);
										const count = monthCountByDay[key] || 0;
										const level = getActivityLevel(count);
										const isCur = isCurrentMonth(d);
										const isTod = isToday(d);
										return (
											<button
												key={di}
												onClick={() => handleDateClick(d)}
												className={`relative h-16 rounded-lg border-2 transition-all duration-200 hover:shadow-md ${getActivityColor(level, isCur)} ${isTod ? 'ring-2 ring-primary ring-offset-2' : ''} ${!isCur ? 'cursor-default' : 'hover:scale-105 cursor-pointer'}`}
												style={getActivityInlineStyle(level, isCur)}
												disabled={!isCur}
												title={`${key} • ${count} question${count===1?'':'s'}`}
											>
												<div className="absolute top-2 left-2">
													<span className={`text-lg font-medium ${isTod ? 'text-primary' : isCur ? 'text-foreground' : 'text-muted-foreground'}`}>{d.getDate()}</span>
												</div>
												{count > 0 && isCur && (
													<div className="absolute top-2 right-2 flex items-center gap-1">
														<div className={`w-2 h-2 rounded-full ${level==='high' ? 'bg-green-600' : 'bg-green-500'}`}></div>
														{count > 1 && <span className={`text-xs font-medium text-green-700`}>{count}</span>}
													</div>
												)}
											</button>
										);
									})}
								</div>
							))}
						</div>

						{/* Simple legend (green) */}
						<div className="flex items-center justify-center gap-6 text-sm text-muted-foreground mt-4">
							<div className="flex items-center gap-2"><div className="w-3 h-3 rounded border bg-background"></div><span>No activity</span></div>
							<div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-100 border-green-300"></div><span>Low activity</span></div>
							<div className="flex items-center gap-2">
								<div className="w-3 h-3 rounded border-green-600" style={{ backgroundColor: '#bbf7d0', borderWidth: 1 }}></div>
								<span className="text-foreground">High activity</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Selected date info */}
				{selectedDate && (
					<Card>
						<CardContent className="p-6">
							<div className="flex items-center justify-between">
								<div>
									<h3 className="text-xl font-semibold text-foreground">
										{selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
									</h3>
									<p className="text-muted-foreground mt-1">
										{(monthCountByDay[formatDateISO(selectedDate)] || 0)} questions completed
									</p>
								</div>
								<Button variant="outline" onClick={() => setSelectedDate(null)}>Close</Button>
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}


