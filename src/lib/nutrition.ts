export interface NutritionalTargets {
  bmi: number;
  bmiCategory: 'Underweight' | 'Normal weight' | 'Overweight' | 'Obese';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/**
 * Calculates nutritional targets based on weight (kg) and height (cm)
 * according to clinical and sports nutrition formulas (Mifflin-St Jeor + activity factor + BMI adjustments).
 */
export function calculateTargets(weightKg: number, heightCm: number): NutritionalTargets {
  const heightM = heightCm / 100;
  const bmi = heightM > 0 ? weightKg / (heightM * heightM) : 0;
  
  let category: 'Underweight' | 'Normal weight' | 'Overweight' | 'Obese' = 'Normal weight';
  if (bmi < 18.5) {
    category = 'Underweight';
  } else if (bmi < 25) {
    category = 'Normal weight';
  } else if (bmi < 30) {
    category = 'Overweight';
  } else {
    category = 'Obese';
  }

  // Mifflin-St Jeor BMR: Unisex midpoint baseline
  // BMR = 10 * weight (kg) + 6.25 * height (cm) - 5 * age (30y midpoint) - 80 (gender-neutral adjust)
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * 30 - 80;
  const tdee = bmr * 1.375; // Active athletic baseline factor

  let calories = 2000;
  let protein = Math.round(weightKg * 1.8);
  let carbs = 220;
  let fat = 70;
  let fiber = 25;

  if (category === 'Underweight') {
    // Healthy energy surplus to build mass safely
    calories = Math.round(tdee + 400);
    protein = Math.round(weightKg * 2.0); // Restorative higher protein
    carbs = Math.round((calories * 0.55) / 4);
    fat = Math.round((calories * 0.25) / 9);
    fiber = 25; // Standard high-quality baseline
  } else if (category === 'Normal weight') {
    // Energy balance maintenance
    calories = Math.round(tdee);
    protein = Math.round(weightKg * 1.8);
    carbs = Math.round((calories * 0.50) / 4);
    fat = Math.round((calories * 0.25) / 9);
    fiber = 28;
  } else if (category === 'Overweight') {
    // Satiety and moderate thermogenic lean-mass retention deficit
    calories = Math.round(tdee - 350);
    protein = Math.round(weightKg * 2.2); // Satiety and muscle retention
    carbs = Math.round((calories * 0.40) / 4);
    fat = Math.round((calories * 0.25) / 9);
    fiber = 32; // Elevated fiber target for insulin control & satiety
  } else { // Obese
    // Metabolic improvement deficit
    calories = Math.round(tdee - 550);
    protein = Math.round(weightKg * 2.3); // Prevent metabolic deceleration
    carbs = Math.round((calories * 0.35) / 4);
    fat = Math.round((calories * 0.25) / 9);
    fiber = 35; // Maximum clinical fiber recommendation
  }

  // Clinical safety low bounds
  if (calories < 1200) {
    calories = 1200;
  }

  return {
    bmi: Number(bmi.toFixed(1)),
    bmiCategory: category,
    calories,
    protein: protein > 0 ? protein : 70,
    carbs: carbs > 0 ? carbs : 220,
    fat: fat > 0 ? fat : 70,
    fiber: fiber > 0 ? fiber : 25,
  };
}
