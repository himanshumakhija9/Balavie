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
  image?: string; // local or display photo URL
  photoUrl?: string; // Firebase Storage download URL
  storagePath?: string; // Firebase Storage path e.g. users/{uid}/meal_photos/{id}.jpg
  ownerUid?: string;
  uploadedAt?: string; // ISO date string
  autoDeleteAt?: string; // ISO date string (6 months after upload)
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
