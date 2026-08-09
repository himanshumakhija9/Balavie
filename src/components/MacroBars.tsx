import React from "react";
import { calculateTargets, Lifestyle } from "../lib/nutrition";

interface MacroBarsProps {
  todayProtein: number;
  todayCarbs: number;
  todayFat: number;
  todayFiber: number;
  bodyWeight: number;
  bodyHeight: number;
  lifestyle?: Lifestyle;
  isDark: boolean;
}

export default function MacroBars({
  todayProtein,
  todayCarbs,
  todayFat,
  todayFiber,
  bodyWeight,
  bodyHeight,
  lifestyle = 'moderate',
  isDark,
}: MacroBarsProps) {
  const targets = calculateTargets(bodyWeight, bodyHeight, lifestyle);

  const proteinTarget = targets.protein;
  const carbsTarget = targets.carbs;
  const fatTarget = targets.fat;
  const fiberTarget = targets.fiber;

  const macros = [
    {
      name: "PROTEIN",
      current: todayProtein,
      target: proteinTarget,
      unit: "g",
      color: "bg-[#1CA35A] dark:bg-[#3ECF8E]",
      percent: Math.min(100, Math.round((todayProtein / proteinTarget) * 100)) || 0,
    },
    {
      name: "CARBS",
      current: todayCarbs,
      target: carbsTarget,
      unit: "g",
      color: "bg-[#1CA35A] dark:bg-[#3ECF8E]",
      percent: Math.min(100, Math.round((todayCarbs / carbsTarget) * 100)) || 0,
    },
    {
      name: "FAT",
      current: todayFat,
      target: fatTarget,
      unit: "g",
      color: "bg-[#1CA35A] dark:bg-[#3ECF8E]",
      percent: Math.min(100, Math.round((todayFat / fatTarget) * 100)) || 0,
    },
    {
      name: "FIBER",
      current: todayFiber,
      target: fiberTarget,
      unit: "g",
      color: "bg-[#1CA35A] dark:bg-[#3ECF8E]",
      percent: Math.min(100, Math.round((todayFiber / fiberTarget) * 100)) || 0,
    },
  ];

  return (
    <div
      id="macro-bars-grid"
      className={`border rounded-[20px] p-5 shadow-sm grid grid-cols-2 gap-4 transition-colors duration-300 ${
        isDark ? "bg-[#1E1C1A] border-[#2C2A27]" : "bg-white border-[#E4EAE2]"
      }`}
    >
      {macros.map((m) => (
        <div key={m.name} className="flex flex-col text-left space-y-1">
          <span
            className={`font-mono text-[9px] uppercase font-bold tracking-[1.6px] ${
              isDark ? "text-[#A8A49C]" : "text-[#5D6B60]"
            }`}
          >
            {m.name}
          </span>
          <div className="flex justify-between items-baseline font-mono">
            <span className={`text-sm font-bold ${isDark ? "text-[#F5F2EC]" : "text-[#15241B]"}`}>
              {Math.round(m.current * 10) / 10}g
            </span>
            <span className={`text-[10px] ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
              / {m.target}g
            </span>
          </div>
          <div
            className={`w-full h-1.5 rounded-full overflow-hidden ${
              isDark ? "bg-[#2C2A27]" : "bg-[#E4EAE2]"
            }`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${m.color}`}
              style={{ width: `${m.percent}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
