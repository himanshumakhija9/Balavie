export type Lifestyle = 'sedentary' | 'moderate' | 'active';

export interface NutritionalTargets {
  bmi: number;
  bmiCategory: 'Underweight' | 'Normal weight' | 'Overweight' | 'Obese';
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  lifestyle: Lifestyle;
}

/**
 * Calculates nutritional targets based on weight (kg), height (cm), and lifestyle.
 * According to clinical and sports nutrition guidelines:
 * - Sedentary requires less protein (~1.1 g/kg) and lower total energy.
 * - Moderate requires standard athletic baseline (~1.6 g/kg).
 * - Active requires higher protein (~2.1 g/kg) for tissue repair and higher energy.
 */
export function calculateTargets(
  weightKg: number, 
  heightCm: number, 
  lifestyle: Lifestyle = 'moderate'
): NutritionalTargets {
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
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * 30 - 80;
  
  // Activity / TDEE multiplier based on lifestyle
  const activityMultiplier = lifestyle === 'sedentary' ? 1.2 : lifestyle === 'active' ? 1.75 : 1.45;
  const tdee = bmr * activityMultiplier;

  // Protein multiplier based on lifestyle (grams per kg body weight)
  let proteinFactor = 1.6; // Moderate baseline
  if (lifestyle === 'sedentary') {
    proteinFactor = 1.1; // Sedentary requires lower protein intake
  } else if (lifestyle === 'active') {
    proteinFactor = 2.1; // High active lifestyle requires elevated protein
  }

  // Category specific adjustments
  if (category === 'Underweight') {
    proteinFactor += 0.1;
  } else if (category === 'Overweight' || category === 'Obese') {
    proteinFactor += 0.2; // Extra protein for satiety and muscle preservation
  }

  let calories = Math.round(tdee);
  let protein = Math.round(weightKg * proteinFactor);

  if (category === 'Underweight') {
    calories = Math.round(tdee + 350);
  } else if (category === 'Overweight') {
    calories = Math.round(tdee - 350);
  } else if (category === 'Obese') {
    calories = Math.round(tdee - 500);
  }

  // Calculate carbs and fats from remaining caloric allowance
  const proteinCals = protein * 4;
  const remainingCals = Math.max(500, calories - proteinCals);

  let carbs = Math.round((remainingCals * 0.60) / 4);
  let fat = Math.round((remainingCals * 0.40) / 9);
  let fiber = 28;

  if (category === 'Overweight') fiber = 32;
  if (category === 'Obese') fiber = 35;

  if (calories < 1200) calories = 1200;

  return {
    bmi: Number(bmi.toFixed(1)),
    bmiCategory: category,
    calories,
    protein: protein > 0 ? protein : 70,
    carbs: carbs > 0 ? carbs : 220,
    fat: fat > 0 ? fat : 70,
    fiber: fiber > 0 ? fiber : 25,
    lifestyle,
  };
}
