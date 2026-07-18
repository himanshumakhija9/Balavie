import React from "react";
import { MealLog } from "../types";

interface CalorieChartProps {
  pastLogs: MealLog[];
  isDark: boolean;
}

export default function CalorieChart({ pastLogs, isDark }: CalorieChartProps) {
  // Get last 7 days sorted chronologically
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d;
  }).reverse();

  // Helper to calculate a score from 0 to 100 for a single meal log
  const getMealBalanceScore = (log: MealLog) => {
    const p = log.protein || 0;
    const c = log.carbs || 0;
    const f = log.fat || 0;
    const b = log.fiber !== undefined ? log.fiber : Math.round(c * 0.1);
    
    if (p === 0 && c === 0 && f === 0) return 0;
    
    const totalG = p + c + f;
    if (totalG === 0) return 0;
    
    const pRatio = p / totalG;
    const cRatio = c / totalG;
    const fRatio = f / totalG;
    
    const pScore = Math.max(0, 100 - Math.abs(pRatio - 0.25) * 200);
    const cScore = Math.max(0, 100 - Math.abs(cRatio - 0.45) * 200);
    const fScore = Math.max(0, 100 - Math.abs(fRatio - 0.30) * 200);
    const fiberBonus = Math.min(30, b * 10);
    
    const baseScore = Math.round((pScore + cScore + fScore) / 3);
    return Math.min(100, Math.max(10, baseScore + fiberBonus));
  };

  const chartData = last7Days.map((date) => {
    const dayStr = date.toDateString();
    // Filter logs matching this day
    const logsForDay = pastLogs.filter((log) => {
      if (log.dateStr) {
        return log.dateStr === dayStr;
      }
      const formatted = date.toLocaleString("en-US", { month: "short", day: "numeric" });
      return log.timestamp && log.timestamp.includes(formatted);
    });

    const caloriesSum = logsForDay.reduce((sum, log) => sum + (log.calories || 0), 0);
    const scores = logsForDay.map((log) => getMealBalanceScore(log));
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return {
      weekday: date.toLocaleDateString("en-US", { weekday: "narrow" }),
      calories: caloriesSum,
      score: avgScore,
    };
  });

  const maxCal = Math.max(...chartData.map((d) => d.calories), 2000);

  return (
    <div
      id="calorie-chart-card"
      className={`border rounded-[20px] p-5 shadow-sm space-y-4 transition-colors duration-300 ${
        isDark ? "bg-[#1E1C1A] border-[#2C2A27]" : "bg-white border-[#E4EAE2]"
      }`}
    >
      <div className="flex justify-between items-baseline">
        <span
          className={`font-mono text-[9px] uppercase font-bold tracking-[1.6px] ${
            isDark ? "text-[#A8A49C]" : "text-[#5D6B60]"
          }`}
        >
          7-DAY CALORIE HISTOGRAM
        </span>
        <span className={`text-[9px] font-semibold text-[#FF7A1A] dark:text-[#FF9440] uppercase`}>
          🍊 ORANGE = 90+ BALANCE SCORE
        </span>
      </div>

      <div className="flex justify-between items-end h-28 pt-2 px-1">
        {chartData.map((day, idx) => {
          const heightPercent = Math.min(100, Math.round((day.calories / maxCal) * 100)) || 4;
          const isHighBalanced = day.score >= 90;

          const barColor = isHighBalanced
            ? "bg-[#FF7A1A] dark:bg-[#FF9440]"
            : "bg-[#1CA35A] dark:bg-[#3ECF8E] opacity-75";

          return (
            <div key={idx} className="flex flex-col items-center flex-1 space-y-2">
              <div className="relative w-full group flex justify-center items-end h-24">
                {/* Tooltip */}
                <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <span className="bg-slate-900 text-white text-[9px] font-mono rounded px-1.5 py-0.5 whitespace-nowrap shadow-md">
                    {day.calories} kcal ({day.score} pts)
                  </span>
                </div>
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-4 sm:w-5 rounded-t-sm transition-all duration-500 ease-out ${barColor}`}
                />
              </div>
              <span
                className={`text-[10px] font-mono font-bold ${
                  isDark ? "text-[#7A766E]" : "text-[#8B978D]"
                }`}
              >
                {day.weekday}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
