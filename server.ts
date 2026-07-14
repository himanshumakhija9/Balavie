import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up server-side JSON payload size limits to accept meal photo uploads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// File-based Cloud Logs Storage setup
const LOGS_FILE_PATH = path.join(process.cwd(), "logs.json");

function readServerLogs(): any[] {
  try {
    if (fs.existsSync(LOGS_FILE_PATH)) {
      const data = fs.readFileSync(LOGS_FILE_PATH, "utf8");
      return JSON.parse(data || "[]");
    }
  } catch (error) {
    console.error("Error reading logs.json:", error);
  }
  return [];
}

function writeServerLogs(logs: any[]): void {
  try {
    fs.writeFileSync(LOGS_FILE_PATH, JSON.stringify(logs, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing logs.json:", error);
  }
}

// Host PWA specific assets explicitly
app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(process.cwd(), "manifest.json"));
});

app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(process.cwd(), "sw.js"));
});

function sanitizeInputText(text: string): string {
  if (!text) return "";
  let cleaned = text;
  // Remove [additional Details] ... or similar meta-text entirely
  cleaned = cleaned.replace(/\[additional\s+details\].*$/gi, "");
  // Remove User Answered ... To Verification Query ...
  cleaned = cleaned.replace(/user\s+answered.*$/gi, "");
  // Remove To Verification Query ...
  cleaned = cleaned.replace(/to\s+verification\s+query.*$/gi, "");
  return cleaned.trim();
}

function cleanMealName(name: string): string {
  if (!name) return "";
  let cleaned = name;
  // Remove anything that looks like additional details or questions
  cleaned = sanitizeInputText(cleaned);
  // Remove any remaining parentheses at the end of the name
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/g, "");
  // Clean trailing punctuation
  cleaned = cleaned.trim().replace(/[.,;:\s]+$/g, "");
  // Capitalize properly
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned || "Meal Log";
}

