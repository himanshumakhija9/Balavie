import React from "react";
import { calculateTargets } from "../lib/nutrition";

interface BalanceRingProps {
  todayCalories: number;
  todayProtein: number;
  todayCarbs: number;
  todayFat: number;
  todayFiber: number;
  bodyWeight: number;
  bodyHeight: number;
  isDark: boolean;
}

export default function BalanceRing({
  todayCalories,
  todayProtein,
  todayCarbs,
  todayFat,
  todayFiber,
  bodyWeight,
  bodyHeight,
  isDark,
}: BalanceRingProps) {
  const targets = calculateTargets(bodyWeight, bodyHeight);

  const proteinTarget = targets.protein;
  const carbsTarget = targets.carbs;
  const fatTarget = targets.fat;
  const fiberTarget = targets.fiber;
  const calTarget = targets.calories;

  const todayProteinPercent = Math.min(100, Math.round((todayProtein / proteinTarget) * 100)) || 0;
  const todayCarbsPercent = Math.min(100, Math.round((todayCarbs / carbsTarget) * 100)) || 0;
  const todayFatPercent = Math.min(100, Math.round((todayFat / fatTarget) * 100)) || 0;
  const todayFiberPercent = Math.min(100, Math.round((todayFiber / fiberTarget) * 100)) || 0;

  const balanceScore = Math.round(
    (todayProteinPercent + todayCarbsPercent + todayFatPercent + todayFiberPercent) / 4
  );

  const remainingCals = Math.max(0, calTarget - todayCalories);

  // SVG dimensions & math
  const radius = 85;
  const circ = 2 * Math.PI * radius; // 534.07
  const arcLength = circ * (80 / 360); // 118.68
  const gapLength = circ * (280 / 360); // 415.39

  const colors = {
    bgTrack: isDark ? "#2C2A27" : "#E4EAE2",
    green: isDark ? "#3ECF8E" : "#1CA35A",
    citrus: isDark ? "#FF9440" : "#FF7A1A",
  };

  const scoreColorClass =
    balanceScore >= 90
      ? "text-[#FF7A1A] dark:text-[#FF9440]"
      : "text-[#1CA35A] dark:text-[#3ECF8E]";

  const scoreLabel =
    balanceScore === 0
      ? "READY TO FUEL"
      : balanceScore < 50
      ? "BUILD THE MOMENTUM"
      : balanceScore < 90
      ? "WELL BALANCED — GET AFTER IT!"
      : "METABOLIC CHAMPION! 🔥";

  return (
    <div
      id="balance-ring-container"
      className={`border rounded-[20px] p-6 shadow-sm transition-colors duration-300 flex flex-col items-center justify-center ${
        isDark ? "bg-[#1E1C1A] border-[#2C2A27]" : "bg-white border-[#E4EAE2]"
      }`}
    >
      <div className="relative w-[216px] h-[216px] flex items-center justify-center">
        <svg width={216} height={216} className="transform rotate-0">
          {/* Quadrant 1: Protein (Top-Left, starts rotated at -85deg) */}
          <circle
            r={radius}
            cx={108}
            cy={108}
            stroke={colors.bgTrack}
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${gapLength}`}
            transform="rotate(-85 108 108)"
          />
          <circle
            r={radius}
            cx={108}
            cy={108}
            stroke={colors.green}
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arcLength * (todayProteinPercent / 100)} ${circ}`}
            transform="rotate(-85 108 108)"
            className="transition-all duration-500 ease-out"
          />

          {/* Quadrant 2: Carbs (Top-Right, starts rotated at 5deg) */}
          <circle
            r={radius}
            cx={108}
            cy={108}
            stroke={colors.bgTrack}
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${gapLength}`}
            transform="rotate(5 108 108)"
          />
          <circle
            r={radius}
            cx={108}
            cy={108}
            stroke={colors.green}
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arcLength * (todayCarbsPercent / 100)} ${circ}`}
            transform="rotate(5 108 108)"
            className="transition-all duration-500 ease-out"
          />

          {/* Quadrant 3: Fat (Bottom-Right, starts rotated at 95deg) */}
          <circle
            r={radius}
            cx={108}
            cy={108}
            stroke={colors.bgTrack}
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${gapLength}`}
            transform="rotate(95 108 108)"
          />
          <circle
            r={radius}
            cx={108}
            cy={108}
            stroke={colors.green}
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arcLength * (todayFatPercent / 100)} ${circ}`}
            transform="rotate(95 108 108)"
            className="transition-all duration-500 ease-out"
          />

          {/* Quadrant 4: Fiber (Bottom-Left, starts rotated at 185deg) */}
          <circle
            r={radius}
            cx={108}
            cy={108}
            stroke={colors.bgTrack}
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${gapLength}`}
            transform="rotate(185 108 108)"
          />
          <circle
            r={radius}
            cx={108}
            cy={108}
            stroke={colors.green}
            strokeWidth={13}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${arcLength * (todayFiberPercent / 100)} ${circ}`}
            transform="rotate(185 108 108)"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Scoring Centerpiece */}
        <div className="absolute flex flex-col items-center text-center justify-center pointer-events-none">
          <span className={`font-display text-6xl font-extrabold leading-none ${scoreColorClass}`}>
            {balanceScore}
          </span>
          <span
            className={`font-mono text-[9px] uppercase font-bold tracking-[1.6px] mt-1 ${
              isDark ? "text-[#A8A49C]" : "text-[#5D6B60]"
            }`}
          >
            BALANCE SCORE
          </span>
          <span
            className={`text-[9px] font-semibold mt-1 uppercase max-w-[140px] truncate ${
              isDark ? "text-[#3ECF8E]" : "text-[#1CA35A]"
            }`}
          >
            {scoreLabel}
          </span>
        </div>
      </div>

      {/* 3-Column Stat Strip */}
      <div
        className={`grid grid-cols-3 w-full border-t pt-4 mt-5 text-center font-mono text-[11px] ${
          isDark ? "border-[#2C2A27]" : "border-[#E4EAE2]"
        }`}
      >
        <div className="flex flex-col">
          <span className={`text-[9px] uppercase tracking-wider ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
            EATEN
          </span>
          <span className={`text-base font-extrabold font-display leading-none mt-1 ${isDark ? "text-[#F5F2EC]" : "text-[#15241B]"}`}>
            {todayCalories} <span className="text-[10px] font-normal opacity-60">KCAL</span>
          </span>
        </div>
        <div className={`flex flex-col border-x ${isDark ? "border-[#2C2A27]" : "border-[#E4EAE2]"}`}>
          <span className={`text-[9px] uppercase tracking-wider ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
            TARGET
          </span>
          <span className={`text-base font-extrabold font-display leading-none mt-1 ${isDark ? "text-[#F5F2EC]" : "text-[#15241B]"}`}>
            {calTarget} <span className="text-[10px] font-normal opacity-60">KCAL</span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className={`text-[9px] uppercase tracking-wider ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
            REMAINING
          </span>
          <span className="text-base font-extrabold font-display leading-none mt-1 text-[#FF7A1A] dark:text-[#FF9440]">
            {remainingCals} <span className="text-[10px] font-normal opacity-60">KCAL</span>
          </span>
        </div>
      </div>
    </div>
  );
}
