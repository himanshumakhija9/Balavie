import React, { useState, useRef, useEffect } from "react";
import { 
  Flame, 
  Dumbbell, 
  Wheat, 
  Droplet, 
  Camera, 
  Image as ImageIcon, 
  Activity, 
  Clock, 
  Heart, 
  Coffee,
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight, 
  RefreshCw, 
  Compass, 
  X, 
  Sparkles,
  Info,
  Sun,
  Moon,
  Cloud,
  CloudOff,
  Download,
  Scale,
  Settings,
  LogIn,
  LogOut,
  Edit,
  Save,
  Calendar,
  User,
  Leaf
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { MealLog, MealAnalysisResponse } from "./types";
import BalanceRing from "./components/BalanceRing";
import MacroBars from "./components/MacroBars";
import CalorieChart from "./components/CalorieChart";
import MealCard from "./components/MealCard";
import { calculateTargets } from "./lib/nutrition";
import { auth, db, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, doc, setDoc, deleteDoc, getDocs, query, writeBatch } from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function cleanForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(item => cleanForFirestore(item));
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      result[key] = cleanForFirestore(value);
    }
    return result;
  }
  return obj;
}

function getCombinedWhatToDo(whatToDo?: string, bestTimeOfDay?: string): string {
  const cleanWhat = (whatToDo || "").trim();
  const cleanBest = (bestTimeOfDay || "").trim();
  if (!cleanWhat && !cleanBest) return "";
  if (!cleanWhat) return cleanBest;
  if (!cleanBest) return cleanWhat;
  if (cleanWhat.toLowerCase() === cleanBest.toLowerCase()) return cleanWhat;
  if (cleanWhat.toLowerCase().includes(cleanBest.toLowerCase())) return cleanWhat;
  if (cleanBest.toLowerCase().includes(cleanWhat.toLowerCase())) return cleanBest;

  let start = cleanBest;
  if (!start.endsWith(".") && !start.endsWith("!") && !start.endsWith("?")) {
    start += ".";
  }
  let end = cleanWhat;
  const firstChar = end.charAt(0);
  const rest = end.slice(1);
  const transition = "To support this and put this into active practice,";
  return `${start} ${transition} ${firstChar.toLowerCase()}${rest}`;
}

function parseLifestyleAdvice(advice: string) {
  let whatToDo = "";
  let whatNotToDo = "";
  if (!advice) return { whatToDo, whatNotToDo };

  const parts = advice.split(/❌|\bAVOID NOW\b|\bWHAT NOT TO DO\b/i);
  if (parts.length >= 2) {
    whatToDo = parts[0].replace(/✅|\bCAN DO\b|\bWHAT TO DO\b|[\*:]/gi, "").trim();
    whatNotToDo = parts[1].replace(/[\*:]/g, "").trim();
  } else {
    const lines = advice.split("\n").map(l => l.trim()).filter(Boolean);
    const todoLines = lines.filter(l => l.includes("✅") || l.toLowerCase().includes("can do") || l.toLowerCase().includes("what to do"));
    const avoidLines = lines.filter(l => l.includes("❌") || l.toLowerCase().includes("avoid") || l.toLowerCase().includes("what not to do"));
    if (todoLines.length > 0 || avoidLines.length > 0) {
      whatToDo = todoLines.map(l => l.replace(/✅|\bCAN DO\b|\bWHAT TO DO\b|[\*:]/gi, "").trim()).join(" ");
      whatNotToDo = avoidLines.map(l => l.replace(/❌|\bAVOID NOW\b|\bWHAT NOT TO DO\b|[\*:]/gi, "").trim()).join(" ");
    } else {
      whatToDo = advice;
    }
  }
  return { whatToDo, whatNotToDo };
}

const formatMacro = (val: number | undefined): string => {
  if (val === undefined || isNaN(val)) return "0";
  return (Math.round(val * 10) / 10).toString();
};

const formatCalories = (val: number | undefined): string => {
  if (val === undefined || isNaN(val)) return "0";
  return Math.round(val).toString();
};

const calculateMealPeriod = (mealName: string, hour: number): string => {
  const lowerName = (mealName || "").toLowerCase();
  if (lowerName.includes("breakfast") || lowerName.includes("morning")) return "Breakfast";
  if (lowerName.includes("lunch") || lowerName.includes("midday")) return "Lunch";
  if (lowerName.includes("afternoon snack")) return "Afternoon Snack";
  if (lowerName.includes("late night")) return "Late Night Snack";
  if (lowerName.includes("dinner") || lowerName.includes("supper")) return "Dinner";
  if (lowerName.includes("snack")) {
    if (hour >= 5 && hour < 11) return "Breakfast";
    if (hour >= 11 && hour < 15) return "Lunch";
    if (hour >= 15 && hour < 18) return "Afternoon Snack";
    if (hour >= 18 && hour < 22) return "Dinner";
    return "Late Night Snack";
  }
  if (hour >= 5 && hour < 11) return "Breakfast";
  if (hour >= 11 && hour < 15) return "Lunch";
  if (hour >= 15 && hour < 18) return "Afternoon Snack";
  if (hour >= 18 && hour < 22) return "Dinner";
  return "Late Night Snack";
};

const BrandMark = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" fill="none" className="shrink-0">
    <defs>
      <linearGradient id="bm-em" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5FE3AC"/>
        <stop offset="1" stopColor="#2FA671"/>
      </linearGradient>
      <linearGradient id="bm-gd" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F6C868"/>
        <stop offset="1" stopColor="#F0913C"/>
      </linearGradient>
    </defs>
    <path d="M 106.8 44.4 A 56 56 0 0 1 155.6 93.2" stroke="url(#bm-gd)" strokeWidth="10" strokeLinecap="round"/>
    <path d="M 155.6 106.8 A 56 56 0 0 1 106.8 155.6" stroke="url(#bm-em)" strokeWidth="10" strokeLinecap="round"/>
    <path d="M 93.2 155.6 A 56 56 0 0 1 44.4 106.8" stroke="url(#bm-em)" strokeOpacity="0.62" strokeWidth="10" strokeLinecap="round"/>
    <path d="M 44.4 93.2 A 56 56 0 0 1 93.2 44.4" stroke="currentColor" strokeOpacity="0.9" strokeWidth="10" strokeLinecap="round"/>
    <circle cx="100" cy="100" r="6.5" fill="currentColor"/>
  </svg>
);