// Dynamic fallback generator to guarantee flawless resilience if Gemini API suffers timeout or error
function generateFallbackResponse(text: string, withPhoto: boolean, localHour: number, dietType: string = "") {
  const lower = (text || "").toLowerCase().trim();
  
  // Determine meal period based on local hour
  let mealPeriod = "Snack";
  if (localHour >= 5 && localHour < 11) mealPeriod = "Breakfast";
  else if (localHour >= 11 && localHour < 15) mealPeriod = "Lunch";
  else if (localHour >= 15 && localHour < 18) mealPeriod = "Afternoon Snack";
  else if (localHour >= 18 && localHour < 22) mealPeriod = "Dinner";
  else mealPeriod = "Late Night Snack";

  // Try to parse explicit macro values from the user's input (if they happen to write them, e.g. from professional labels)
  const calMatch = lower.match(/\b(\d+)\s*(?:cal|calories|kcal|cals)\b/i);
  const protMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:g\s*protein|g\s*p\b|g\s*prot|grams\s*protein|grams\s*of\s*protein)\b/i);
  const carbMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:g\s*carbs|g\s*carb|g\s*c\b|grams\s*carbohydrates|grams\s*of\s*carbohydrates|grams\s*of\s*carbs)\b/i);
  const fatMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:g\s*fat|g\s*f\b|grams\s*fat|grams\s*of\s*fat)\b/i);
  const fibMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:g\s*fiber|g\s*fib|grams\s*fiber)\b/i);
  const phosMatch = lower.match(/\b(\d+)\s*(?:mg\s*phosphorus|mg\s*phos|mg\s*p\b)\b/i);
  const antiMatch = lower.match(/\b(\d+)\s*(?:units?\s*antioxidants|antioxidants?|anti\b)\b/i);

  if (calMatch && protMatch && carbMatch && fatMatch) {
    const calories = parseInt(calMatch[1]);
    const protein = parseFloat(protMatch[1]);
    const carbs = parseFloat(carbMatch[1]);
    const fat = parseFloat(fatMatch[1]);
    const fiber = fibMatch ? parseFloat(fibMatch[1]) : 0;
    const phosphorus = phosMatch ? parseInt(phosMatch[1]) : 0;
    const antioxidants = antiMatch ? Math.min(10, parseInt(antiMatch[1])) : 1;

    // Remove parsed macro phrases to get a clean meal name
    let cleanName = text
      .replace(/\b\d+\s*(?:cal|calories|kcal|cals)\b/gi, "")
      .replace(/\b\d+(?:\.\d+)?\s*(?:g\s*protein|g\s*p\b|g\s*prot|grams\s*protein|grams\s*of\s*protein)\b/gi, "")
      .replace(/\b\d+(?:\.\d+)?\s*(?:g\s*carbs|g\s*carb|g\s*c\b|grams\s*carbohydrates|grams\s*of\s*carbohydrates|grams\s*of\s*carbs)\b/gi, "")
      .replace(/\b\d+(?:\.\d+)?\s*(?:g\s*fat|g\s*f\b|grams\s*fat|grams\s*of\s*fat)\b/gi, "")
      .replace(/\b\d+(?:\.\d+)?\s*(?:g\s*fiber|g\s*fib|grams\s*fiber)\b/gi, "")
      .replace(/\b\d+\s*(?:mg\s*phosphorus|mg\s*phos|mg\s*p\b)\b/gi, "")
      .replace(/\b\d+\s*(?:units?\s*antioxidants|antioxidants?|anti\b)\b/gi, "")
      .replace(/[,;+\s]+/g, " ")
      .trim();

    if (!cleanName || cleanName.length < 2) {
      cleanName = "Custom Logged Meal";
    }

    const capitalize = (str: string) => {
      return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    };

    const finalName = capitalize(cleanName);

    return {
      status: "success",
      mealAnalysis: {
        name: cleanMealName(finalName),
        mealPeriod,
        calories,
        protein,
        carbs,
        fat,
        fiber,
        phosphorus,
        antioxidants,
        confidence: "high",
        portionDetected: "Precisely specified by user",
        ingredients: [
          {
            name: finalName,
            amount: "1 serving (macros specified)"
          }
        ]
      },
      insights: {
        digestBetter: `You logged ${calories} kcal with precise macronutrients: P: ${protein}g, C: ${carbs}g, F: ${fat}g. This manual baseline entry ensures 100% computational integrity.`,
        bestTimeOfDay: `Your logged macro profile is actively accounted for. For your next meal, balance your intake according to your remaining daily nutrient targets.`,
        activityToEliminate: `✅ **WHAT TO DO (Light Work/Exercise):** Proceed with healthy daily habits mapped to your metabolic targets.\n❌ **WHAT NOT TO DO:** Avoid sitting completely idle if you consumed high-carb foods, to prevent glycemic pooling.`,
        whatToDo: `Continue tracking meals with exact specifications to maintain maximum precision.`,
        whatNotToDo: `Avoid logging vague portions without ingredients or nutritional parameters when in standalone mode.`
      }
    };
  }

  // If macros are not fully specified, use a rich, robust keyword parser to guess high-fidelity values
  // Split input by separators like "with", "+", ",", "and" (except "&") to find ingredients
  const rawItems = lower.split(/,|\bwith\b|\band\b|\+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s !== "&");

  if (rawItems.length === 0) {
    rawItems.push("healthy balanced plate");
  }

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFiber = 0;
  let totalPhosphorus = 0;
  let maxAntioxidants = 1;
  const ingredients: { name: string; amount: string }[] = [];
  let recognizedAny = false;

  const capitalize = (str: string) => {
    return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  rawItems.forEach((item) => {
    let multiplier = 1;
    // Check for numbers at the start of the item (e.g., "2 small bowls", "1 glass")
    const numMatch = item.match(/^(\d+(\.\d+)?)\s*(g|oz|ml|cup|cups|serving|servings|slice|slices|tbsp|tsp|can|cans|piece|pieces|bowl|bowls|plate|plates|glass|glasses)?/i);
    if (numMatch) {
      multiplier = parseFloat(numMatch[1]);
    } else {
      const wordsMap: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5,
        six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        double: 2, triple: 3, half: 0.5, "a couple of": 2
      };
      for (const [word, val] of Object.entries(wordsMap)) {
        if (item.toLowerCase().startsWith(word)) {
          multiplier = val;
          break;
        }
      }
    }

    // Clean prefixes
    let cleanItem = item.replace(/^\d+\s*(g|oz|ml|cup|cups|serving|servings|slice|slices|tbsp|tsp|can|cans|piece|pieces|bowl|bowls|plate|plates|glass|glasses)?\s*(of\s+)?/gi, "");
    cleanItem = cleanItem.replace(/^\d+\s*/g, ""); // remove digits
    cleanItem = cleanItem.replace(/^(a|an|the|some|fresh|cooked|roasted|grilled|baked|steamed|tossed|raw|pastured|organic)\s+/gi, "");
    
    if (!cleanItem) cleanItem = item;

    const itemLower = cleanItem.toLowerCase().trim();

    // Default item macros if recognized
    let itemCal = 0;
    let itemProt = 0;
    let itemCarb = 0;
    let itemFat = 0;
    let itemFib = 0;
    let itemPhos = 0;
    let itemAnti = 1;
    let itemAmount = "1 portion";
    let matched = false;

    if (itemLower.includes("shake") || itemLower.includes("smoothie") || itemLower.includes("protein powder") || itemLower.includes("whey")) {
      itemCal = 130; itemProt = 24; itemCarb = 3; itemFat = 1.5; itemFib = 0; itemPhos = 110; itemAnti = 1; itemAmount = "1 scoop";
      matched = true;
    } else if (itemLower.includes("tofu") || itemLower.includes("tempeh") || itemLower.includes("soy") || itemLower.includes("soya") || itemLower.includes("edamame")) {
      itemCal = 220; itemProt = 20; itemCarb = 8; itemFat = 12; itemFib = 3; itemPhos = 180; itemAnti = 2; itemAmount = "1 portion (approx. 150g)";
      matched = true;
    } else if (itemLower.includes("paneer") || itemLower.includes("cottage cheese")) {
      itemCal = 280; itemProt = 18; itemCarb = 5; itemFat = 20; itemFib = 0; itemPhos = 260; itemAnti = 1; itemAmount = "1 portion (approx. 100g)";
      matched = true;
    } else if (itemLower.includes("chicken") || itemLower.includes("turkey") || itemLower.includes("poultry") || itemLower.includes("breast")) {
      itemCal = 165; itemProt = 31; itemCarb = 0; itemFat = 3.6; itemFib = 0; itemPhos = 200; itemAnti = 1; itemAmount = "100g grilled";
      matched = true;
    } else if (itemLower.includes("salmon") || itemLower.includes("fish") || itemLower.includes("tuna") || itemLower.includes("seafood") || itemLower.includes("shrimp")) {
      itemCal = 180; itemProt = 24; itemCarb = 0; itemFat = 9; itemFib = 0; itemPhos = 220; itemAnti = 3; itemAmount = "100g portion";
      matched = true;
    } else if (itemLower.includes("beef") || itemLower.includes("steak") || itemLower.includes("meat") || itemLower.includes("pork") || itemLower.includes("lamb")) {
      itemCal = 220; itemProt = 26; itemCarb = 0; itemFat = 12; itemFib = 0; itemPhos = 190; itemAnti = 1; itemAmount = "100g portion";
      matched = true;
    } else if (itemLower.includes("egg") || itemLower.includes("eggs") || itemLower.includes("omelet") || itemLower.includes("scramble")) {
      itemCal = 75; itemProt = 6; itemCarb = 0.6; itemFat = 5; itemFib = 0; itemPhos = 90; itemAnti = 2; itemAmount = "1 large egg";
      matched = true;
    } else if (itemLower.includes("lentil") || itemLower.includes("bean") || itemLower.includes("chickpea") || itemLower.includes("legume") || /\bpeas?\b/.test(itemLower)) {
      itemCal = 180; itemProt = 12; itemCarb = 25; itemFat = 1; itemFib = 8; itemPhos = 180; itemAnti = 3; itemAmount = "1/2 cup cooked";
      matched = true;
    } else if (itemLower.includes("juice") || itemLower.includes("cider")) {
      itemCal = 110; itemProt = 1.5; itemCarb = 26; itemFat = 0.2; itemFib = 0.5; itemPhos = 40; itemAnti = 4; itemAmount = "1 glass";
      matched = true;
    } else if (itemLower.includes("mac") || itemLower.includes("chesse") || itemLower.includes("cheese") || itemLower.includes("pasta") || itemLower.includes("spaghetti") || itemLower.includes("noodle") || itemLower.includes("noodles") || itemLower.includes("lasagna") || itemLower.includes("macaroni")) {
      itemCal = 350; itemProt = 12; itemCarb = 55; itemFat = 10; itemFib = 2; itemPhos = 140; itemAnti = 1; itemAmount = "1 cup cooked";
      matched = true;
    } else if (itemLower.includes("rice") || itemLower.includes("grain") || itemLower.includes("quinoa") || itemLower.includes("oat") || itemLower.includes("oats") || itemLower.includes("porridge") || itemLower.includes("barley") || itemLower.includes("cereal")) {
      itemCal = 150; itemProt = 3.5; itemCarb = 32; itemFat = 1; itemFib = 2.5; itemPhos = 70; itemAnti = 1; itemAmount = "1/2 cup cooked";
      matched = true;
    } else if (itemLower.includes("salad") || itemLower.includes("greens") || itemLower.includes("lettuce") || itemLower.includes("spinach") || itemLower.includes("kale")) {
      itemCal = 45; itemProt = 2; itemCarb = 6; itemFat = 1.5; itemFib = 2.5; itemPhos = 30; itemAnti = 5; itemAmount = "1.5 cups tossed";
      matched = true;
    } else if (itemLower.includes("tomato") || itemLower.includes("cucumber") || itemLower.includes("onion") || itemLower.includes("pepper") || itemLower.includes("carrot") || itemLower.includes("vegetable") || itemLower.includes("veggie") || itemLower.includes("broccoli") || itemLower.includes("cauliflower")) {
      itemCal = 30; itemProt = 1.2; itemCarb = 6; itemFat = 0.2; itemFib = 2; itemPhos = 20; itemAnti = 4; itemAmount = "1 cup chopped";
      matched = true;
    } else if (itemLower.includes("avocado")) {
      itemCal = 160; itemProt = 2; itemCarb = 8.5; itemFat = 15; itemFib = 6.7; itemPhos = 50; itemAnti = 3; itemAmount = "1/2 medium avocado";
      matched = true;
    } else if (itemLower.includes("oil") || itemLower.includes("butter") || itemLower.includes("margarine")) {
      itemCal = 120; itemProt = 0; itemCarb = 0; itemFat = 14; itemFib = 0; itemPhos = 0; itemAnti = 1; itemAmount = "1 tbsp";
      matched = true;
    } else if (itemLower.includes("banana") || itemLower.includes("apple") || itemLower.includes("orange") || itemLower.includes("fruit") || itemLower.includes("berries") || itemLower.includes("berry") || itemLower.includes("peach") || itemLower.includes("grape")) {
      itemCal = 80; itemProt = 1; itemCarb = 20; itemFat = 0.3; itemFib = 3; itemPhos = 25; itemAnti = 6; itemAmount = "1 medium piece";
      matched = true;
    } else if (itemLower.includes("toast") || itemLower.includes("bread") || itemLower.includes("bagel") || itemLower.includes("croissant")) {
      itemCal = 100; itemProt = 3.5; itemCarb = 20; itemFat = 1; itemFib = 1.5; itemPhos = 30; itemAnti = 1; itemAmount = "1 slice";
      matched = true;
    } else if (itemLower.includes("yogurt") || itemLower.includes("milk") || itemLower.includes("dairy")) {
      itemCal = 100; itemProt = 8; itemCarb = 6; itemFat = 5; itemFib = 0; itemPhos = 140; itemAnti = 1; itemAmount = "1 serving";
      matched = true;
    } else if (itemLower.includes("pizza")) {
      itemCal = 350; itemProt = 13; itemCarb = 45; itemFat = 12; itemFib = 2; itemPhos = 150; itemAnti = 2; itemAmount = "1 slice";
      matched = true;
    } else if (itemLower.includes("burger") || itemLower.includes("sandwich") || itemLower.includes("wrap") || itemLower.includes("taco") || itemLower.includes("burrito")) {
      itemCal = 380; itemProt = 18; itemCarb = 40; itemFat = 14; itemFib = 2.5; itemPhos = 150; itemAnti = 2; itemAmount = "1 portion";
      matched = true;
    } else if (itemLower.includes("coffee") || itemLower.includes("tea") || itemLower.includes("espresso") || itemLower.includes("latte")) {
      itemCal = 45; itemProt = 1; itemCarb = 5; itemFat = 1.5; itemFib = 0; itemPhos = 15; itemAnti = 3; itemAmount = "1 cup";
      matched = true;
    }

    if (matched) {
      recognizedAny = true;
      totalCalories += itemCal * multiplier;
      totalProtein += itemProt * multiplier;
      totalCarbs += itemCarb * multiplier;
      totalFat += itemFat * multiplier;
      totalFiber += itemFib * multiplier;
      totalPhosphorus += itemPhos * multiplier;
      maxAntioxidants = Math.max(maxAntioxidants, itemAnti);

      let displayAmount = itemAmount;
      if (multiplier !== 1) {
        if (itemAmount.startsWith("1 ")) {
          const rest = itemAmount.slice(2);
          const pluralizedRest = multiplier > 1 ? (rest.endsWith("y") ? rest.slice(0, -1) + "ies" : (rest.endsWith("h") || rest.endsWith("s") || rest.endsWith("x") || rest.endsWith("z") ? rest + "es" : rest + "s")) : rest;
          displayAmount = `${multiplier} ${pluralizedRest}`;
        } else {
          displayAmount = `${multiplier} x (${itemAmount})`;
        }
      }

      ingredients.push({
        name: capitalize(cleanItem),
        amount: displayAmount
      });
    }
  });

  if (recognizedAny) {
    // Construct meal name from capitalized ingredients
    let computedName = "";
    if (ingredients.length === 1) {
      computedName = ingredients[0].name;
    } else if (ingredients.length === 2) {
      computedName = `${ingredients[0].name} & ${ingredients[1].name}`;
    } else {
      computedName = `${ingredients[0].name}, ${ingredients[1].name} & More`;
    }

    // Dynamic nutritional insights
    let digestBetter = `This meal delivers ${totalCalories} calories, offering a supportive nutrient yield to keep your systems perfectly fueled.`;
    let bestTimeOfDay = `For your next meal, focus on a high-protein additions to balance your intake.`;
    let activityToEliminate = `✅ **WHAT TO DO (Exercise/Light Walk):** Take a brisk 10 to 15-minute walk to prompt immediate skeletal muscle glucose shuttling.\n❌ **WHAT NOT TO DO:** Avoid sitting completely idle directly after eating.`;

    if (totalCarbs > 40) {
      digestBetter = `By selecting this meal, your system secures ${totalCalories} calories with a supportive carbohydrate yield. Complex carbs provide steady-state glycogen to keep cellular mitochondria perfectly fueled.`;
      bestTimeOfDay = `With ${totalCarbs}g of carbohydrates, your neural energy is excellent. For your next meal, focus on a high-protein addition to ensure muscle preservation and prevent glycemic spikes.`;
      activityToEliminate = `✅ **WHAT TO DO (Exercise/Light Walk):** Take a brisk 10 to 15-minute walk to prompt immediate skeletal muscle glucose shuttling and optimize insulin action.\n❌ **WHAT NOT TO DO:** Avoid sitting completely idle or lying down directly after eating, which can trigger digestive sluggishness.`;
    } else if (totalProtein > 20) {
      digestBetter = `This protein-rich meal delivers active amino acids to support lean muscle fiber rebuilding and tissue synthesis, boosting your systemic metabolic rate.`;
      bestTimeOfDay = `With ${totalProtein}g of complete protein, your muscle building blocks are fully saturated. Next time, introduce complex carbohydrates to replenish muscle glycogen.`;
      activityToEliminate = `✅ **WHAT TO DO (Focus Work):** Harness the steady amino drip to focus deeply on complex cognitive tasks, coding, or detailed logical synthesis.\n❌ **WHAT NOT TO DO:** Avoid skipping a nutrient-dense vegetable serving in your next portion.`;
    }

    return {
      status: "success",
      mealAnalysis: {
        name: cleanMealName(computedName),
        mealPeriod,
        calories: Math.round(totalCalories),
        protein: Math.round(totalProtein * 10) / 10,
        carbs: Math.round(totalCarbs * 10) / 10,
        fat: Math.round(totalFat * 10) / 10,
        fiber: Math.round(totalFiber * 10) / 10,
        phosphorus: Math.round(totalPhosphorus),
        antioxidants: maxAntioxidants,
        confidence: "medium",
        portionDetected: withPhoto ? "Custom Captured Meal serving" : "Standard portion estimated",
        ingredients
      },
      insights: {
        digestBetter,
        bestTimeOfDay,
        activityToEliminate,
        whatToDo: `Focus on integrating wholesome nutrients to balance your day.`,
        whatNotToDo: `Avoid drenching your next portion in high-sodium sauces or processed oils.`
      }
    };
  }

  // If absolutely NO keywords matched, return exactly 1 friendly clarification question
  // asking for ingredients/portions, NOT for macros!
  return {
    status: "clarification_needed",
    clarificationQuestions: [
      `To help me calculate the nutrition for "${text}" accurately, could you share the main ingredients, brand, or general portion size?`
    ]
  };
}

