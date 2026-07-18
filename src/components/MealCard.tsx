import React from "react";
import { Trash2, Edit, MessageSquare, Heart } from "lucide-react";
import { MealLog } from "../types";

interface MealCardProps {
  key?: string;
  log: MealLog;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onEdit: (log: MealLog) => void;
  onCheer: (id: string) => void;
  cheersCount: number;
  isDark: boolean;
}

export default function MealCard({
  log,
  onDelete,
  onEdit,
  onCheer,
  cheersCount,
  isDark,
}: MealCardProps) {
  // Select emoji based on food keywords
  const getMealEmoji = (name: string): string => {
    const norm = (name || "").toLowerCase();
    if (norm.includes("coffee") || norm.includes("caffeine") || norm.includes("latte") || norm.includes("espresso") || norm.includes("tea")) return "☕";
    if (norm.includes("egg") || norm.includes("omelet") || norm.includes("breakfast") || norm.includes("toast") || norm.includes("waffle") || norm.includes("pancake")) return "🍳";
    if (norm.includes("salad") || norm.includes("greens") || norm.includes("spinach") || norm.includes("veg") || norm.includes("avocado") || norm.includes("broccoli") || norm.includes("cucumber")) return "🥗";
    if (norm.includes("chicken") || norm.includes("meat") || norm.includes("steak") || norm.includes("beef") || norm.includes("pork") || norm.includes("turkey")) return "🍗";
    if (norm.includes("fish") || norm.includes("salmon") || norm.includes("tuna") || norm.includes("seafood") || norm.includes("shrimp")) return "🐟";
    if (norm.includes("apple") || norm.includes("banana") || norm.includes("berry") || norm.includes("berries") || norm.includes("fruit") || norm.includes("orange") || norm.includes("strawberry")) return "🍎";
    if (norm.includes("rice") || norm.includes("noodle") || norm.includes("pasta") || norm.includes("grain") || norm.includes("quinoa") || norm.includes("oat")) return "🍚";
    if (norm.includes("soup") || norm.includes("stew") || norm.includes("broth")) return "🍲";
    return "🍽️";
  };

  const getMealBalanceScore = (meal: MealLog) => {
    const p = meal.protein || 0;
    const c = meal.carbs || 0;
    const f = meal.fat || 0;
    const b = meal.fiber !== undefined ? meal.fiber : Math.round(c * 0.1);
    
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

  const score = getMealBalanceScore(log);
  const isHighBalanced = score >= 90;
  const emoji = getMealEmoji(log.name);

  const scoreColorClass = isHighBalanced
    ? "text-[#FF7A1A] dark:text-[#FF9440] font-bold"
    : "text-[#1CA35A] dark:text-[#3ECF8E] font-bold";

  return (
    <div
      className={`border rounded-[20px] shadow-sm overflow-hidden flex flex-col text-left transition-colors duration-300 ${
        isDark ? "bg-[#1E1C1A] border-[#2C2A27]" : "bg-white border-[#E4EAE2]"
      }`}
    >
      {/* Header row */}
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* GreenSoft background container */}
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 bg-[#E3F4E9] dark:bg-[rgba(62,207,142,0.12)] border border-[#1CA35A]/10 dark:border-[#3ECF8E]/10">
            {emoji}
          </div>
          <div>
            <h4 className="text-sm font-extrabold capitalize leading-tight">
              {log.name}
            </h4>
            <span className={`text-[10px] font-mono ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
              {log.timestamp} {log.mealPeriod ? `• ${log.mealPeriod.toUpperCase()}` : ""}
            </span>
          </div>
        </div>

        {/* Edit and Delete Buttons */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onEdit(log)}
            title="Edit timing or values"
            className={`p-1.5 rounded-lg transition-colors border-0 bg-transparent cursor-pointer ${
              isDark ? "text-[#7A766E] hover:text-[#3ECF8E] hover:bg-[#2C2A27]" : "text-[#8B978D] hover:text-[#1CA35A] hover:bg-[#F3F6F1]"
            }`}
          >
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => onDelete(log.id, e)}
            title="Delete meal log"
            className={`p-1.5 rounded-lg transition-colors border-0 bg-transparent cursor-pointer ${
              isDark ? "text-[#7A766E] hover:text-red-400 hover:bg-[#2C2A27]" : "text-[#8B978D] hover:text-red-600 hover:bg-[#F3F6F1]"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Photo Banner */}
      <div className="h-32 w-full relative overflow-hidden border-y border-[#2C2A27]/5 dark:border-[#2C2A27]/25">
        {log.image ? (
          <img src={log.image} alt={log.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-[#1CA35A]/5 via-[#FF7A1A]/5 to-[#1CA35A]/5 flex items-center justify-center">
            <span
              className={`text-[9.5px] font-mono font-semibold tracking-wider uppercase ${
                isDark ? "text-[#7A766E]" : "text-[#8B978D]"
              }`}
            >
              📷 FOOD PLATE CAPTURED ONLINE
            </span>
          </div>
        )}
      </div>

      {/* Stat Strip */}
      <div
        className={`grid grid-cols-3 text-center py-3 border-b font-mono text-[11px] ${
          isDark ? "border-[#2C2A27]" : "border-[#E4EAE2]"
        }`}
      >
        <div className="flex flex-col">
          <span className={`text-[8.5px] tracking-wider uppercase ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
            CALORIES
          </span>
          <span className={`text-xs font-bold ${isDark ? "text-[#F5F2EC]" : "text-[#15241B]"}`}>
            {log.calories} kcal
          </span>
        </div>
        <div className={`flex flex-col border-x ${isDark ? "border-[#2C2A27]" : "border-[#E4EAE2]"}`}>
          <span className={`text-[8.5px] tracking-wider uppercase ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
            PROTEIN
          </span>
          <span className={`text-xs font-bold ${isDark ? "text-[#F5F2EC]" : "text-[#15241B]"}`}>
            {log.protein}g
          </span>
        </div>
        <div className="flex flex-col">
          <span className={`text-[8.5px] tracking-wider uppercase ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
            BALANCE
          </span>
          <span className={`text-xs ${scoreColorClass}`}>
            {score} pts
          </span>
        </div>
      </div>

      {/* Coach's note row */}
      <div className={`p-4 space-y-1.5 ${isDark ? "bg-[#1E1C1A]/50" : "bg-[#F3F6F1]/40"}`}>
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-[#1CA35A] dark:text-[#3ECF8E]" />
          <span className="text-[9px] font-mono font-bold tracking-wider text-[#1CA35A] dark:text-[#3ECF8E] uppercase">
            COACH'S NOTE
          </span>
        </div>
        <p className={`text-xs leading-relaxed ${isDark ? "text-[#A8A49C]" : "text-[#5D6B60]"}`}>
          {log.digestBetter || "Superb micro-nutrient selection! This supports baseline digestive speed and keeps insulin curves perfectly stable."}
        </p>
      </div>

      {/* Cheers footer action */}
      <div
        className={`p-3 px-4 border-t flex justify-between items-center ${
          isDark ? "border-[#2C2A27]" : "border-[#E4EAE2]"
        }`}
      >
        <button
          onClick={() => onCheer(log.id)}
          className={`flex items-center gap-2 text-xs font-mono font-bold py-1.5 px-3.5 rounded-full border cursor-pointer active:scale-95 transition-all ${
            cheersCount > 0
              ? "bg-[#FFF0E2] dark:bg-[rgba(255,148,64,0.14)] border-[#FF7A1A]/30 text-[#FF7A1A] dark:text-[#FF9440]"
              : isDark
              ? "bg-transparent border-[#2C2A27] text-[#A8A49C] hover:border-[#7A766E]"
              : "bg-transparent border-[#E4EAE2] text-[#5D6B60] hover:border-[#8B978D]"
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${cheersCount > 0 ? "fill-current animate-pulse" : ""}`} />
          <span>{cheersCount > 0 ? `👏 ${cheersCount} CHEERS` : "👏 GIVE CHEERS"}</span>
        </button>

        {log.portionDetected && (
          <span className={`text-[10px] font-mono ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
            PORTION: {log.portionDetected}
          </span>
        )}
      </div>
    </div>
  );
}
