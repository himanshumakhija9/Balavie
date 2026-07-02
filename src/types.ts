export interface Ingredient {
  name: string;
  amount?: string;
}

export interface MealAnalysis {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  phosphorus?: number;
  antioxidants?: number;
  confidence: 'low' | 'medium' | 'high';
  portionDetected: string;
  ingredients: Ingredient[];
  mealPeriod?: string; // e.g. "Breakfast", "Lunch", "Afternoon Snack", "Dinner", "Late Night Snack"
}

export interface DigestionInsights {
  digestBetter: string;
  bestTimeOfDay: string;
  activityToEliminate: string;
  whatToDo?: string;
  whatNotToDo?: string;
}

export interface MealAnalysisResponse {
  status: 'success' | 'clarification_needed';
  sessionKey?: string;
  mealAnalysis?: MealAnalysis;
  insights?: DigestionInsights;
  clarificationQuestions?: string[];
  preliminaryAnalysis?: string;
}

export interface MealLog {
  id: string;
  timestamp: string;
  name: string;
  image?: string; // Base64 data url for viewing
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  phosphorus?: number;
  antioxidants?: number;
  portionDetected: string;
  ingredients: Ingredient[];
  digestBetter: string;
  bestTimeOfDay: string;
  activityToEliminate: string;
  mealPeriod?: string;
  dateStr?: string; // ISO date string or toDateString
  notes?: string;
  whatToDo?: string;
  whatNotToDo?: string;
  epochTime?: number;
  isLearned?: boolean;
  editedByUser?: boolean;
}