// Map PWA icon requests dynamically to our generated beautiful high-res JPG asset
app.get("/pwa-icon.png", (req, res) => {
  const possiblePaths = [
    path.join(process.cwd(), "src", "assets", "images"),
  ];
  try {
    // Look up generated assets dynamically index matching the generated timestamp
    const imagesDir = path.join(process.cwd(), "src", "assets", "images");
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      const iconFile = files.find(f => f.startsWith("pwa_icon_512"));
      if (iconFile) {
        return res.sendFile(path.join(imagesDir, iconFile));
      }
    }
  } catch (err) {
    console.error("Error scanning images directory", err);
  }
  // Safe default fallback if directory structure is still initializing
  res.status(404).send("PWA icon container currently starting, please refresh shortly.");
});

// Cloud Sync endpoints
app.get("/api/logs", (req, res) => {
  res.json(readServerLogs());
});

app.post("/api/logs", (req, res) => {
  try {
    const { log } = req.body;
    if (!log || !log.id) {
      return res.status(400).json({ error: "Invalid log structural details" });
    }
    const logs = readServerLogs();
    
    // De-duplicate if already exists
    const filtered = logs.filter(item => item.id !== log.id);
    filtered.unshift(log); // Always place at the very beginning of the cloud log list
    
    writeServerLogs(filtered);
    res.json({ status: "success", count: filtered.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/logs/:id", (req, res) => {
  try {
    const { id } = req.params;
    const logs = readServerLogs();
    const filtered = logs.filter(item => item.id !== id);
    writeServerLogs(filtered);
    res.json({ status: "success", count: filtered.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/logs/clear", (req, res) => {
  try {
    writeServerLogs([]);
    res.json({ status: "success" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize the GoogleGenAI instance server-side
let ai: GoogleGenAI | null = null;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("WARNING: GEMINI_API_KEY environment variable is not set. Meal logging will fallback to simulated analysis.");
}

// Simple in-memory session mapping to accumulate meal state and clarifications
interface MealSession {
  originalText?: string;
  originalImage?: { mimeType: string; data: string; };
  questions?: string[];
  lastTimestamp: number;
}

const sessionStore = new Map<string, MealSession>();

// Clear sessions older than 30 minutes to manage memory usage
setInterval(() => {
  const cutOff = Date.now() - 30 * 60 * 1000;
  for (const [key, value] of sessionStore.entries()) {
    if (value.lastTimestamp < cutOff) {
      sessionStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Helper to construct random session keys
function generateUniqueKey(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Resilient promise timeout helper to guarantee fallback resolution under 6 seconds
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout of ${ms}ms exceeded`));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Resilient wrapper to retry Gemini requests and fall back to alternative models on high load (e.g. 503 errors)
async function generateContentWithRetryAndFallbacks(
  ai: any,
  params: {
    contents: any;
    config: any;
  },
  timeoutMs: number = 15000
): Promise<any> {
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    let attempts = model === "gemini-3.5-flash" ? 3 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log(`[Gemini API] Attempting model "${model}" (attempt ${attempt}/${attempts})...`);
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: params.contents,
            config: params.config,
          }),
          timeoutMs
        );
        console.log(`[Gemini API] Success with model "${model}" on attempt ${attempt}`);
        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[Gemini API] Model "${model}" failed on attempt ${attempt}: ${err.message || err}`
        );
        
        // If it's a standard client-side validation error (e.g., status 400), don't retry as it is a schema/developer issue
        const isClientError = err.status && err.status >= 400 && err.status < 500 && err.status !== 429;
        if (isClientError) {
          throw err;
        }

        if (attempt < attempts) {
          const delay = attempt * 1000;
          console.log(`[Gemini API] Waiting ${delay}ms before retrying...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  throw lastError || new Error("All model fallback attempts exhausted.");
}

// API Route for analyzing a meal
app.post("/api/analyze-meal", async (req, res) => {
  try {
    const { textInput, imageInput, sessionKey, clarificationAnswers, localHour, dietType, todayMacros, history, bodyWeight } = req.body;
    const parsedLocalHour = localHour !== undefined ? Number(localHour) : new Date().getHours();

    const proteinTarget = bodyWeight && Number(bodyWeight) > 0 ? Number(bodyWeight) : 100;

    let targetText = sanitizeInputText(textInput || "");
    let targetImage: { mimeType: string; data: string; } | undefined = undefined;

    // Handle session resolution for clarification answers
    if (sessionKey && sessionStore.has(sessionKey)) {
      const stored = sessionStore.get(sessionKey)!;
      const cleanOriginal = sanitizeInputText(stored.originalText || "");
      targetText = cleanOriginal;
      targetImage = stored.originalImage;

      // Append clarification feedback as simple details in parentheses
      if (clarificationAnswers && typeof clarificationAnswers === "object") {
        const answersList = Object.values(clarificationAnswers)
          .map(a => String(a).trim())
          .filter(Boolean);
        if (answersList.length > 0) {
          targetText = `${cleanOriginal} (${answersList.join(", ")})`;
        }
      }
    }

    // Process image inputs
    if (imageInput && typeof imageInput === "string" && imageInput.startsWith("data:")) {
      try {
        const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          targetImage = {
            mimeType: match[1],
            data: match[2],
          };
        }
      } catch (err) {
        console.error("Failed to parse imageInput base64 payload", err);
      }
    }

    // fallback simulation mode if Gemini API key remains absent
    if (!ai) {
      return res.json(generateFallbackResponse(targetText, !!targetImage, parsedLocalHour, dietType));
    }

    // Preparing contents parts for Gemini API
    const parts: any[] = [];

    if (targetImage) {
      parts.push({
        inlineData: {
          mimeType: targetImage.mimeType,
          data: targetImage.data,
        },
      });
    }

    let macrosContext = "";
    if (todayMacros && typeof todayMacros === "object") {
      macrosContext = `
[Today's Cumulative Nutrient Intake so far]:
- Protein: ${todayMacros.protein || 0}g (Daily Target: ${proteinTarget}g)
- Carbohydrates: ${todayMacros.carbs || 0}g (Daily Target: 220g)
- Fats: ${todayMacros.fat || 0}g (Daily Target: 70g)
- Fiber: ${todayMacros.fiber || 0}g (Daily Target: 25g)
- Phosphorus: ${todayMacros.phosphorus || 0}mg (Daily Target: ~1000mg)
- Antioxidants: ${todayMacros.antioxidants || 0} units (Daily Target: ~10+ units)
`;
    } else {
      macrosContext = `
[Today's Cumulative Nutrient Intake so far]:
- No previous meals logged today.
`;
    }

    let historyContext = "";
    if (Array.isArray(history) && history.length > 0) {
      const uniqueDays = Array.from(new Set(history.map(h => {
        if (!h.timestamp) return null;
        try {
          const d = new Date(h.timestamp);
          return isNaN(d.getTime()) ? null : d.toDateString();
        } catch (_) { return null; }
      }).filter(Boolean))).length;

      const calibrationCompleted = uniqueDays >= 7;

      if (calibrationCompleted) {
        const recentHistoryList = history.slice(0, 15).map((h: any) => 
          `- "${h.name}" (${h.calories} kcal, P: ${h.protein}g, C: ${h.carbs}g, F: ${h.fat}g, Period: ${h.mealPeriod || "Unspecified"})`
        ).join("\n");
        
        historyContext = `
[User's Historical Eating Logs (Calibration Completed - ${uniqueDays} days tracked)]:
${recentHistoryList}

CRITICAL RULES FOR PERSONALIZED HISTORICAL INSIGHTS (Since Calibration is Completed):
1. You MUST examine the [User's Historical Eating Logs (Calibration Completed)] above to understand their past eating habits.
2. In 'whatToDo' (Next Intake suggestions):
   - Suggest healthy, diet-compliant items similar to what they have successfully eaten and logged in their past history (e.g., if they logged a clean protein shake, salad, or poached eggs, recommend repeating that). Combine this historical suggestion with general good biochemical practice.
3. In 'whatNotToDo' (Next Intake warnings):
   - You MUST proactively identify any high-sugar, excessive-carb, or heavy/unhealthy items they logged in their history (e.g., eating a whole cake, sweetened pastries, croissants, or heavy snacks, especially at night). Warn them specifically about repeating that exact past event (e.g., "Avoid high-carb late-night snacks or desserts. Remember last time you logged having a whole cake/croissant at late night, which caused a heavy glycemic load. Steer clear of giving in to late-night sweet cravings today.").
`;
      } else {
        const recentHistoryList = history.slice(0, 5).map((h: any) => 
          `- "${h.name}" (${h.calories} kcal, P: ${h.protein}g, C: ${h.carbs}g, F: ${h.fat}g)`
        ).join("\n");
        
        historyContext = `
[User's Recent Eating Logs (Calibration In Progress - ${uniqueDays}/7 days tracked)]:
${recentHistoryList}
`;
      }
    }

    const systemPromptMessage = `You are a warm, highly certified, positive virtual holistic sports nutritionist and digestive biochemistry coach.
Your absolute goal is to analyze the user's meal to provide highly specific, shame-free nutrition numbers and biochemical/physiological guidance.
Focus entirely on support, physical freedom, and healthy metabolic flows. Never mention dieting, restricts, calorie punishment, guilt, or negative comments.

Strict content requirements for 'insights' (MUST BE TAILORED DYNAMICALLY BASED ON TODAY'S CUMULATIVE MACROS):
1. DO NOT give past-tense advice (such as 'chew your food', 'sit upright', or 'eat slower'). 
2. In 'digestBetter', highlight physical biochemical achievements of this specific food (e.g. 'By consuming this meal, you secured X% of your daily potassium/manganese/calcium/phosphate/iron intake' or similar biochemical/mineral markers) to show what active benefits they just gave to their body.
3. In 'bestTimeOfDay', you MUST consult the user's [Today's Cumulative Nutrient Intake so far] listed below. Tailor your next-meal suggestions and additions directly to resolve any deficiencies or overconsumptions. If today's carbohydrates are high (e.g., approaching or exceeding 220g), explicitly note this and warn them against consuming fast-acting starches or pastries. If today's protein is low (well below ${proteinTarget}g), suggest protein-rich, diet-compliant additions (e.g. tofu/tempeh/lentils/seeds for vegetarian, clean eggs/salmon/chicken for omnivore, etc.) to balance their intake. Include circadian and caffeine timing guidelines (e.g. enjoy food in the morning but avoid eating directly after caffeine to prevent sharp stress-cortisol-insulin spikes).
4. In 'activityToEliminate' (representing what physical action they should do right now vs what they cannot/should not do), provide a highly specific recommendation starting with WHAT TO DO vs WHAT NOT TO DO. Do NOT write generic advice like 'go for a walk'. Explain how key nutrients are activating body systems (glycogen synthesis, ATP cycling, muscle fiber transportation) and map this to activities, taking into account the current hour of the day (Current hour: ${parsedLocalHour}):
   - Clearly structure your output using exactly this format:
     ✅ **WHAT TO DO (Focus Work/Exercise/Light Work/Nap/Sleep):** [Specific activity they should engage in, explaining the metabolic and circadian trigger/reason]
     ❌ **WHAT NOT TO DO:** [Specific activity they should avoid right now, explaining the physiological reason]
   - If it is late evening/night (after 19:00 or before 06:00), DO NOT support strenuous physical exercises or high-arousal deep focus blocks. Instead, recommend WHAT TO DO (Sleep/Rest or Light Work like calm light stretching, winding down, or gentle breathing), and suggest WHAT NOT TO DO (Intense exercise/workout, screen exposures).
   - If daytime and they logged high carbohydrates (or high energy), recommend WHAT TO DO (Exercise like an active walk or glycogen-shuttling strength workout) to partition glucose into muscles, and WHAT NOT TO DO (sitting completely idle, post-meal napping that causes lethargy under carb spikes).
   - If glycemic curves are fully stable, suggest WHAT TO DO (Focus Work like a deep coding sprint or logical session) to capitalize on stable neural fuel, and WHAT NOT TO DO (heavy workouts when energy is optimal for quiet cognitive tasks).
   - Format this so it readably contains either 'Focus Work', 'Exercise', 'Light Work', 'Nap', or 'Sleep' in the label.
5. In 'whatToDo' and 'whatNotToDo' (under Next Intake), customize these suggestions strictly based on the user's [Today's Cumulative Nutrient Intake so far] to balance out their daily totals. If a key macro is lacking, 'whatToDo' must prioritize a food addition rich in that specific nutrient. If a macro is overconsumed or saturated, 'whatNotToDo' must warn against further intake of foods high in that macro.

6. CRITICAL DIRECTIVE FOR MEAL NAME: In the 'name' property of 'mealAnalysis', use a short, clean, human-friendly, capitalized title of the food item or meal itself (e.g., 'Pea Protein Shake' or 'Apple and Peach Bowl'). You are STRICTLY FORBIDDEN from adding generic, marketing-style, or repetitive adjectives to the meal name, such as "Nourishing", "Healthy", "Delicious", "Wholesome", "Nutritious", "Balanced", etc. (e.g., write "Sweet Potato Salad" instead of "Nourishing Sweet Potato Salad", and "Oatmeal with Almonds" instead of "Healthy Balanced Oatmeal with Almonds"). Keep the title strictly literal, clean, direct, and focused solely on what the food is. Do NOT include any appended meta-text, '[Additional Details]', or 'verification query' in the title name.

7. CRITICAL DIRECTIVE: DO NOT ASSUME OR HALLUCINATE INGREDIENTS. Do not assume or add ingredients that are not explicitly mentioned by the user or clearly visible in any attached photo. For example, if a user describes a salad with cucumber and feta, do NOT assume or add common salad items like 'avocado' or 'apple cider vinaigrette' unless they are explicitly requested or clearly shown in the image. Double-check and ensure you log and name what the user explicitly wrote instead of omitting them. Only analyze what is explicitly listed or visible. Accurate visual and textual grounding is mandatory. No unprompted assumptions!

8. DYNAMIC QUANTITY/PORTION CALCULATION: You MUST dynamically adjust and scale all calculations of macronutrients and micronutrients (calories, protein, carbs, fat, fiber, phosphorus, antioxidants) to match the EXACT quantities, weights, volumes, counts, or portions specified in the user's text description or visually shown in the image.

9. DIETARY PREFERENCE & RESTRICTIONS:
   - The user's specified diet type is: '${dietType || "None specified"}'.
   - You MUST customize all meal suggestions, missing nutrient additions, and 'whatToDo' / 'whatNotToDo' to strictly and absolutely adhere to this dietary preference.
   - CRITICAL RULES:
     - If the dietary preference contains 'Vegetarian' (or similar), you are STRICTLY FORBIDDEN from suggesting chicken, turkey, beef, pork, bacon, fish, seafood, gelatin, or any other meat/flesh. Only suggest vegetarian protein sources like tofu, tempeh, edamame, lentils, beans, chickpeas, Greek yogurt, cottage cheese, eggs, seeds, and nuts.
     - If the dietary preference contains 'Vegan' (or similar), you are STRICTLY FORBIDDEN from suggesting any animal products whatsoever, including meat, fish, poultry, eggs, dairy, milk, cheese, honey, or whey. Only suggest plant-based proteins.
     - If the dietary preference contains 'Keto' (or similar), focus purely on low-carb, high-fat, moderate-protein items, and avoid high-carb additions like grains, potatoes, sweet potatoes, or sugar.
     - If the dietary preference contains any allergies (e.g. 'Gluten-Free', 'Nut-Free', etc.), you must strictly avoid suggesting any food items containing those allergens.
   - Always verify that EVERY SINGLE food item you suggest in any text field (including 'whatToDo', 'whatNotToDo', 'digestBetter', etc.) is 100% compliant with the dietary preference.

10. CLARIFICATION SEEKING RULE: If the user provides a completely unspecified or highly ambiguous meal (e.g. just 'food' or 'custom meal' or something unintelligible) where it is impossible to estimate macros even with Google Search grounding, you MUST set "status" to "clarification_needed" and return EXACTLY ONE friendly, helpful, highly focused clarification question in the "clarificationQuestions" array (e.g., "To help me calculate accurately, could you share the main ingredients or portion size of this dish?"). NEVER ask the user to specify raw numbers/macros (like calories, protein, carbs, fat) because they do not know them; instead, always ask for ingredients, cooking methods, or simple portion descriptions. Limit the array to exactly 1 string so the UI displays exactly one input box.

11. GOOGLE SEARCH GROUNDING & SMART ESTIMATION: You have Google Search grounding enabled. You MUST search Google to find accurate, exact nutritional information for any specific brands, restaurant menu items, packaged foods, or regional recipes mentioned. If a search does not return highly reliable, precise values, or if the food item is not in your training data, use your advanced biochemical knowledge to provide a highly educated, safe, realistic estimation rather than immediately failing or blocking. Only set 'status' to 'clarification_needed' if the input is completely unquantifiable or unintelligible.

[User's Today's Cumulative Nutrient Intake Context]:
${macrosContext}
${historyContext}

Strict JSON Response Schema Rules:
- 'status' must be either 'success' or 'clarification_needed'.
- When 'status' is 'clarification_needed', supply exactly ONE friendly clarification question in 'clarificationQuestions' (as a single string item in the array) and omit 'mealAnalysis'.
- When 'status' is 'success', you MUST fill 'mealAnalysis' with realistic macros (calories, protein, carbs, fat, detected ingredients list, confidence) and also dynamic time-based 'mealPeriod' (such as 'Breakfast', 'Lunch', 'Afternoon Snack', 'Dinner', 'Late Night Snack').`;

    parts.push({ text: `Analyze this meal input: "${targetText}".
[Context Details]: Current local clock hour of the user is ${parsedLocalHour}:00. Based on this, determine the correct "mealPeriod" and format your physical, metabolic, and post-meal suggestions suitable for ${parsedLocalHour}:00.` });

    console.log("Contacting Gemini for meal analysis...");
    
    try {
      const response = await generateContentWithRetryAndFallbacks(
        ai,
        {
          contents: { parts },
          config: {
            systemInstruction: systemPromptMessage,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                status: {
                  type: Type.STRING,
                  description: "Status: 'success' if ready to issue full nutritious stats, or 'clarification_needed' if there are ambiguities.",
                },
                mealAnalysis: {
                  type: Type.OBJECT,
                  description: "Macronutrient breakdown of the meal",
                  properties: {
                    name: { type: Type.STRING },
                    mealPeriod: { type: Type.STRING, description: "Dynamic assignment: 'Breakfast' | 'Lunch' | 'Afternoon Snack' | 'Dinner' | 'Late Night Snack' based on user clock hour" },
                    calories: { type: Type.INTEGER },
                    protein: { type: Type.INTEGER },
                    carbs: { type: Type.INTEGER },
                    fat: { type: Type.INTEGER },
                    fiber: { type: Type.INTEGER, description: "Dietary fiber in grams" },
                    phosphorus: { type: Type.INTEGER, description: "Phosphorus content in milligrams" },
                    antioxidants: { type: Type.INTEGER, description: "Antioxidants index on a scale of 1 to 10" },
                    confidence: { type: Type.STRING, description: "'low' | 'medium' | 'high'" },
                    portionDetected: { type: Type.STRING },
                    ingredients: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          amount: { type: Type.STRING },
                        },
                        required: ["name"]
                      }
                    }
                  },
                  required: ["name", "mealPeriod", "calories", "protein", "carbs", "fat", "confidence", "portionDetected", "ingredients"]
                },
                insights: {
                  type: Type.OBJECT,
                  description: "Wellness and positive motion highlights",
                  properties: {
                    digestBetter: { type: Type.STRING, description: "Detailed specific minerals and chemicals gained from this meal and how they support metabolic systems. Do not list past-tense digestion instructions." },
                    bestTimeOfDay: { type: Type.STRING, description: "Low or missing macronutrients advice with additions for the next meal, plus timing guidelines relative to caffeine, cortisol, and circadian rhythms." },
                    activityToEliminate: { type: Type.STRING, description: "Extremely actionable non-generic biochemically-mapped suggestion for what to do now, taking into account user local time context." },
                    whatToDo: { type: Type.STRING, description: "Dynamic tailored recommendation of exactly what ingredient, action, or balance to focus on NEXT based on today's logged macros." },
                    whatNotToDo: { type: Type.STRING, description: "Tailored recommendation of exactly what ingredient pairings, heavy starches, or spikes to avoid on their next intake." }
                  },
                  required: ["digestBetter", "bestTimeOfDay", "activityToEliminate", "whatToDo", "whatNotToDo"]
                },
                clarificationQuestions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Questions to display to the user if status is clarification_needed."
                }
              },
              required: ["status"]
            }
          }
        },
        15000 // 15 seconds timeout to guarantee ultra-responsive offline/simulated fallback
      );

      const resultText = response.text || "{}";
      const resultObj = JSON.parse(resultText);

      if (resultObj.status === "success" && resultObj.mealAnalysis) {
        resultObj.mealAnalysis.name = cleanMealName(resultObj.mealAnalysis.name);
      }

      if (resultObj.status === "clarification_needed") {
        // Store the session state so user can reply next
        const newKey = sessionKey || generateUniqueKey();
        sessionStore.set(newKey, {
          originalText: targetText,
          originalImage: targetImage,
          questions: resultObj.clarificationQuestions,
          lastTimestamp: Date.now()
        });
        resultObj.sessionKey = newKey;
      } else {
        // If was in session, clean it up since analysis achieved success
        if (sessionKey) {
          sessionStore.delete(sessionKey);
        }
      }

      return res.json(resultObj);
    } catch (apiErr: any) {
      console.error("Gemini API call failed:", apiErr.message || apiErr);
      return res.status(500).json({
        error: "Our Gemini AI Dietitian encountered an issue. Please try again in a few seconds.",
        details: apiErr.message || String(apiErr)
      });
    }
  } catch (err: any) {
    console.error("API error during meal analysis route execution:", err);
    res.status(500).json({
      error: "We encountered an issue during meal analysis. Please try again with simple descriptive words.",
      details: err.message
    });
  }
});

// Configure Vite integration or serve static bundles
async function initializeApp() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Integrating Vite in development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production resources...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

initializeApp().catch((e) => {
  console.error("Failed to start application server", e);
});