export default function App() {
  const [textInput, setTextInput] = useState("");
  const [imageInput, setImageInput] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Real-time Dynamic Local Clock
  const [currentTime, setCurrentTime] = useState("");
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Premium Dark Mode / Light Mode Theme state
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    try {
      const savedTheme = localStorage.getItem("mindful_flow_theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
      }
    } catch {}
    return "light";
  });

  // Cheers state for Strava-style kudos
  const [cheers, setCheers] = useState<Record<string, number>>(() => {
    try {
      const cached = localStorage.getItem("mindful_flow_meal_cheers");
      return cached ? JSON.parse(cached) : {};
    } catch (_) {
      return {};
    }
  });

  const handleCheer = (logId: string) => {
    const updated = { ...cheers, [logId]: (cheers[logId] || 0) + 1 };
    setCheers(updated);
    localStorage.setItem("mindful_flow_meal_cheers", JSON.stringify(updated));
  };

  // Dual-mode Unified Auth state variables
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [profileFetched, setProfileFetched] = useState(false);

  // Personalized Diet Type indicating text
  const [dietType, setDietType] = useState<string>(() => {
    return localStorage.getItem("mindful_flow_diet_type") || "";
  });

  // Body weight state in kilograms
  const [bodyWeight, setBodyWeight] = useState<number>(() => {
    const cached = localStorage.getItem("mindful_flow_body_weight");
    return cached ? Number(cached) : 70;
  });

  // Body height state in centimeters
  const [bodyHeight, setBodyHeight] = useState<number>(() => {
    const cached = localStorage.getItem("mindful_flow_body_height");
    return cached ? Number(cached) : 170;
  });

  // Unique chronological timestamps when app was active to trace long usage streak
  const [activeDates, setActiveDates] = useState<string[]>(() => {
    try {
      const localDates = localStorage.getItem("mindful_flow_active_dates");
      return localDates ? JSON.parse(localDates) : [];
    } catch {}
    return [];
  });

  // Cache last time donation reminder prompt was displayed
  const [lastDonationPromptDate, setLastDonationPromptDate] = useState<string | null>(() => {
    return localStorage.getItem("mindful_flow_last_donation_prompt");
  });

  // Remembers if checkout payment succeeded
  const [hasDonated, setHasDonated] = useState<boolean>(() => {
    return localStorage.getItem("mindful_flow_has_donated") === "true";
  });

  const [donationSuccessMessage, setDonationSuccessMessage] = useState<string | null>(null);
  const [selectedDonationAmount, setSelectedDonationAmount] = useState<number>(5);
  const [isCoffeeLoading, setIsCoffeeLoading] = useState(false);

  // Remembers if coffee callout card was shown to prevent repeated overlays
  const [showCoffeePrompt, setShowCoffeePrompt] = useState(false);

  // Synchronize or guest status banner indicator
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'failed' | 'offline'>('offline');

  // Multi-screen layout navigation index
  const [activeTab, setActiveTab] = useState<'balance' | 'history' | 'settings'>('balance');

  // Historical meal logs loaded locally or synced from Firestore
  const [pastLogs, setPastLogs] = useState<MealLog[]>([]);

  // Search filter query string
  const [searchQuery, setSearchQuery] = useState("");

  // Intermediate Gemini analysis session holding state in case of clarification dialog
  const [currentAnalysis, setCurrentAnalysis] = useState<MealAnalysisResponse | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});

  // Inline Log Edit mode variables
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCalories, setEditCalories] = useState<number>(0);
  const [editProtein, setEditProtein] = useState<number>(0);
  const [editCarbs, setEditCarbs] = useState<number>(0);
  const [editFat, setEditFat] = useState<number>(0);
  const [editFiber, setEditFiber] = useState<number>(0);
  const [tempEditDate, setTempEditDate] = useState("");
  const [tempEditTime, setTempEditTime] = useState("");

  // PWA elements holding states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);



  // Listen for Auth changes and trigger synchronization
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecking(false);
    });
    return unsub;
  }, []);

  // Log active dates to calculate daily consistency streak
  useEffect(() => {
    const todayStr = new Date().toDateString();
    if (!activeDates.includes(todayStr)) {
      const updated = [...activeDates, todayStr];
      setActiveDates(updated);
      localStorage.setItem("mindful_flow_active_dates", JSON.stringify(updated));
      
      // Write to cloud profile if authenticated
      if (user) {
        try {
          setDoc(doc(db, "users", user.uid, "profile", "settings"), {
            activeDates: updated
          }, { merge: true });
        } catch(e) {}
      }
    }
  }, [user]);

  // Synchronize past logs on authentication
  useEffect(() => {
    const fetchLogsAndProfile = async () => {
      const cachedUserLogs = user ? localStorage.getItem(`mindful_flow_logs_${user.uid}`) : null;
      let initialUserLogs: MealLog[] = [];
      try {
        if (cachedUserLogs) {
          initialUserLogs = JSON.parse(cachedUserLogs);
          setPastLogs(initialUserLogs);
        }
      } catch(_) {}

      if (user) {
        setSyncStatus("syncing");
        localStorage.setItem("mindful_flow_last_uid", user.uid);
        
        // Migrate guest local logs to authenticated account
        try {
          const guestLogsStr = localStorage.getItem("mindful_flow_logs");
          if (guestLogsStr) {
            const guestLogs = JSON.parse(guestLogsStr) as MealLog[];
            if (guestLogs.length > 0) {
              const batch = writeBatch(db);
              guestLogs.forEach((log) => {
                const docRef = doc(db, "users", user.uid, "logs", log.id);
                batch.set(docRef, cleanForFirestore(log));
                initialUserLogs.push(log);
              });
              await batch.commit();
              localStorage.removeItem("mindful_flow_logs");
              
              initialUserLogs.sort((a, b) => {
                const timeA = a.epochTime || (a.dateStr ? new Date(a.dateStr).getTime() : 0) || 0;
                const timeB = b.epochTime || (b.dateStr ? new Date(b.dateStr).getTime() : 0) || 0;
                return timeB - timeA;
              });
              
              setPastLogs(initialUserLogs);
              localStorage.setItem(`mindful_flow_logs_${user.uid}`, JSON.stringify(initialUserLogs));
            }
          }
        } catch (e) {
          console.warn("Could not migrate guest logs:", e);
        }

        try {
          // Fetch settings
          const profilePath = `users/${user.uid}/profile`;
          const snap = await getDocs(query(collection(db, "users", user.uid, "profile")));
          snap.forEach((doc) => {
            if (doc.id === "settings") {
              const dat = doc.data();
              if (dat.dietType !== undefined) {
                setDietType(dat.dietType);
              }
              if (dat.bodyWeight !== undefined) {
                setBodyWeight(Number(dat.bodyWeight));
              }
              if (dat.bodyHeight !== undefined) {
                setBodyHeight(Number(dat.bodyHeight));
              }
              if (dat.activeDates !== undefined) {
                const parsedDates = Array.isArray(dat.activeDates) ? dat.activeDates : [];
                setActiveDates(parsedDates);
                localStorage.setItem("mindful_flow_active_dates", JSON.stringify(parsedDates));
              }
              if (dat.lastDonationPromptDate !== undefined) {
                setLastDonationPromptDate(dat.lastDonationPromptDate);
                localStorage.setItem("mindful_flow_last_donation_prompt", dat.lastDonationPromptDate);
              }
              if (dat.hasDonated !== undefined) {
                setHasDonated(Boolean(dat.hasDonated));
                localStorage.setItem("mindful_flow_has_donated", String(dat.hasDonated));
              }
            }
          });
          setProfileFetched(true);

          // Fetch logs
          const q = query(collection(db, "users", user.uid, "logs"));
          const logsSnap = await getDocs(q);
          const logsList: MealLog[] = [];
          logsSnap.forEach((doc) => {
            logsList.push({ id: doc.id, ...doc.data() } as MealLog);
          });

          const mergedLogs = [...logsList];
          initialUserLogs.forEach(localLog => {
            if (!mergedLogs.some(l => l.id === localLog.id)) {
              mergedLogs.push(localLog);
            }
          });

          mergedLogs.sort((a, b) => {
            const timeA = a.epochTime || (a.dateStr ? new Date(a.dateStr).getTime() : 0) || 0;
            const timeB = b.epochTime || (b.dateStr ? new Date(b.dateStr).getTime() : 0) || 0;
            return timeB - timeA;
          });

          setPastLogs(mergedLogs);
          localStorage.setItem(`mindful_flow_logs_${user.uid}`, JSON.stringify(mergedLogs));
          setSyncStatus("synced");
        } catch (err) {
          console.error("Sync error:", err);
          setSyncStatus("offline");
        }
      } else {
        // Guest mode
        try {
          const localData = localStorage.getItem("mindful_flow_logs");
          if (localData) {
            setPastLogs(JSON.parse(localData));
          } else {
            const lastUid = localStorage.getItem("mindful_flow_last_uid");
            if (lastUid) {
              const userCached = localStorage.getItem(`mindful_flow_logs_${lastUid}`);
              if (userCached) setPastLogs(JSON.parse(userCached));
            }
          }
          setSyncStatus("offline");
        } catch(e) {}
      }
    };

    if (!authChecking) {
      fetchLogsAndProfile();
    }
  }, [user, authChecking]);

  // Listen for PWA installation trigger
  useEffect(() => {
    const handleBeforePrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforePrompt);
  }, []);

  const triggerPwaInstallation = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA decision: ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Photo upload limit is 10MB for fast analysis.");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageInput(reader.result as string);
      setErrorMessage(null);
    };
    reader.onerror = () => setErrorMessage("Could not parse image.");
    reader.readAsDataURL(file);
  };

  const removeCapturedImage = () => {
    setImageInput(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Submit to backend
  const submitAnalyzeMeal = async (answersOverride?: Record<string, string>) => {
    if (!textInput.trim() && !imageInput) {
      setErrorMessage("Please type what you ate or snap a picture of your plate.");
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const todayLogs = pastLogs.filter(log => {
        if (log.dateStr) return log.dateStr === new Date().toDateString();
        const todayFormatted = new Date().toLocaleString("en-US", { month: "short", day: "numeric" });
        return log.timestamp && log.timestamp.includes(todayFormatted);
      });

      const todayProtein = todayLogs.reduce((acc, log) => acc + (log.protein || 0), 0);
      const todayCarbs = todayLogs.reduce((acc, log) => acc + (log.carbs || 0), 0);
      const todayFat = todayLogs.reduce((acc, log) => acc + (log.fat || 0), 0);
      const todayFiber = todayLogs.reduce((acc, log) => {
        if (log.fiber !== undefined) return acc + log.fiber;
        return acc + Math.round((log.carbs || 0) * 0.1);
      }, 0);
      const todayPhosphorus = todayLogs.reduce((acc, log) => {
        if (log.phosphorus !== undefined) return acc + log.phosphorus;
        return acc + Math.round((log.protein || 0) * 6);
      }, 0);
      const todayAntioxidants = todayLogs.reduce((acc, log) => {
        if (log.antioxidants !== undefined) return acc + log.antioxidants;
        const name = (log.name || "").toLowerCase();
        if (name.includes("salad") || name.includes("garden") || name.includes("berry") || name.includes("spinach") || name.includes("greens") || name.includes("avocado") || name.includes("oat")) return acc + 6;
        return acc + 2;
      }, 0);

      const payload: any = {
        textInput,
        imageInput,
        localHour: new Date().getHours(),
        dietType,
        bodyWeight,
        todayMacros: {
          protein: todayProtein,
          carbs: todayCarbs,
          fat: todayFat,
          fiber: todayFiber,
          phosphorus: todayPhosphorus,
          antioxidants: todayAntioxidants
        },
        history: pastLogs.map(l => ({
          name: l.name,
          calories: l.calories,
          protein: l.protein,
          carbs: l.carbs,
          fat: l.fat,
          timestamp: l.timestamp,
          mealPeriod: l.mealPeriod
        }))
      };

      if (answersOverride && currentAnalysis?.sessionKey) {
        payload.sessionKey = currentAnalysis.sessionKey;
        payload.clarificationAnswers = answersOverride;
      }

      const res = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Virtual dietitian is busy. Please retry in a few seconds.");
      }

      const data: MealAnalysisResponse = await res.json();
      
      if (data.status === "success") {
        setCurrentAnalysis(null);
        setClarificationAnswers({});
        setTextInput("");
        setImageInput(null);
        if (fileInputRef.current) fileInputRef.current.value = "";

        if (data.mealAnalysis && data.insights) {
          const cleanName = data.mealAnalysis.name.toLowerCase().trim();
          const cleanInput = textInput.toLowerCase().trim();
          
          const matchedPrevLog = pastLogs.find(l => {
            if (!l.editedByUser) return false;
            const ln = l.name.toLowerCase().trim();
            return ln === cleanName || ln === cleanInput;
          });

          let finalCalories = data.mealAnalysis.calories;
          let finalProtein = data.mealAnalysis.protein;
          let finalCarbs = data.mealAnalysis.carbs;
          let finalFat = data.mealAnalysis.fat;
          let finalFiber = data.mealAnalysis.fiber;
          let finalPhosphorus = data.mealAnalysis.phosphorus;
          let finalAntioxidants = data.mealAnalysis.antioxidants;
          let portionDetectedToUse = data.mealAnalysis.portionDetected;
          let ingredientsToUse = data.mealAnalysis.ingredients;
          let isLearned = false;

          if (matchedPrevLog) {
            const hasDeviation = 
              Math.abs((matchedPrevLog.calories || 0) - (data.mealAnalysis.calories || 0)) > 1 ||
              Math.abs((matchedPrevLog.protein || 0) - (data.mealAnalysis.protein || 0)) > 0.5 ||
              Math.abs((matchedPrevLog.carbs || 0) - (data.mealAnalysis.carbs || 0)) > 0.5 ||
              Math.abs((matchedPrevLog.fat || 0) - (data.mealAnalysis.fat || 0)) > 0.5;

            if (hasDeviation) {
              finalCalories = matchedPrevLog.calories;
              finalProtein = matchedPrevLog.protein;
              finalCarbs = matchedPrevLog.carbs;
              finalFat = matchedPrevLog.fat;
              if (matchedPrevLog.fiber !== undefined) finalFiber = matchedPrevLog.fiber;
              if (matchedPrevLog.phosphorus !== undefined) finalPhosphorus = matchedPrevLog.phosphorus;
              if (matchedPrevLog.antioxidants !== undefined) finalAntioxidants = matchedPrevLog.antioxidants;
              portionDetectedToUse = matchedPrevLog.portionDetected || data.mealAnalysis.portionDetected;
              ingredientsToUse = matchedPrevLog.ingredients || data.mealAnalysis.ingredients;
              isLearned = true;
            }
          }

          const nameToUse = isLearned && matchedPrevLog ? matchedPrevLog.name : data.mealAnalysis.name;

          const newLog: MealLog = {
            id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
            timestamp: new Date().toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            name: nameToUse,
            image: imageInput || undefined,
            calories: finalCalories,
            protein: finalProtein,
            carbs: finalCarbs,
            fat: finalFat,
            fiber: finalFiber,
            phosphorus: finalPhosphorus,
            antioxidants: finalAntioxidants,
            portionDetected: portionDetectedToUse,
            ingredients: ingredientsToUse,
            digestBetter: data.insights.digestBetter,
            bestTimeOfDay: data.insights.bestTimeOfDay,
            activityToEliminate: data.insights.activityToEliminate,
            whatToDo: data.insights.whatToDo,
            whatNotToDo: data.insights.whatNotToDo,
            mealPeriod: calculateMealPeriod(nameToUse, new Date().getHours()),
            dateStr: new Date().toDateString(),
            epochTime: Date.now(),
            isLearned
          };

          const updatedLogs = [newLog, ...pastLogs];
          setPastLogs(updatedLogs);
          await saveLogToDb(newLog);
        }
      } else {
        setCurrentAnalysis(data);
        const initialAnswers: Record<string, string> = {};
        data.clarificationQuestions?.forEach(q => {
          initialAnswers[q] = "";
        });
        setClarificationAnswers(initialAnswers);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to analyze. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClarificationChange = (question: string, value: string) => {
    setClarificationAnswers(prev => ({ ...prev, [question]: value }));
  };

  const submitClarificationFeedback = () => {
    const answeredCount = Object.values(clarificationAnswers).filter((v: string) => v.trim()).length;
    if (answeredCount === 0) {
      setErrorMessage("Please write a quick response before submitting.");
      return;
    }
    submitAnalyzeMeal(clarificationAnswers);
  };

  const saveLogToDb = async (logToSave: MealLog) => {
    setSyncStatus("syncing");
    if (user) {
      try {
        const cachedUserLogs = localStorage.getItem(`mindful_flow_logs_${user.uid}`);
        let parsed: MealLog[] = cachedUserLogs ? JSON.parse(cachedUserLogs) : [];
        parsed = parsed.filter(l => l.id !== logToSave.id);
        parsed.unshift(logToSave);
        localStorage.setItem(`mindful_flow_logs_${user.uid}`, JSON.stringify(parsed));
      } catch(_) {}

      try {
        await setDoc(doc(db, "users", user.uid, "logs", logToSave.id), cleanForFirestore(logToSave));
        setSyncStatus("synced");
      } catch (e) {
        setSyncStatus("offline");
      }
    } else {
      try {
        const localData = localStorage.getItem("mindful_flow_logs");
        const logs = localData ? JSON.parse(localData) : [];
        const filtered = logs.filter((l: any) => l.id !== logToSave.id);
        filtered.unshift(logToSave);
        localStorage.setItem("mindful_flow_logs", JSON.stringify(filtered));
        setPastLogs(filtered);
        setSyncStatus("offline");
      } catch(e) {}
    }
  };

  const startEditingLog = (log: MealLog) => {
    setEditingLogId(log.id);
    setEditName(log.name);
    setEditCalories(log.calories);
    setEditProtein(log.protein);
    setEditCarbs(log.carbs);
    setEditFat(log.fat);
    setEditFiber(log.fiber || 0);
    
    const pDate = new Date(log.dateStr || Date.now());
    const year = pDate.getFullYear();
    const month = String(pDate.getMonth() + 1).padStart(2, '0');
    const day = String(pDate.getDate()).padStart(2, '0');
    setTempEditDate(`${year}-${month}-${day}`);
    
    let timeStr = "12:00";
    if (log.timestamp && log.timestamp.includes(",")) {
      const tPart = log.timestamp.split(",")[1]?.trim();
      if (tPart) {
        const [hourMinStr, ampm] = tPart.split(" ");
        if (hourMinStr) {
          let [h, m] = hourMinStr.split(":").map(Number);
          if (ampm === "PM" && h < 12) h += 12;
          if (ampm === "AM" && h === 12) h = 0;
          timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
      }
    } else {
      const now = new Date();
      timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }
    setTempEditTime(timeStr);
  };

  const saveEditedLog = async () => {
    if (!editingLogId) return;
    const originalLog = pastLogs.find(l => l.id === editingLogId);
    if (!originalLog) return;

    const parsedDate = new Date(`${tempEditDate}T${tempEditTime}`);
    const newTimestamp = parsedDate.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    
    const updatedLog: MealLog = {
      ...originalLog,
      name: editName,
      calories: Number(editCalories),
      protein: Number(editProtein),
      carbs: Number(editCarbs),
      fat: Number(editFat),
      fiber: Number(editFiber),
      timestamp: newTimestamp,
      dateStr: parsedDate.toDateString(),
      epochTime: parsedDate.getTime(),
      mealPeriod: calculateMealPeriod(editName, parsedDate.getHours()),
      isLearned: false,
      editedByUser: true
    };

    await saveLogToDb(updatedLog);
    setPastLogs(prev => prev.map(l => l.id === editingLogId ? updatedLog : l));
    setEditingLogId(null);
  };

  const deleteHistoryLog = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncStatus("syncing");
    setPastLogs(prev => prev.filter(item => item.id !== id));

    if (user) {
      try {
        const cachedUserLogs = localStorage.getItem(`mindful_flow_logs_${user.uid}`);
        if (cachedUserLogs) {
          const parsed = JSON.parse(cachedUserLogs).filter((item: any) => item.id !== id);
          localStorage.setItem(`mindful_flow_logs_${user.uid}`, JSON.stringify(parsed));
        }
      } catch(_) {}

      try {
        await deleteDoc(doc(db, "users", user.uid, "logs", id));
        setSyncStatus("synced");
      } catch (e) {
        setSyncStatus("offline");
      }
    } else {
      try {
        const localData = localStorage.getItem("mindful_flow_logs");
        if (localData) {
          const logs = JSON.parse(localData);
          const filtered = logs.filter((item: any) => item.id !== id);
          localStorage.setItem("mindful_flow_logs", JSON.stringify(filtered));
        }
        setSyncStatus("offline");
      } catch(e) {}
    }
  };

  const clearAllLogs = async () => {
    setSyncStatus("syncing");
    if (user) {
      try {
        const q = query(collection(db, "users", user.uid, "logs"));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        localStorage.removeItem(`mindful_flow_logs_${user.uid}`);
        setPastLogs([]);
        setSyncStatus("synced");
      } catch (e) {
        setSyncStatus("failed");
      }
    } else {
      localStorage.removeItem("mindful_flow_logs");
      setPastLogs([]);
      setSyncStatus("offline");
    }
  };

  const handleBuyMeACoffee = () => {
    setIsCoffeeLoading(true);
    setErrorMessage(null);
    try {
      setHasDonated(true);
      localStorage.setItem("mindful_flow_has_donated", "true");
      setDonationSuccessMessage(`Opening Buy Me a Coffee to buy the developer a coffee! Thank you for supporting continued health innovation! ☕💖`);

      if (auth.currentUser) {
        try {
          setDoc(doc(db, "users", auth.currentUser.uid, "profile", "settings"), {
            hasDonated: true
          }, { merge: true });
        } catch (e) {
          console.warn("Could not save donation status to DB:", e);
        }
      }

      const bmcUrl = `https://buymeacoffee.com/balancefit?coffees=1`;
      window.open(bmcUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to proceed to Buy Me a Coffee page.");
    } finally {
      setIsCoffeeLoading(false);
    }
  };

  // Login handler
  const handleLogin = async () => {
    try {
      setErrorMessage(null);
      await signInWithPopup(auth, googleProvider);
    } catch(e: any) {
      setErrorMessage(e.message || "Sign in failed.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setPastLogs([]);
      localStorage.removeItem("mindful_flow_last_uid");
    } catch(e) {}
  };

  // Helper values for calculations
  const filteredLogs = pastLogs.filter(log => 
    log.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (log.ingredients || []).some(ing => ing.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const todayLogs = pastLogs.filter(log => {
    if (log.dateStr) return log.dateStr === new Date().toDateString();
    const todayFormatted = new Date().toLocaleString("en-US", { month: "short", day: "numeric" });
    return log.timestamp && log.timestamp.includes(todayFormatted);
  });

  const todayCalories = todayLogs.reduce((sum, item) => sum + (item.calories || 0), 0);
  const todayProtein = todayLogs.reduce((sum, item) => sum + (item.protein || 0), 0);
  const todayCarbs = todayLogs.reduce((sum, item) => sum + (item.carbs || 0), 0);
  const todayFat = todayLogs.reduce((sum, item) => sum + (item.fat || 0), 0);
  const todayFiber = todayLogs.reduce((sum, item) => {
    if (item.fiber !== undefined) return sum + item.fiber;
    return sum + Math.round((item.carbs || 0) * 0.1);
  }, 0);

  const daysTrackedCount = Array.from(new Set(
    pastLogs.map(log => {
      if (log.dateStr) return log.dateStr;
      if (log.timestamp) {
        try {
          const d = new Date(log.timestamp);
          if (!isNaN(d.getTime())) return d.toDateString();
        } catch (_) {}
      }
      return null;
    }).filter(Boolean)
  )).length;

  const currentStreak = (() => {
    if (pastLogs.length === 0) return 0;
    const sortedDates = Array.from(new Set(
      pastLogs.map(log => {
        if (log.dateStr) return new Date(log.dateStr).setHours(0,0,0,0);
        if (log.timestamp) {
          try {
            const d = new Date(log.timestamp);
            if (!isNaN(d.getTime())) return d.setHours(0,0,0,0);
          } catch (_) {}
        }
        return null;
      }).filter(Boolean) as number[]
    )).sort((a,b) => b - a);

    let streak = 0;
    let today = new Date();
    today.setHours(0,0,0,0);
    let check = today.getTime();

    if (sortedDates[0] && (sortedDates[0] === check || sortedDates[0] === check - 86400000)) {
      streak = 1;
      let current = sortedDates[0];
      for (let i = 1; i < sortedDates.length; i++) {
        if (current - sortedDates[i] <= 86400000 * 1.5) {
          streak++;
          current = sortedDates[i];
        } else {
          break;
        }
      }
    }
    return streak;
  })();

  const activeStreak = (() => {
    if (activeDates.length === 0) return 0;
    const parsed = (activeDates.map(d => {
      try {
        return new Date(d).setHours(0,0,0,0);
      } catch (_) {
        return 0;
      }
    }).filter(Boolean) as number[]).sort((a, b) => b - a);
    const uniqueDates = Array.from(new Set(parsed)) as number[];
    
    let streak = 0;
    let today = new Date();
    today.setHours(0,0,0,0);
    let check = today.getTime();
    
    if (uniqueDates[0] && (uniqueDates[0] === check || uniqueDates[0] === check - 86400000)) {
      streak = 1;
      let current = uniqueDates[0];
      for (let i = 1; i < uniqueDates.length; i++) {
        if (current - uniqueDates[i] <= 86400000 * 1.5) {
          streak++;
          current = uniqueDates[i];
        } else {
          break;
        }
      }
    }
    return streak;
  })();

  const usageStreak = Math.max(currentStreak, activeStreak);

  const isDark = themeMode === 'dark';

  // Preset diet pills
  const diets = [
    { label: "Balanced", value: "Balanced" },
    { label: "Mediterranean", value: "Mediterranean" },
    { label: "Vegetarian", value: "Vegetarian" },
    { label: "Vegan", value: "Vegan" },
    { label: "Keto", value: "Keto" },
    { label: "High-Protein", value: "High-Protein" },
  ];

  const handleDietClick = (value: string) => {
    setDietType(value);
    localStorage.setItem("mindful_flow_diet_type", value);
    if (user) {
      try {
        setDoc(doc(db, "users", user.uid, "profile", "settings"), {
          dietType: value
        }, { merge: true });
      } catch(e) {}
    }
  };

  const handleWeightChange = (newWeight: number) => {
    const val = Math.max(30, Math.min(250, newWeight));
    setBodyWeight(val);
    localStorage.setItem("mindful_flow_body_weight", String(val));
    if (user) {
      try {
        setDoc(doc(db, "users", user.uid, "profile", "settings"), {
          bodyWeight: val
        }, { merge: true });
      } catch(e) {}
    }
  };

  const handleHeightChange = (newHeight: number) => {
    const val = Math.max(100, Math.min(250, newHeight));
    setBodyHeight(val);
    localStorage.setItem("mindful_flow_body_height", String(val));
    if (user) {
      try {
        setDoc(doc(db, "users", user.uid, "profile", "settings"), {
          bodyHeight: val
        }, { merge: true });
      } catch(e) {}
    }
  };

  const toggleTheme = () => {
    const nextTheme = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(nextTheme);
    localStorage.setItem("mindful_flow_theme", nextTheme);
  };

  // Get weekday formatting
  const formattedDay = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  }).toUpperCase();

  return (
    <div className={`min-h-screen transition-colors duration-300 pb-28 overflow-x-hidden ${isDark ? 'dark bg-[#141312] text-[#F5F2EC]' : 'bg-[#F3F6F1] text-[#15241B]'}`}>
      
      {/* Absolute Glow Background Accent */}
      <div className={`absolute top-0 inset-x-0 h-64 -z-10 pointer-events-none transition-opacity duration-300 ${isDark ? 'bg-gradient-to-b from-emerald-950/15 via-transparent to-transparent' : 'bg-gradient-to-b from-[#1CA35A]/5 via-transparent to-transparent'}`} />

      {/* Main Single Feed Stage */}
      <main className="w-full max-w-md mx-auto px-4 pt-6 space-y-6">

        {/* Header time tracker */}
        <div className="flex justify-end items-center bg-transparent px-1">
          <span className="font-mono text-[10px] tracking-wider font-semibold opacity-80">
            🕒 {currentTime}
          </span>
        </div>

        {/* Brand Header Card with Balance Ring and gold-gradient Wordmark */}
        <div className={`border rounded-[22px] p-4.5 flex items-center justify-between shadow-sm transition-all duration-300 ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
          <div className="flex items-center gap-3">
            <BrandMark size={34} />
            <div className="flex flex-col gap-0.5 text-left">
              <div className="flex items-center gap-0.5 leading-none">
                <span className={`font-sans text-2xl font-semibold tracking-tight ${isDark ? 'text-[#F5F2EC]' : 'text-[#15241B]'}`}>
                  balance
                </span>
                <span className="font-sans text-2xl font-light tracking-tight bg-gradient-to-r from-[#F6C868] to-[#F0913C] bg-clip-text text-transparent font-extrabold">
                  ai
                </span>
              </div>
              <span className="font-mono text-[7px] tracking-[4px] sm:tracking-[5px] text-[#8A857B] leading-none uppercase whitespace-nowrap">
                EAT WELL · LIVE BRIGHT
              </span>
            </div>
          </div>
        </div>

        {/* PWA launcher banner */}
        <AnimatePresence>
          {isInstallable && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`border rounded-2xl p-4 flex gap-3.5 items-center justify-between shadow-sm ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}
            >
              <div className="flex gap-2.5 items-center">
                <div className="p-2 bg-[#1CA35A] rounded-xl text-white shrink-0">
                  <Download className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <h4 className="text-xs font-bold font-sans">Install balanceAI</h4>
                  <p className="text-[10px] font-mono opacity-60">Instant offline healthy dashboard</p>
                </div>
              </div>
              <button 
                onClick={triggerPwaInstallation}
                className="py-1.5 px-3 bg-[#1CA35A] text-white hover:opacity-90 font-mono text-[10px] font-bold rounded-lg border-0 cursor-pointer"
              >
                INSTALL
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header Greeting layout (Main Dashboard and History) */}
        {activeTab !== 'settings' && (
          <div className="flex justify-between items-start pt-1 px-1">
            <div className="text-left">
              <span className={`font-mono text-[10px] uppercase tracking-[1.6px] leading-none block mb-1 ${isDark ? "text-[#A8A49C]" : "text-[#5D6B60]"}`}>
                {formattedDay}
              </span>
              <h2 className={`font-display text-4xl font-extrabold tracking-tight uppercase leading-none ${isDark ? "text-[#F5F2EC]" : "text-[#15241B]"}`}>
                {user ? `GO FOR IT, ${user.displayName?.split(" ")[0] || "ATHLETE"}!` : "FUEL YOUR BODY"}
              </h2>
            </div>
            {usageStreak > 0 && (
              <div className="flex items-center gap-1.5 py-1 px-3 rounded-full bg-orange-500/10 border border-orange-500/20 text-[#FF7A1A] dark:text-[#FF9440]">
                <Flame className="w-3.5 h-3.5 fill-current" />
                <span className="font-mono text-[10px] font-bold tracking-wider">{usageStreak} DAY STREAK</span>
              </div>
            )}
          </div>
        )}

        {/* ==================== SCREEN 1: BALANCE ==================== */}
        {activeTab === 'balance' && (
          <div className="space-y-6">
            
            {/* SVG Activity Ring Centerpiece */}
            <BalanceRing 
              todayCalories={todayCalories}
              todayProtein={todayProtein}
              todayCarbs={todayCarbs}
              todayFat={todayFat}
              todayFiber={todayFiber}
              bodyWeight={bodyWeight}
              bodyHeight={bodyHeight}
              isDark={isDark}
            />

            {/* Macro percentages bars card */}
            <MacroBars 
              todayProtein={todayProtein}
              todayCarbs={todayCarbs}
              todayFat={todayFat}
              todayFiber={todayFiber}
              bodyWeight={bodyWeight}
              bodyHeight={bodyHeight}
              isDark={isDark}
            />

            {/* Meal Logger Form Card */}
            <div className={`border rounded-[20px] p-5 shadow-sm space-y-4 text-left transition-colors duration-300 ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#1CA35A] dark:bg-[#3ECF8E]" />
                <span className={`font-mono text-[9px] uppercase font-bold tracking-[1.6px] ${isDark ? "text-[#A8A49C]" : "text-[#5D6B60]"}`}>
                  LOG MEAL INSTANTLY
                </span>
              </div>

              <div className="space-y-3">
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Describe your meal (e.g., Grilled salmon with 1 avocado, half cup brown rice and fresh spinach salad...)"
                  rows={3}
                  className={`w-full p-3 border rounded-xl text-sm focus:outline-none focus:ring-1 transition-colors ${
                    isDark 
                      ? 'bg-[#141312] border-[#2C2A27] text-[#F5F2EC] placeholder-[#7A766E] focus:ring-[#FF9440] focus:border-[#FF9440]' 
                      : 'bg-[#F3F6F1] border-[#E4EAE2] text-[#15241B] placeholder-[#8B978D] focus:ring-[#FF7A1A] focus:border-[#FF7A1A]'
                  }`}
                />

                {/* Uploaded photo strip */}
                {imageInput && (
                  <div className="flex items-center gap-3 p-2 rounded-xl bg-orange-500/5 border border-orange-500/10">
                    <img src={imageInput} alt="preview" className="w-10 h-10 object-cover rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[10.5px] font-mono truncate font-bold uppercase text-[#FF7A1A] dark:text-[#FF9440]">
                        📸 MEAL PHOTO LOADED
                      </p>
                      <p className="text-[9.5px] opacity-60 font-mono">Ready to balance</p>
                    </div>
                    <button 
                      onClick={removeCapturedImage}
                      className="p-1 rounded-full text-red-500 hover:bg-red-500/10 border-0 bg-transparent cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Action buttons rows */}
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 border rounded-xl text-xs font-bold transition-all cursor-pointer bg-transparent ${
                      isDark 
                        ? 'border-[#2C2A27] text-[#A8A49C] hover:bg-[#2C2A27]' 
                        : 'border-[#E4EAE2] text-[#5D6B60] hover:bg-[#F3F6F1]'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>ADD PHOTO</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  <button
                    onClick={() => submitAnalyzeMeal()}
                    disabled={isLoading}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-white font-display font-extrabold uppercase tracking-wider text-xs rounded-xl cursor-pointer transition-all border-0 ${
                      isLoading ? 'bg-orange-500/50 cursor-not-allowed' : 'bg-[#FF7A1A] dark:bg-[#FF9440] hover:opacity-95 shadow-[0_4px_14px_rgba(255,122,26,0.35)]'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>BALANCING...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>ANALYZE & BALANCE</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Stage 2 Clarification dialog */}
              <AnimatePresence>
                {currentAnalysis && currentAnalysis.status === "clarification_needed" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t pt-4 mt-3 space-y-3"
                  >
                    <div className="p-3.5 rounded-xl border border-orange-500/20 bg-orange-500/5 space-y-2">
                      <div className="flex items-center gap-2 text-[#FF7A1A] dark:text-[#FF9440]">
                        <Info className="w-4 h-4" />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                          CLARIFICATION NEEDED FOR CALIBRATING TARGETS
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        {currentAnalysis.clarificationQuestions?.map((q, idx) => (
                          <div key={idx} className="space-y-1">
                            <label className="text-[10.5px] font-medium leading-normal block">
                              {q}
                            </label>
                            <input
                              type="text"
                              value={clarificationAnswers[q] || ""}
                              onChange={(e) => handleClarificationChange(q, e.target.value)}
                              placeholder="Describe briefly (e.g. 1 medium chicken breast, skinless)"
                              className={`w-full p-2.5 border rounded-lg text-xs focus:outline-none ${
                                isDark 
                                  ? 'bg-[#141312] border-[#2C2A27] text-[#F5F2EC] focus:ring-1 focus:ring-[#FF9440]' 
                                  : 'bg-[#F3F6F1] border-[#E4EAE2] text-[#15241B] focus:ring-1 focus:ring-[#FF7A1A]'
                              }`}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex gap-2">
                        <button
                          onClick={() => {
                            setCurrentAnalysis(null);
                            setClarificationAnswers({});
                          }}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-bold tracking-wider font-mono uppercase bg-transparent border cursor-pointer ${
                            isDark ? 'border-[#2C2A27] text-[#7A766E]' : 'border-[#E4EAE2] text-[#8B978D]'
                          }`}
                        >
                          RESET
                        </button>
                        <button
                          onClick={submitClarificationFeedback}
                          disabled={isLoading}
                          className="flex-1 py-2 bg-[#FF7A1A] dark:bg-[#FF9440] hover:opacity-95 text-white font-mono text-[10px] font-extrabold tracking-wider uppercase rounded-lg border-0 cursor-pointer"
                        >
                          SUBMIT ANSWER
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error strip */}
              {errorMessage && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="leading-tight text-left">{errorMessage}</p>
                </div>
              )}
            </div>

            {/* Activity Feed Title */}
            <div className="flex justify-between items-center px-1">
              <h3 className="font-display text-xl font-extrabold uppercase tracking-tight">
                TODAY'S ACTIVITY FEED
              </h3>
              <span className={`font-mono text-[10px] ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
                {todayLogs.length} MEALS RECORDED
              </span>
            </div>

            {/* List of today logs */}
            {todayLogs.length === 0 ? (
              <div className={`border rounded-[20px] p-8 text-center transition-colors duration-300 ${isDark ? 'bg-[#1E1C1A]/45 border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
                <Leaf className="w-8 h-8 mx-auto text-[#1CA35A] dark:text-[#3ECF8E] opacity-40 mb-2.5" />
                <h4 className="text-sm font-bold">READY FOR AN AMAZING MEAL?</h4>
                <p className={`text-[11px] max-w-xs mx-auto mt-1 ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
                  Log what you are eating to calculate your athletic Balance Score and unlock training notes!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {todayLogs.map((log) => (
                  <MealCard
                    key={log.id}
                    log={log}
                    onDelete={deleteHistoryLog}
                    onEdit={startEditingLog}
                    onCheer={handleCheer}
                    cheersCount={cheers[log.id] || 0}
                    isDark={isDark}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== SCREEN 2: HISTORY ==================== */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            
            {/* 7-day Calorie bar chart */}
            <CalorieChart pastLogs={pastLogs} isDark={isDark} />

            {/* Quick stats grid */}
            <div className={`border rounded-[20px] p-5 shadow-sm grid grid-cols-3 gap-2 text-center transition-colors duration-300 ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
              <div>
                <span className={`text-[8.5px] font-mono tracking-wider uppercase block ${isDark ? 'text-[#7A766E]' : 'text-[#8B978D]'}`}>
                  AVG SCORE
                </span>
                <span className="text-xl font-extrabold font-display leading-tight block mt-1">
                  {pastLogs.length > 0 
                    ? Math.round(pastLogs.reduce((acc, log) => {
                        const p = log.protein || 0;
                        const c = log.carbs || 0;
                        const f = log.fat || 0;
                        const b = log.fiber !== undefined ? log.fiber : Math.round(c * 0.1);
                        const total = p + c + f;
                        if (total === 0) return acc;
                        const pS = Math.max(0, 100 - Math.abs(p/total - 0.25) * 200);
                        const cS = Math.max(0, 100 - Math.abs(c/total - 0.45) * 200);
                        const fS = Math.max(0, 100 - Math.abs(f/total - 0.30) * 200);
                        return acc + Math.round((pS + cS + fS) / 3) + Math.min(30, b * 10);
                      }, 0) / pastLogs.length)
                    : 0} pts
                </span>
              </div>
              <div className={`border-x ${isDark ? "border-[#2C2A27]" : "border-[#E4EAE2]"}`}>
                <span className={`text-[8.5px] font-mono tracking-wider uppercase block ${isDark ? 'text-[#7A766E]' : 'text-[#8B978D]'}`}>
                  DAYS TRACKED
                </span>
                <span className="text-xl font-extrabold font-display leading-tight block mt-1">
                  {daysTrackedCount} DAYS
                </span>
              </div>
              <div>
                <span className={`text-[8.5px] font-mono tracking-wider uppercase block ${isDark ? 'text-[#7A766E]' : 'text-[#8B978D]'}`}>
                  MEALS RECORDED
                </span>
                <span className="text-xl font-extrabold font-display leading-tight block mt-1">
                  {pastLogs.length} LOGS
                </span>
              </div>
            </div>

            {/* Milestones Card */}
            <div className="rounded-[20px] p-5 text-left bg-gradient-to-r from-[#1CA35A] to-[#128043] text-white space-y-2 shadow-sm">
              <div className="flex items-center gap-1.5">
                <Leaf className="w-4 h-4 text-white fill-current" />
                <span className="font-mono text-[9px] font-extrabold tracking-[1.6px]">🏅 WEEKLY ATHLETIC TRIBUTE</span>
              </div>
              <h4 className="text-sm font-extrabold">FIBER BASELINE SURPASSED</h4>
              <p className="text-[11.5px] leading-relaxed opacity-90 font-medium">
                You logged {daysTrackedCount >= 3 ? "3+" : "your first"} metabolic fiber targets this week. This supports gut speed and lowers athletic energy recovery friction!
              </p>
            </div>

            {/* Search filter input */}
            <div className="space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search meal logs..."
                  className={`w-full p-3 pl-10 pr-10 border rounded-xl text-sm focus:outline-none ${
                    isDark 
                      ? 'bg-[#1E1C1A] border-[#2C2A27] text-[#F5F2EC] placeholder-[#7A766E] focus:ring-1 focus:ring-[#FF9440]' 
                      : 'bg-white border-[#E4EAE2] text-[#15241B] placeholder-[#8B978D] focus:ring-1 focus:ring-[#FF7A1A]'
                  }`}
                />
                <span className="absolute left-3.5 top-3.5 opacity-50 text-xs font-mono">
                  🔍
                </span>
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")} 
                    className="absolute right-3.5 top-3 text-[#8B978D] hover:text-red-500 bg-transparent border-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* List of past filtered logs */}
              {filteredLogs.length === 0 ? (
                <div className={`border rounded-[20px] p-8 text-center transition-colors duration-300 ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
                  <h4 className="text-sm font-bold">NO MATCHING MEALS FOUND</h4>
                  <p className={`text-[11px] mt-1 ${isDark ? "text-[#7A766E]" : "text-[#8B978D]"}`}>
                    Try refining your search keyword to locate historic balanced meals.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredLogs.map((log) => {
                    if (editingLogId === log.id) {
                      return (
                        <div 
                          key={log.id} 
                          className={`border rounded-[20px] p-5 shadow-sm text-left space-y-4 transition-colors duration-300 ${
                            isDark ? 'bg-[#1E1C1A] border-[#FF9440]/30' : 'bg-white border-[#FF7A1A]/30'
                          }`}
                        >
                          <div className="flex justify-between items-center border-b pb-2 border-dashed">
                            <span className="text-[10px] font-bold font-mono tracking-wider text-[#FF7A1A] dark:text-[#FF9440] uppercase">
                              ✏️ EDIT MEAL RECORD
                            </span>
                            <button 
                              onClick={() => setEditingLogId(null)}
                              className="text-[10px] text-red-500 font-mono uppercase bg-transparent border-0 cursor-pointer font-bold"
                            >
                              Cancel
                            </button>
                          </div>

                          <div className="space-y-3.5 text-xs">
                            <div className="space-y-1">
                              <label className="text-[9px] font-mono tracking-wider font-bold block">MEAL NAME</label>
                              <input 
                                type="text"
                                value={editName} 
                                onChange={e => setEditName(e.target.value)} 
                                className={`w-full p-2.5 border rounded-lg text-xs focus:outline-none ${isDark ? 'bg-[#141312] border-[#2C2A27] text-[#F5F2EC]' : 'bg-[#F3F6F1] border-[#E4EAE2]'}`}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] font-mono tracking-wider font-bold block">DATE</label>
                                <input 
                                  type="date" 
                                  value={tempEditDate} 
                                  onChange={e => setTempEditDate(e.target.value)} 
                                  className={`w-full p-2.5 border rounded-lg text-xs focus:outline-none ${isDark ? 'bg-[#141312] border-[#2C2A27]' : 'bg-[#F3F6F1]'}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-mono tracking-wider font-bold block">TIME</label>
                                <input 
                                  type="time" 
                                  value={tempEditTime} 
                                  onChange={e => setTempEditTime(e.target.value)} 
                                  className={`w-full p-2.5 border rounded-lg text-xs focus:outline-none ${isDark ? 'bg-[#141312] border-[#2C2A27]' : 'bg-[#F3F6F1]'}`}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-[10px]">
                              <div>
                                <label className="block mb-0.5 opacity-60">KCAL</label>
                                <input 
                                  type="number" 
                                  value={editCalories} 
                                  onChange={e => setEditCalories(Number(e.target.value))} 
                                  className={`w-full p-2 text-center border rounded-lg focus:outline-none ${isDark ? 'bg-[#141312] border-[#2C2A27]' : 'bg-[#F3F6F1]'}`}
                                />
                              </div>
                              <div>
                                <label className="block mb-0.5 opacity-60">PROT(g)</label>
                                <input 
                                  type="number" 
                                  value={editProtein} 
                                  onChange={e => setEditProtein(Number(e.target.value))} 
                                  className={`w-full p-2 text-center border rounded-lg focus:outline-none ${isDark ? 'bg-[#141312] border-[#2C2A27]' : 'bg-[#F3F6F1]'}`}
                                />
                              </div>
                              <div>
                                <label className="block mb-0.5 opacity-60">CARB(g)</label>
                                <input 
                                  type="number" 
                                  value={editCarbs} 
                                  onChange={e => setEditCarbs(Number(e.target.value))} 
                                  className={`w-full p-2 text-center border rounded-lg focus:outline-none ${isDark ? 'bg-[#141312] border-[#2C2A27]' : 'bg-[#F3F6F1]'}`}
                                />
                              </div>
                              <div>
                                <label className="block mb-0.5 opacity-60">FAT(g)</label>
                                <input 
                                  type="number" 
                                  value={editFat} 
                                  onChange={e => setEditFat(Number(e.target.value))} 
                                  className={`w-full p-2 text-center border rounded-lg focus:outline-none ${isDark ? 'bg-[#141312] border-[#2C2A27]' : 'bg-[#F3F6F1]'}`}
                                />
                              </div>
                              <div>
                                <label className="block mb-0.5 opacity-60">FIB(g)</label>
                                <input 
                                  type="number" 
                                  value={editFiber} 
                                  onChange={e => setEditFiber(Number(e.target.value))} 
                                  className={`w-full p-2 text-center border rounded-lg focus:outline-none ${isDark ? 'bg-[#141312] border-[#2C2A27]' : 'bg-[#F3F6F1]'}`}
                                />
                              </div>
                            </div>

                            <button 
                              onClick={saveEditedLog}
                              className="w-full py-3 bg-[#1CA35A] dark:bg-[#3ECF8E] text-white hover:opacity-95 font-mono text-xs font-bold rounded-xl cursor-pointer border-0 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                            >
                              <Save className="w-4 h-4" />
                              <span>SAVE EDITED METRICS</span>
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <MealCard
                        key={log.id}
                        log={log}
                        onDelete={deleteHistoryLog}
                        onEdit={startEditingLog}
                        onCheer={handleCheer}
                        cheersCount={cheers[log.id] || 0}
                        isDark={isDark}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== SCREEN 3: SETTINGS ==================== */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            
            {/* User Profile Card */}
            <div className={`border rounded-[20px] p-5 shadow-sm text-left transition-colors duration-300 ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
              {user ? (
                <div className="flex justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="avatar" className="w-12 h-12 rounded-xl" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#1CA35A] text-white flex items-center justify-center font-display font-extrabold text-xl">
                        {user.displayName?.charAt(0) || "U"}
                      </div>
                    )}
                    <div>
                      <h4 className="text-sm font-extrabold leading-tight">
                        {user.displayName || "Supporter Athlete"}
                      </h4>
                      <p className={`text-[10px] font-mono leading-none mt-1 ${isDark ? 'text-[#7A766E]' : 'text-[#8B978D]'}`}>
                        {user.email || "supporter@balanceai.org"}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="p-2 border rounded-xl hover:bg-red-500/10 hover:border-red-500/20 text-red-500 bg-transparent cursor-pointer transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-sm font-extrabold">SYNC YOUR BALANCES ONLINE</h4>
                  <p className={`text-[11px] leading-relaxed ${isDark ? 'text-[#7A766E]' : 'text-[#8B978D]'}`}>
                    Create an account to synchronize daily streaks, customized macros, and metabolic reports safely across multiple devices.
                  </p>
                  <button
                    onClick={handleLogin}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#1CA35A] dark:bg-[#3ECF8E] text-white font-sans text-xs font-bold rounded-xl border-0 cursor-pointer active:scale-95 transition-all shadow-sm"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>SIGN IN WITH GOOGLE</span>
                  </button>
                </div>
              )}
            </div>

            {/* Fused User Personalization Section */}
            <div className={`border rounded-[20px] p-5 shadow-sm text-left space-y-5 transition-colors duration-300 ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#1CA35A] dark:text-[#3ECF8E]" />
                <span className={`font-mono text-[9px] uppercase font-bold tracking-[1.6px] ${isDark ? "text-[#A8A49C]" : "text-[#5D6B60]"}`}>
                  USER PERSONALIZATION
                </span>
              </div>

              {/* Side-by-side Weight and Height Steppers */}
              <div className="grid grid-cols-2 gap-3">
                {/* Body weight stepper */}
                <div className="space-y-1.5">
                  <span className={`text-[8px] font-mono tracking-wider font-bold block ${isDark ? 'text-[#A8A49C]' : 'text-[#5D6B60]'}`}>
                    METRIC WEIGHT
                  </span>
                  
                  <div className="flex items-center justify-between gap-1 py-1 px-2 rounded-xl border border-[#2C2A27]/10 dark:border-[#2C2A27]/40 bg-[#2C2A27]/5">
                    <button 
                      onClick={() => handleWeightChange(bodyWeight - 1)}
                      className="w-7 h-7 rounded-lg border-0 bg-transparent hover:bg-orange-500/10 hover:text-[#FF7A1A] cursor-pointer text-sm font-extrabold flex items-center justify-center transition-colors"
                    >
                      −
                    </button>
                    <span className="font-display text-base font-extrabold tracking-tight">
                      {bodyWeight}<span className="text-[9px] font-mono font-bold opacity-60 ml-0.5">KG</span>
                    </span>
                    <button 
                      onClick={() => handleWeightChange(bodyWeight + 1)}
                      className="w-7 h-7 rounded-lg border-0 bg-transparent hover:bg-orange-500/10 hover:text-[#FF7A1A] cursor-pointer text-sm font-extrabold flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Body height stepper */}
                <div className="space-y-1.5">
                  <span className={`text-[8px] font-mono tracking-wider font-bold block ${isDark ? 'text-[#A8A49C]' : 'text-[#5D6B60]'}`}>
                    METRIC HEIGHT
                  </span>
                  
                  <div className="flex items-center justify-between gap-1 py-1 px-2 rounded-xl border border-[#2C2A27]/10 dark:border-[#2C2A27]/40 bg-[#2C2A27]/5">
                    <button 
                      onClick={() => handleHeightChange(bodyHeight - 1)}
                      className="w-7 h-7 rounded-lg border-0 bg-transparent hover:bg-orange-500/10 hover:text-[#FF7A1A] cursor-pointer text-sm font-extrabold flex items-center justify-center transition-colors"
                    >
                      −
                    </button>
                    <span className="font-display text-base font-extrabold tracking-tight">
                      {bodyHeight}<span className="text-[9px] font-mono font-bold opacity-60 ml-0.5">CM</span>
                    </span>
                    <button 
                      onClick={() => handleHeightChange(bodyHeight + 1)}
                      className="w-7 h-7 rounded-lg border-0 bg-transparent hover:bg-orange-500/10 hover:text-[#FF7A1A] cursor-pointer text-sm font-extrabold flex items-center justify-center transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Diet preferences pills */}
              <div className="space-y-2">
                <span className={`text-[9px] font-mono tracking-wider font-bold block ${isDark ? 'text-[#A8A49C]' : 'text-[#5D6B60]'}`}>
                  DIETARY ALIGNMENT PREFERENCE
                </span>
                
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {diets.map((d) => {
                    const isSelected = dietType === d.value;
                    return (
                      <button
                        key={d.value}
                        onClick={() => handleDietClick(d.value)}
                        className={`py-1.5 px-3 rounded-full text-[10px] font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-[#1CA35A] border-[#1CA35A] text-white"
                            : isDark
                            ? "bg-transparent border-[#2C2A27] text-[#A8A49C] hover:border-[#7A766E]"
                            : "bg-transparent border-[#E4EAE2] text-[#5D6B60] hover:border-[#8B978D]"
                        }`}
                      >
                        {d.label.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                {dietType && (
                  <span className={`text-[10px] block mt-1.5 text-[#1CA35A] dark:text-[#3ECF8E] font-medium uppercase`}>
                    Active preference filter: <span className="font-bold">{dietType}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Sliding daylight theme toggle switch */}
            <div className={`border rounded-[20px] p-5 shadow-sm text-left space-y-3.5 transition-colors duration-300 ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
              <div className="flex justify-between items-center">
                <div className="flex flex-col text-left">
                  <span className={`font-mono text-[9px] uppercase font-bold tracking-[1.6px] ${isDark ? "text-[#A8A49C]" : "text-[#5D6B60]"}`}>
                    UI VISUAL THEME MODE
                  </span>
                  <span className={`text-[10.5px] font-medium leading-none mt-1 opacity-60`}>
                    {isDark ? "EVENING COLD SYSTEM ACTIVE" : "DAYLIGHT ATHLETIC ACTIVE"}
                  </span>
                </div>

                {/* Sliding Knob toggle pill */}
                <div 
                  onClick={toggleTheme}
                  className={`w-14 h-8 rounded-full relative cursor-pointer p-1 transition-all ${isDark ? 'bg-[#FF9440]/25 border border-[#FF9440]/40' : 'bg-[#1CA35A]/10 border border-[#1CA35A]/35'}`}
                >
                  <div 
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 transform shadow-md ${isDark ? 'translate-x-6 bg-[#FF9440] text-white' : 'translate-x-0 bg-[#1CA35A] text-white'}`}
                  >
                    {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                  </div>
                </div>
              </div>
            </div>

            {/* Buy coffee Stripe Donation Card */}
            <div className={`border rounded-[20px] p-5 shadow-sm text-left space-y-4 transition-colors duration-300 ${isDark ? 'bg-[#1E1C1A] border-[#2C2A27]' : 'bg-white border-[#E4EAE2]'}`}>
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-[#FF7A1A] dark:text-[#FF9440]" />
                <span className={`font-mono text-[9px] uppercase font-bold tracking-[1.6px] text-[#FF7A1A] dark:text-[#FF9440]`}>
                  BUY THE DEVELOPER A COFFEE
                </span>
              </div>

              <p className={`text-xs leading-relaxed ${isDark ? 'text-[#A8A49C]' : 'text-[#5D6B60]'}`}>
                If you enjoy using this app, please buy the developer a coffee to support continued health innovation and keep using the app forever!
              </p>

              <div className="pt-1">
                <button
                  onClick={handleBuyMeACoffee}
                  disabled={isCoffeeLoading}
                  className="w-full py-3 bg-[#FF7A1A] dark:bg-[#FF9440] text-white hover:opacity-95 text-xs font-display font-extrabold uppercase tracking-wider rounded-xl cursor-pointer border-0 shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  {isCoffeeLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Coffee className="w-4 h-4" />
                  )}
                  <span>BUY COFFEE</span>
                </button>
              </div>

              {/* Dev resets */}
              <div className="border-t pt-3 border-dashed flex justify-between items-center">
                <span className={`text-[9px] font-mono uppercase tracking-wider block ${isDark ? 'text-[#7A766E]' : 'text-[#8B978D]'}`}>
                  DEV Reset Tool
                </span>
                <button
                  onClick={() => {
                    setHasDonated(false);
                    localStorage.removeItem("mindful_flow_has_donated");
                    setDonationSuccessMessage(null);
                  }}
                  className="py-1 px-2.5 border border-[#2C2A27]/20 rounded-md text-[8.5px] font-mono hover:text-red-500 hover:border-red-500 bg-transparent cursor-pointer"
                >
                  RESET COFFEE SUPPORTER
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Footer trademark */}
        <footer className="pt-2 pb-6 text-center font-mono text-[9px] opacity-45 uppercase tracking-[1.6px]">
          BALANCEAI · MADE WITH ⚡ FOR CHAMPIONS
        </footer>

      </main>

      {/* Floating Pill Sticky Bottom Navigation Tab Bar (Glassy, backdrop blur, inset 16px) */}
      <nav 
        id="floating-navigation-bar"
        className={`fixed bottom-4 left-4 right-4 max-w-md mx-auto rounded-full border px-5 py-2.5 shadow-xl flex justify-between items-center z-50 backdrop-blur-md transition-all duration-300 ${
          isDark 
            ? 'bg-[#1E1C1A]/90 border-[#2C2A27]/80 text-[#A8A49C]' 
            : 'bg-[#FFFFFF]/90 border-[#E4EAE2]/80 text-[#5D6B60]'
        }`}
      >
        <button
          onClick={() => setActiveTab('balance')}
          className={`flex flex-col items-center gap-0.5 flex-1 py-1 bg-transparent border-0 cursor-pointer transition-colors ${
            activeTab === 'balance' 
              ? 'text-[#1CA35A] dark:text-[#3ECF8E] font-bold' 
              : 'hover:text-[#1CA35A]/80 dark:hover:text-[#3ECF8E]/80'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span className="text-[9px] font-mono uppercase font-bold tracking-[1px] leading-none mt-0.5">Balance</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-0.5 flex-1 py-1 bg-transparent border-0 cursor-pointer transition-colors ${
            activeTab === 'history' 
              ? 'text-[#1CA35A] dark:text-[#3ECF8E] font-bold' 
              : 'hover:text-[#1CA35A]/80 dark:hover:text-[#3ECF8E]/80'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span className="text-[9px] font-mono uppercase font-bold tracking-[1px] leading-none mt-0.5">History</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-0.5 flex-1 py-1 bg-transparent border-0 cursor-pointer transition-colors ${
            activeTab === 'settings' 
              ? 'text-[#1CA35A] dark:text-[#3ECF8E] font-bold' 
              : 'hover:text-[#1CA35A]/80 dark:hover:text-[#3ECF8E]/80'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span className="text-[9px] font-mono uppercase font-bold tracking-[1px] leading-none mt-0.5">Settings</span>
        </button>
      </nav>

      {/* Celebration donation success toast overlay */}
      <AnimatePresence>
        {donationSuccessMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-sm rounded-[20px] p-6 shadow-2xl border text-left space-y-4 ${
                isDark ? "bg-[#1E1C1A] border-[#2C2A27] text-[#F5F2EC]" : "bg-white border-[#E4EAE2] text-[#15241B]"
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-[#FF7A1A]">
                  <Heart className="w-5 h-5 fill-current" />
                </div>
                <button 
                  onClick={() => setDonationSuccessMessage(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer border-0 bg-transparent"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-sm font-display font-extrabold uppercase tracking-tight">
                  SUPPORT REGISTERED! ☕💖
                </h3>
                <p className="text-xs leading-relaxed opacity-85">
                  {donationSuccessMessage}
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setDonationSuccessMessage(null)}
                  className="w-full py-3 text-xs font-display font-extrabold uppercase tracking-wider text-white rounded-xl bg-[#FF7A1A] dark:bg-[#FF9440] hover:opacity-95 transition shadow-sm border-0 active:scale-95 cursor-pointer"
                >
                  KEEP ACTIVE FOREVER
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
