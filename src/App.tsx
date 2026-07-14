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
  if (obj === undefined) {
    return null;
  }
  if (obj === null) {
    return null;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForFirestore(item));
  }
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) {
        continue;
      }
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
    whatToDo = parts[0]
      .replace(/✅|\bCAN DO\b|\bWHAT TO DO\b|[\*:]/gi, "")
      .trim();
    whatNotToDo = parts[1]
      .replace(/[\*:]/g, "")
      .trim();
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
  
  if (lowerName.includes("breakfast") || lowerName.includes("morning")) {
    return "Breakfast";
  }
  if (lowerName.includes("lunch") || lowerName.includes("midday")) {
    return "Lunch";
  }
  if (lowerName.includes("afternoon snack")) {
    return "Afternoon Snack";
  }
  if (lowerName.includes("late night")) {
    return "Late Night Snack";
  }
  if (lowerName.includes("dinner") || lowerName.includes("supper")) {
    return "Dinner";
  }
  if (lowerName.includes("snack")) {
    if (hour >= 5 && hour < 11) return "Breakfast";
    if (hour >= 11 && hour < 15) return "Lunch";
    if (hour >= 15 && hour < 18) return "Afternoon Snack";
    if (hour >= 18 && hour < 22) return "Dinner";
    return "Late Night Snack";
  }

  // Fallback to time-based
  if (hour >= 5 && hour < 11) return "Breakfast";
  if (hour >= 11 && hour < 15) return "Lunch";
  if (hour >= 15 && hour < 18) return "Afternoon Snack";
  if (hour >= 18 && hour < 22) return "Dinner";
  return "Late Night Snack";
};

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

  // Dual-mode Unified Auth state variables
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [profileFetched, setProfileFetched] = useState(false);

  // Personalized Diet Type indicating text (Vegetarian, vegan, etc.)
  const [dietType, setDietType] = useState<string>(() => {
    return localStorage.getItem("mindful_flow_diet_type") || "";
  });

  // Body weight state in kilograms to dynamically calculate protein target (1g protein per kg of bodyweight)
  const [bodyWeight, setBodyWeight] = useState<number>(() => {
    const cached = localStorage.getItem("mindful_flow_body_weight");
    return cached ? Number(cached) : 70;
  });

  // Log Records Editing Fields State
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCalories, setEditCalories] = useState<number>(0);
  const [editProtein, setEditProtein] = useState<number>(0);
  const [editCarbs, setEditCarbs] = useState<number>(0);
  const [editFat, setEditFat] = useState<number>(0);
  const [editFiber, setEditFiber] = useState<number>(0);
  const [tempEditDate, setTempEditDate] = useState("");
  const [tempEditTime, setTempEditTime] = useState("");

  // Cloud Sync state
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'failed' | 'offline'>('syncing');

  // Interactive installable PWA events
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  // States for active analysis results within current session
  const [currentAnalysis, setCurrentAnalysis] = useState<MealAnalysisResponse | null>(null);
  
  // States for clarification flow
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});

  // Dynamic filter for historical logs list
  const [searchQuery, setSearchQuery] = useState("");

  // Saved Logs (Source of Truth - loads instantly for offline-first resilience)
  const [pastLogs, setPastLogs] = useState<MealLog[]>(() => {
    try {
      const lastUid = localStorage.getItem("mindful_flow_last_uid");
      if (lastUid) {
        const cached = localStorage.getItem(`mindful_flow_logs_${lastUid}`);
        if (cached) {
          return JSON.parse(cached);
        }
      }
      const guestData = localStorage.getItem("mindful_flow_logs");
      if (guestData) {
        return JSON.parse(guestData);
      }
    } catch (e) {
      console.warn("Initial state logs load error: ", e);
    }
    return [];
  });

  // Navigation and detail expansion states
  const [activeTab, setActiveTab] = useState<"balance" | "history" | "settings">("balance");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Track Theme changes
  useEffect(() => {
    localStorage.setItem("mindful_flow_theme", themeMode);
  }, [themeMode]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecking(false);
      setProfileFetched(false); // Reset profileFetched on login state change
    });
    return unsubscribe;
  }, []);

  // Save diet preference updates to database / localStorage
  useEffect(() => {
    localStorage.setItem("mindful_flow_diet_type", dietType);
    if (user && profileFetched) {
      setDoc(doc(db, "users", user.uid, "profile", "settings"), { dietType }, { merge: true })
        .catch(e => console.error("Could not upload settings to Cloud:", e));
    }
  }, [dietType, user, profileFetched]);

  // Save body weight updates to database / localStorage
  useEffect(() => {
    localStorage.setItem("mindful_flow_body_weight", String(bodyWeight));
    if (user && profileFetched) {
      setDoc(doc(db, "users", user.uid, "profile", "settings"), { bodyWeight }, { merge: true })
        .catch(e => console.error("Could not upload weight setting to Cloud:", e));
    }
  }, [bodyWeight, user, profileFetched]);

  // Handle log loadings on login state toggles
  useEffect(() => {
    const fetchLogsAndProfile = async () => {
      setSyncStatus("syncing");
      if (user) {
        // Track last signed-in user UID to instantly restore state on subsequent hard refresh / reload
        localStorage.setItem("mindful_flow_last_uid", user.uid);

        // Immediately load locally cached logs for this specific user if they exist to avoid flashes of empty state
        const cachedUserLogs = localStorage.getItem(`mindful_flow_logs_${user.uid}`);
        let initialUserLogs: MealLog[] = [];
        if (cachedUserLogs) {
          try {
            initialUserLogs = JSON.parse(cachedUserLogs);
            setPastLogs(initialUserLogs);
          } catch (e) {
            console.warn("Failed to parse user local cached logs:", e);
          }
        }

        // Check if there are any guest logs written during offline/logout session that need saving to the cloud
        try {
          const guestLogsStr = localStorage.getItem("mindful_flow_logs");
          if (guestLogsStr) {
            const guestLogs = JSON.parse(guestLogsStr);
            if (Array.isArray(guestLogs) && guestLogs.length > 0) {
              console.log(`Migrating ${guestLogs.length} guest logs to cloud for uid: ${user.uid}`);
              const batch = writeBatch(db);
              guestLogs.forEach((log: any) => {
                const docRef = doc(db, "users", user.uid, "logs", log.id);
                batch.set(docRef, cleanForFirestore(log));
                
                // Merge into current active user's initial logs list
                if (!initialUserLogs.some(l => l.id === log.id)) {
                  initialUserLogs.unshift(log);
                }
              });
              await batch.commit();

              // Clean guest state and save merged list to user local cache
              localStorage.removeItem("mindful_flow_logs");
              
              // Sort descendingly by date safely
              initialUserLogs.sort((a, b) => {
                const timeA = a.epochTime || (a.dateStr ? new Date(a.dateStr).getTime() : 0) || 0;
                const timeB = b.epochTime || (b.dateStr ? new Date(b.dateStr).getTime() : 0) || 0;
                return timeB - timeA;
              });
              
              setPastLogs(initialUserLogs);
              localStorage.setItem(`mindful_flow_logs_${user.uid}`, JSON.stringify(initialUserLogs));
              console.log("Guest logs successfully migrated to cloud.");
            }
          }
        } catch (e) {
          console.warn("Could not migrate guest offline logs to cloud:", e);
        }

        try {
          // 1. Fetch Diet Preference from Firestore Profile
          try {
            const profilePath = `users/${user.uid}/profile`;
            let snap;
            try {
              snap = await getDocs(query(collection(db, "users", user.uid, "profile")));
            } catch (e) {
              handleFirestoreError(e, OperationType.LIST, profilePath);
            }
            if (snap) {
              snap.forEach((doc) => {
                if (doc.id === "settings") {
                  const dat = doc.data();
                  if (dat.dietType !== undefined) {
                    setDietType(dat.dietType);
                  }
                  if (dat.bodyWeight !== undefined) {
                    setBodyWeight(Number(dat.bodyWeight));
                  }
                }
              });
            }
          } catch(err) {
            console.warn("Could not retrieve profile from Cloud (using local profile instead):", err);
          } finally {
            setProfileFetched(true);
          }

          // 2. Fetch Meal Logs
          const logsPath = `users/${user.uid}/logs`;
          const q = query(collection(db, "users", user.uid, "logs"));
          let logsSnap;
          try {
            logsSnap = await getDocs(q);
          } catch (e) {
            handleFirestoreError(e, OperationType.LIST, logsPath);
          }
          const logsList: MealLog[] = [];
          if (logsSnap) {
            logsSnap.forEach((doc) => {
              logsList.push({ id: doc.id, ...doc.data() } as MealLog);
            });
          }

          // Merge safely: target cloud logs first, but merge in any offline-cached logs that haven't hit the cloud
          const mergedLogs = [...logsList];
          initialUserLogs.forEach(localLog => {
            if (!mergedLogs.some(l => l.id === localLog.id)) {
              mergedLogs.push(localLog);
            }
          });

          // Sort descendingly by date safely
          mergedLogs.sort((a, b) => {
            const timeA = a.epochTime || (a.dateStr ? new Date(a.dateStr).getTime() : 0) || 0;
            const timeB = b.epochTime || (b.dateStr ? new Date(b.dateStr).getTime() : 0) || 0;
            return timeB - timeA;
          });

          setPastLogs(mergedLogs);
          try {
            localStorage.setItem(`mindful_flow_logs_${user.uid}`, JSON.stringify(mergedLogs));
          } catch (e) {
            console.warn("Failed to save cloud logs to user local cache:", e);
          }
          setSyncStatus("synced");
        } catch (err) {
          console.error("Failed to synchronize logs from cloud:", err);
          // If we have cached logs, keep/restore them and set status to offline instead of showing an empty screen
          if (cachedUserLogs) {
            try {
              setPastLogs(JSON.parse(cachedUserLogs));
              setSyncStatus("offline");
              return;
            } catch (e) {}
          }
          setSyncStatus("failed");
        }
      } else {
        // Guest offline-first local storage or fallback to last-active user cached logs
        try {
          const localData = localStorage.getItem("mindful_flow_logs");
          if (localData) {
            const parsed = JSON.parse(localData);
            setPastLogs(parsed);
          } else {
            const lastUid = localStorage.getItem("mindful_flow_last_uid");
            if (lastUid) {
              const userCached = localStorage.getItem(`mindful_flow_logs_${lastUid}`);
              if (userCached) {
                setPastLogs(JSON.parse(userCached));
              } else {
                setPastLogs([]);
              }
            } else {
              setPastLogs([]);
            }
          }
          setSyncStatus("offline");
        } catch (e) {
          console.warn("Could not parse offline-first local logs: ", e);
        }
      }
    };

    if (!authChecking) {
      fetchLogsAndProfile();
    }
  }, [user, authChecking]);

  // Listen for PWA installation possibility
  useEffect(() => {
    const handleBeforePrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforePrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforePrompt);
    };
  }, []);

  const triggerPwaInstallation = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA prompt install decision: ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read upload photo file as base64 string
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("To ensure fast analysis, uploads must be under 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImageInput(reader.result as string);
      setErrorMessage(null);
    };
    reader.onerror = () => {
      setErrorMessage("Could not parse image. Please take another shot.");
    };
    reader.readAsDataURL(file);
  };

  const removeCapturedImage = () => {
    setImageInput(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Triggers main server request & cloud synchronization
  const submitAnalyzeMeal = async (answersOverride?: Record<string, string>) => {
    if (!textInput.trim() && !imageInput) {
      setErrorMessage("Please type what you ate or snap a picture of your plate.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Calculate today's logged macros to balance next intake recommendations
      const todayLogs = pastLogs.filter(log => {
        if (log.dateStr) {
          return log.dateStr === new Date().toDateString();
        }
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
        if (name.includes("salad") || name.includes("garden") || name.includes("berry") || name.includes("spinach") || name.includes("greens") || name.includes("avocado") || name.includes("oat")) {
          return acc + 6;
        }
        return acc + 2;
      }, 0);

      const payload: any = {
        textInput: textInput,
        imageInput: imageInput,
        localHour: new Date().getHours(), // Get client local hour
        dietType: dietType,
        bodyWeight: bodyWeight,
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

      // Append answers if resolving a clarification session
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
        throw new Error("Our virtual dietitian is currently busy. Please try processing in a few seconds.");
      }

      const data: MealAnalysisResponse = await res.json();
      
      if (data.status === "success") {
        setCurrentAnalysis(null); // Reset session configs
        setClarificationAnswers({});
        setTextInput("");
        setImageInput(null);
        if (fileInputRef.current) fileInputRef.current.value = "";

        // Add to historical logs array
        if (data.mealAnalysis && data.insights) {
          const cleanName = data.mealAnalysis.name.toLowerCase().trim();
          const cleanInput = textInput.toLowerCase().trim();
          
          // Find the most recent matching log in history to learn custom macros (only from user-edited corrections)
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
            // Check if there is deviation between what Gemini estimates and what the user saved/customized in history
            const hasDeviation = 
              Math.abs((matchedPrevLog.calories || 0) - (data.mealAnalysis.calories || 0)) > 1 ||
              Math.abs((matchedPrevLog.protein || 0) - (data.mealAnalysis.protein || 0)) > 0.5 ||
              Math.abs((matchedPrevLog.carbs || 0) - (data.mealAnalysis.carbs || 0)) > 0.5 ||
              Math.abs((matchedPrevLog.fat || 0) - (data.mealAnalysis.fat || 0)) > 0.5;

            if (hasDeviation) {
              // Only in case of deviation, use the user's historical customized input
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
            isLearned: isLearned
          };

          const updatedLogs = [newLog, ...pastLogs];
          setPastLogs(updatedLogs);

          // Background sync to persistent database
          await saveLogToDb(newLog);

          // Jump viewport right to current results card
          setTimeout(() => {
            document.getElementById("latest-result")?.scrollIntoView({ behavior: "smooth" });
          }, 150);
        }
      } else {
        // Clarification is requested
        setCurrentAnalysis(data);
        // Pre-initialize answer values
        const initialAnswers: Record<string, string> = {};
        data.clarificationQuestions?.forEach(q => {
          initialAnswers[q] = "";
        });
        setClarificationAnswers(initialAnswers);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Something went wrong. Let's try again!");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClarificationChange = (question: string, value: string) => {
    setClarificationAnswers(prev => ({
      ...prev,
      [question]: value,
    }));
  };

  const submitClarificationFeedback = () => {
    // Basic validation to confirm user did answer something
    const answeredCount = Object.values(clarificationAnswers).filter((v: string) => v.trim()).length;
    if (answeredCount === 0) {
      setErrorMessage("Could you write a brief answer to at least one query?");
      return;
    }
    submitAnalyzeMeal(clarificationAnswers);
  };

  // Dual-mode database operations helpers
  const saveLogToDb = async (logToSave: MealLog) => {
    setSyncStatus("syncing");
    if (user) {
      // Optimistically write to user local cache first so it is preserved immediately
      try {
        const cachedUserLogs = localStorage.getItem(`mindful_flow_logs_${user.uid}`);
        let parsed: MealLog[] = cachedUserLogs ? JSON.parse(cachedUserLogs) : [];
        parsed = parsed.filter(l => l.id !== logToSave.id);
        parsed.unshift(logToSave);
        localStorage.setItem(`mindful_flow_logs_${user.uid}`, JSON.stringify(parsed));
      } catch (e) {
        console.warn("Could not write user logs cache:", e);
      }

      try {
        await setDoc(doc(db, "users", user.uid, "logs", logToSave.id), cleanForFirestore(logToSave));
        setSyncStatus("synced");
      } catch (e) {
        console.error("Firestore save error:", e);
        // Fall back to offline status to inform user they are locally synchronized
        setSyncStatus("offline");
      }
    } else {
      // Guest mode
      try {
        const localData = localStorage.getItem("mindful_flow_logs");
        const logs = localData ? JSON.parse(localData) : [];
        const filtered = logs.filter((l: any) => l.id !== logToSave.id);
        filtered.unshift(logToSave);
        localStorage.setItem("mindful_flow_logs", JSON.stringify(filtered));
        setPastLogs(filtered);
        setSyncStatus("offline");
      } catch (e) {
        console.error("Local save error:", e);
      }
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
    
    // Parse timestamp to date/time format for input fields if possible
    // Default to today if unparseable
    const pDate = new Date(log.dateStr || Date.now());
    const year = pDate.getFullYear();
    const month = String(pDate.getMonth() + 1).padStart(2, '0');
    const day = String(pDate.getDate()).padStart(2, '0');
    setTempEditDate(`${year}-${month}-${day}`);
    
    // Attempt to extract time, e.g. "07:42"
    let timeStr = "12:00";
    if (log.timestamp && log.timestamp.includes(",")) {
      // e.g. "Jun 22, 07:42 AM"
      const tPart = log.timestamp.split(",")[1]?.trim();
      if (tPart) {
        // Simple extraction or parse
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
 
    // Build the new timestamp and dateStr
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
 
    // Save using our unified helper
    await saveLogToDb(updatedLog);
 
    // Update state directly
    setPastLogs(prev => prev.map(l => l.id === editingLogId ? updatedLog : l));
    setEditingLogId(null);
  };

  const deleteHistoryLog = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncStatus("syncing");
    
    // Instantly remove from state to prevent flickering
    setPastLogs(prev => prev.filter(item => item.id !== id));

    if (user) {
      // Synchronize logged-in user cache immediately
      try {
        const cachedUserLogs = localStorage.getItem(`mindful_flow_logs_${user.uid}`);
        if (cachedUserLogs) {
          const parsed = JSON.parse(cachedUserLogs).filter((item: any) => item.id !== id);
          localStorage.setItem(`mindful_flow_logs_${user.uid}`, JSON.stringify(parsed));
        }
      } catch (e) {
        console.warn("Could not delete from user logs cache:", e);
      }

      try {
        await deleteDoc(doc(db, "users", user.uid, "logs", id));
        setSyncStatus("synced");
      } catch (e) {
        console.error("Firestore delete error:", e);
        setSyncStatus("offline");
      }
    } else {
      // Guest mode
      try {
        const localData = localStorage.getItem("mindful_flow_logs");
        if (localData) {
          const logs = JSON.parse(localData);
          const filtered = logs.filter((item: any) => item.id !== id);
          localStorage.setItem("mindful_flow_logs", JSON.stringify(filtered));
        }
        setSyncStatus("offline");
      } catch (e) {
        console.error("Local delete error:", e);
      }
    }
  };

  const clearAllLogs = async () => {
    setSyncStatus("syncing");
    if (user) {
      try {
        const q = query(collection(db, "users", user.uid, "logs"));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        // Clear logged-in user cache
        localStorage.removeItem(`mindful_flow_logs_${user.uid}`);
        setPastLogs([]);
        setSyncStatus("synced");
      } catch (e) {
        console.error("Firestore clear error:", e);
        setSyncStatus("failed");
      }
    } else {
      // Guest mode
      localStorage.removeItem("mindful_flow_logs");
      setPastLogs([]);
      setSyncStatus("offline");
    }
  };

  // Filter logs list based on query
  const filteredLogs = pastLogs.filter(log => 
    log.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.ingredients.some(ing => ing.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Daily log reset: calculate entries recorded on current calendar day
  const todayLogsCount = pastLogs.filter(log => {
    if (log.dateStr) {
      return log.dateStr === new Date().toDateString();
    }
    // Fallback: check if standard relative/formatted timestamp contains month abbreviation and date string
    const todayFormatted = new Date().toLocaleString("en-US", { month: "short", day: "numeric" });
    return log.timestamp && log.timestamp.includes(todayFormatted);
  }).length;

  // Global macro and nutrient summation from past logs
  const totalProteinLogged = pastLogs.reduce((acc, log) => acc + (log.protein || 0), 0);
  const totalCarbsLogged = pastLogs.reduce((acc, log) => acc + (log.carbs || 0), 0);
  const totalFatLogged = pastLogs.reduce((acc, log) => acc + (log.fat || 0), 0);
  const totalFiberLogged = pastLogs.reduce((acc, log) => {
    if (log.fiber !== undefined) return acc + log.fiber;
    return acc + Math.round((log.carbs || 0) * 0.1);
  }, 0);

  const totalPhosphorusLogged = pastLogs.reduce((acc, log) => {
    if (log.phosphorus !== undefined) return acc + log.phosphorus;
    return acc + Math.round((log.protein || 0) * 6); // standard ratio estimate
  }, 0);

  const totalAntioxidantsLogged = pastLogs.reduce((acc, log) => {
    if (log.antioxidants !== undefined) return acc + log.antioxidants;
    const name = (log.name || "").toLowerCase();
    if (name.includes("salad") || name.includes("garden") || name.includes("berry") || name.includes("spinach") || name.includes("greens") || name.includes("avocado") || name.includes("oat")) {
      return acc + 6;
    }
    return acc + 2;
  }, 0);

  const proteinPercent = Math.min(100, Math.round((totalProteinLogged / 100) * 100)) || 0;
  const carbsPercent = Math.min(100, Math.round((totalCarbsLogged / 220) * 100)) || 0;
  const fatPercent = Math.min(100, Math.round((totalFatLogged / 70) * 100)) || 0;
  const fiberPercent = Math.min(100, Math.round((totalFiberLogged / 25) * 100)) || 0;

  // Daily logged sums for today
  const todayLogs = pastLogs.filter(log => {
    if (log.dateStr) {
      return log.dateStr === new Date().toDateString();
    }
    const todayFormatted = new Date().toLocaleString("en-US", { month: "short", day: "numeric" });
    return log.timestamp && log.timestamp.includes(todayFormatted);
  });

  // Analyze past coffee trend from logs
  const userEverHadCoffee = pastLogs.some(log => {
    const text = (log.name + " " + (log.ingredients || []).map(i => i.name).join(" ")).toLowerCase();
    return text.includes("coffee") || text.includes("caffeine") || text.includes("espresso") || text.includes("latte") || text.includes("cappuccino");
  });

  const hadCoffeeToday = todayLogs.some(log => {
    const text = (log.name + " " + (log.ingredients || []).map(i => i.name).join(" ")).toLowerCase();
    return text.includes("coffee") || text.includes("caffeine") || text.includes("espresso") || text.includes("latte") || text.includes("cappuccino");
  });

  // Calculate distinct tracking days from pastLogs timestamp or dateStr for 7-day baseline
  const daysTrackedCount = Array.from(new Set(
    pastLogs.map(log => {
      if (log.dateStr) return log.dateStr;
      if (log.timestamp) {
        try {
          const d = new Date(log.timestamp);
          if (!isNaN(d.getTime())) {
            return d.toDateString();
          }
        } catch (_) {}
      }
      return null;
    }).filter(Boolean)
  )).length;

  const daysTrackerProgressPerc = Math.min(100, Math.round((daysTrackedCount / 7) * 100));

  // Track healthy ingredients logged
  const healthyIngredientsOptions = ["berries", "avocado", "spinach", "salmon", "egg", "eggs", "greens", "oats", "chia", "broccoli", "chicken", "salad", "tomatoes"];
  const loggedHealthy = Array.from(new Set(
    pastLogs.flatMap(log => 
      (log.ingredients || []).map(i => i.name.toLowerCase())
    ).filter(name => 
      healthyIngredientsOptions.some(option => name.includes(option)) ||
      name.includes("veg") || name.includes("seed") || name.includes("green")
    )
  )).slice(0, 3);

  const todayCalories = todayLogs.reduce((sum, item) => sum + (item.calories || 0), 0);
  const todayProtein = todayLogs.reduce((sum, item) => sum + (item.protein || 0), 0);
  const todayCarbs = todayLogs.reduce((sum, item) => sum + (item.carbs || 0), 0);
  const todayFat = todayLogs.reduce((sum, item) => sum + (item.fat || 0), 0);
  const todayFiber = todayLogs.reduce((sum, item) => {
    if (item.fiber !== undefined) return sum + item.fiber;
    return sum + Math.round((item.carbs || 0) * 0.1);
  }, 0);

  return (
    <div className={`min-h-screen transition-colors duration-300 pb-20 overflow-x-hidden ${themeMode === 'dark' ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* Decorative Warm Ambient Gradient Backdrop */}
      <div className={`absolute top-0 inset-x-0 h-64 -z-10 pointer-events-none transition-opacity duration-300 ${themeMode === 'dark' ? 'bg-gradient-to-b from-teal-950/45 via-transparent to-transparent' : 'bg-gradient-to-b from-teal-50/50 via-transparent to-transparent'}`} />

      {activeTab === "balance" && (
        <header className="max-w-md mx-auto px-4 pt-6 pb-2">
          
          {/* PWA Direct Launcher Install Banner */}
          <AnimatePresence>
            {isInstallable && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className={`mb-4 border rounded-2xl p-4 flex gap-3.5 items-center justify-between shadow-sm ${themeMode === 'dark' ? 'bg-teal-950/40 border-teal-800/80' : 'bg-teal-50/80 border-teal-100'}`}
              >
                <div className="flex gap-2.5 items-center">
                  <div className="p-2 bg-teal-500 rounded-xl text-white shrink-0">
                    <Download className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <h4 className="text-xs font-semibold">Install App on Phone</h4>
                    <p className="text-[10px] opacity-75 font-mono">Launch faster offline anytime</p>
                  </div>
                </div>
                <button 
                  onClick={triggerPwaInstallation}
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap active:scale-95 transition-all"
                >
                  Install Now
                </button>
              </motion.div>
            )}
          </AnimatePresence>

           {/* Brand Header Card with Real-time clock */}
           <div className={`border rounded-2xl p-5 shadow-sm transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-teal-100'}`}>
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm shadow-teal-500/10 flex items-center justify-center border dark:border-slate-800 border-teal-50 shrink-0">
                   <img 
                     src="/pwa-icon.png" 
                     alt="balanceAI Logo" 
                     referrerPolicy="no-referrer"
                     className="w-full h-full object-cover"
                   />
                 </div>
                 <div>
                   <h1 className="text-xl font-display font-bold tracking-tight text-teal-600 dark:text-teal-400 font-bold">balanceAI</h1>
                 </div>
               </div>

              {/* Responsive Google Login Button & Avatar */}
              {authChecking ? (
                <div className="flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-500" />
                </div>
              ) : user ? (
                <div className="flex items-center gap-2">
                  <div className="text-right hidden sm:block">
                    <p className="text-[9.5px] leading-tight font-semibold truncate max-w-[80px]">{user.displayName || "User"}</p>
                    <span className="text-[7.5px] uppercase tracking-wider text-emerald-500 font-extrabold block">Synced</span>
                  </div>
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || ""} className="w-6 h-6 rounded-full border border-teal-500/30" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-[10px]">
                      {user.displayName?.charAt(0) || "U"}
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  onClick={async () => {
                    setErrorMessage(null);
                    try {
                      await signInWithPopup(auth, googleProvider);
                    } catch (err: any) {
                      console.warn("Popup blocked: ", err);
                      setErrorMessage("Login popup blocked. Open in a new tab by clicking the upper right icon next to play screen.");
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-teal-500/20 hover:border-teal-500/60 bg-teal-500/5 text-teal-600 dark:text-teal-400 rounded-xl transition-all cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              )}
            </div>

            <p className={`mt-3 text-xs leading-relaxed font-semibold ${themeMode === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              balance your lifestyle, so you can eat guilt free
            </p>

            <div className={`grid grid-cols-2 gap-3 mt-4 pt-4 border-t font-mono text-[11px] ${themeMode === 'dark' ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-600'}`}>
              <div>
                <span className="text-slate-400 block mb-0.5">TIME</span>
                <div className="flex items-center gap-1.5 font-sans font-semibold text-teal-500">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  <span>{currentTime || "Loading..."}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block mb-0.5">LOGGED TODAY</span>
                <span className="font-semibold text-teal-500">{todayLogsCount} {todayLogsCount === 1 ? 'meal' : 'meals'}</span>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-md mx-auto px-4 mt-2 space-y-4">

        {/* Error Notification Alert */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }}
              className="bg-rose-50 border border-rose-100 rounded-xl p-4 flex gap-3 text-rose-800 text-xs items-start"
            >
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Please review details</p>
                <p className="mt-0.5 text-rose-600/90 leading-relaxed">{errorMessage}</p>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-600">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === "balance" && (
          <div className="space-y-4">
            {/* Today's Balanced Dashboard */}
            <div className={`border rounded-2xl p-5 shadow-sm transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-zinc-150'}`}>
              <div className="flex items-center justify-between mb-3.5 border-b pb-2 dark:border-slate-800 border-slate-100">
                <span className="text-xs font-bold font-mono tracking-wider uppercase text-teal-600 dark:text-teal-400">📊 Today's Macros</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                <div className={`p-1.5 py-2.5 rounded-xl ${themeMode === 'dark' ? 'bg-slate-950/40' : 'bg-slate-50'}`}>
                  <span className="text-[8px] block text-slate-400 uppercase tracking-wider font-sans mb-1 font-semibold">Kcal</span>
                  <span className="text-xs sm:text-sm block text-amber-500 font-extrabold">{formatCalories(todayCalories)}</span>
                </div>
                <div className={`p-1.5 py-2.5 rounded-xl ${themeMode === 'dark' ? 'bg-slate-950/40' : 'bg-slate-50'}`}>
                  <span className="text-[8px] block text-slate-400 uppercase tracking-wider font-sans mb-1 font-semibold">Protein</span>
                  <span className="text-xs sm:text-sm block text-emerald-500 font-extrabold">{formatMacro(todayProtein)}g</span>
                </div>
                <div className={`p-1.5 py-2.5 rounded-xl ${themeMode === 'dark' ? 'bg-slate-950/40' : 'bg-slate-50'}`}>
                  <span className="text-[8px] block text-slate-400 uppercase tracking-wider font-sans mb-1 font-semibold">Carbs</span>
                  <span className="text-xs sm:text-sm block text-sky-500 font-extrabold">{formatMacro(todayCarbs)}g</span>
                </div>
                <div className={`p-1.5 py-2.5 rounded-xl ${themeMode === 'dark' ? 'bg-slate-950/40' : 'bg-slate-50'}`}>
                  <span className="text-[8px] block text-slate-400 uppercase tracking-wider font-sans mb-1 font-semibold">Fats</span>
                  <span className="text-xs sm:text-sm block text-indigo-500 font-extrabold">{formatMacro(todayFat)}g</span>
                </div>
                <div className={`p-1.5 py-2.5 rounded-xl ${themeMode === 'dark' ? 'bg-slate-950/40' : 'bg-slate-50'}`}>
                  <span className="text-[8px] block text-slate-400 uppercase tracking-wider font-sans mb-1 font-semibold">Fiber</span>
                  <span className="text-xs sm:text-sm block text-teal-500 font-extrabold">{formatMacro(todayFiber)}g</span>
                </div>
              </div>
              {/* Daily protein tracker progress */}
              <div className="mt-4 space-y-1.5 text-left">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-semibold text-slate-400 uppercase tracking-wider">Daily Protein Progress</span>
                  <span className="font-mono text-emerald-500 font-bold">{formatMacro(todayProtein)}g / {bodyWeight > 0 ? bodyWeight : 70}g target</span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, Math.round((todayProtein / (bodyWeight > 0 ? bodyWeight : 70)) * 100))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Workspace Form Card */}
            <div className={`border rounded-2xl p-5 shadow-sm space-y-4 transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'}`}>
          <div className={`flex items-center justify-between border-b pb-3 ${themeMode === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
            <h3 className="font-display font-medium text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Balance lifestyle
            </h3>
            {currentAnalysis && (
              <button 
                onClick={() => {
                  setCurrentAnalysis(null);
                  setClarificationAnswers({});
                  setErrorMessage(null);
                }}
                className="text-xs text-teal-500 hover:text-teal-600 flex items-center gap-1 font-medium bg-transparent border-0 cursor-pointer"
              >
                Reset Flow
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {!currentAnalysis ? (
              // Stage 1: Initial Entry (Text +/- Image)
              <motion.div
                key="entry-form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 font-mono uppercase tracking-wider ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    What did you eat?
                  </label>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Describe your meal (e.g., Poached salmon, sweet potato mash, and warm green spinach with sesame oil...)"
                    className={`w-full text-xs p-3.5 border rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 h-24 resize-none placeholder-slate-400 leading-relaxed font-sans ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50/50 border-slate-200 text-slate-800'}`}
                  />
                </div>

                <div>
                  <span className={`block text-xs font-semibold mb-1.5 font-mono uppercase tracking-wider ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                    Or Upload/Take a Photo
                  </span>

                  {!imageInput ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`border border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 group ${themeMode === 'dark' ? 'border-slate-800 hover:border-slate-700 hover:bg-slate-950' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50/70'}`}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                        accept="image/*"
                        className="hidden" 
                      />
                      <div className={`p-3 rounded-full w-fit mx-auto transition-transform duration-200 group-hover:scale-105 ${themeMode === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                        <Camera className="w-5 h-5" />
                      </div>
                      <p className="mt-2.5 text-xs font-medium">Tap to snap or upload food photo</p>
                      <p className="mt-1 text-[10px] text-slate-400 font-mono">JPG, PNG up to 10MB</p>
                    </div>
                  ) : (
                    <div className="relative border border-slate-200 rounded-xl overflow-hidden mt-1 bg-slate-900 group">
                      <img 
                        src={imageInput} 
                        alt="Captured Plate" 
                        className="w-full h-44 object-cover opacity-90 transition-opacity duration-200 group-hover:opacity-80" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent pointer-events-none" />
                      <button 
                        onClick={removeCapturedImage}
                        type="button"
                        className="absolute top-2.5 right-2.5 p-1.5 bg-slate-900/80 hover:bg-slate-950 hover:scale-105 rounded-full text-white shadow-sm transition-all text-xs border-0 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 bg-slate-900/40 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-white">
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Food Photo Loaded</span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isLoading || (!textInput.trim() && !imageInput)}
                  onClick={() => submitAnalyzeMeal()}
                  className="w-full py-3.5 bg-teal-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2 border-0 cursor-pointer font-sans"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Reading Meal & Formatting Insights...</span>
                    </>
                  ) : (
                    <>
                      <span>Balance for lifestyle tips</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.div>
            ) : (
              // Stage 2: Clarification Flow requested by Server
              <motion.div
                key="clarification-panel"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className={`border rounded-xl p-3.5 flex gap-2.5 text-xs leading-relaxed mb-1 ${themeMode === 'dark' ? 'bg-amber-950/20 border-amber-900/80 text-amber-300' : 'bg-amber-50/70 border-amber-100 text-amber-800'}`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <span className="font-semibold block mb-0.5">Let's refine calculations</span>
                    Our analyzer saw your plate but wants a quick confirmation to calculate your specs accurately.
                  </div>
                </div>

                {currentAnalysis.clarificationQuestions?.map((question, index) => (
                  <div key={index} className="space-y-1.5">
                    <label className="text-xs font-semibold leading-relaxed block text-left">
                      {question}
                    </label>
                    <input
                      type="text"
                      value={clarificationAnswers[question] || ""}
                      onChange={(e) => handleClarificationChange(question, e.target.value)}
                      placeholder="Type your brief response here..."
                      className={`w-full text-xs p-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-slate-500 ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-amber-50/10 border-slate-200'}`}
                    />
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentAnalysis(null);
                      setClarificationAnswers({});
                      setErrorMessage(null);
                    }}
                    className={`py-3 rounded-xl text-xs font-semibold transition-all text-center border-0 cursor-pointer ${themeMode === 'dark' ? 'bg-slate-800 hover:bg-slate-750 text-slate-300' : 'bg-slate-100 hover:bg-slate-250 text-slate-600'}`}
                  >
                    Start Over / Clear
                  </button>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={submitClarificationFeedback}
                    className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1 border-0 cursor-pointer"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Submit & Load"
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Latest Logged Meal Dynamic Highlight Result */}
        {pastLogs.length > 0 && (
          <div id="latest-result" className="space-y-4">
            <div className={`flex items-center gap-2 px-1 text-xs font-mono tracking-wider uppercase font-bold ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-550'}`}>
              <CheckCircle2 className="w-4 h-4 text-teal-500" />
              <span>Intake breakdown</span>
            </div>

            {/* Displaying newest log detailing insights */}
            {(() => {
              const latest = pastLogs[0];
              return (
                <div className={`border rounded-2xl shadow-sm overflow-hidden divide-y transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800 divide-slate-800' : 'bg-white border-teal-100 divide-slate-100'}`}>
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-left">
                        <span className={`font-mono text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${themeMode === 'dark' ? 'bg-teal-950 text-teal-400' : 'bg-teal-50 text-teal-600'}`}>
                          NEWEST LOG • {latest.timestamp}{latest.isLearned && " • ✨ SMART RECALL"}
                        </span>
                        <h2 className={`text-lg font-display font-semibold mt-1.5 capitalize leading-snug ${themeMode === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                          {latest.name}
                        </h2>
                        <p className={`text-[11px] mt-0.5 ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                          Detected portion: {latest.portionDetected}
                        </p>
                      </div>
                      
                      {latest.image && (
                        <img 
                          src={latest.image} 
                          alt={latest.name} 
                          className="w-14 h-14 object-cover rounded-xl border shrink-0 border-slate-300" 
                        />
                      )}
                    </div>

                    {/* Fuel Indicator Grid */}
                    <div className={`grid grid-cols-5 gap-1 text-center rounded-xl p-3 border transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-50/75 border-slate-100'}`}>
                      <div>
                        <div className="flex justify-center mb-0.5">
                          <Flame className="w-4 h-4 text-amber-500" />
                        </div>
                        <span className={`text-[8px] font-mono block ${themeMode === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>CALORIES</span>
                        <span className="text-xs sm:text-sm font-semibold font-mono">{formatCalories(latest.calories)} <span className="text-[7px] font-normal opacity-70">kcal</span></span>
                      </div>
                      <div>
                        <div className="flex justify-center mb-0.5">
                          <Dumbbell className="w-4 h-4 text-emerald-500" />
                        </div>
                        <span className={`text-[8px] font-mono block ${themeMode === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>PROTEIN</span>
                        <span className="text-xs sm:text-sm font-semibold font-mono">{formatMacro(latest.protein)}g</span>
                      </div>
                      <div>
                        <div className="flex justify-center mb-0.5">
                          <Wheat className="w-4 h-4 text-sky-500" />
                        </div>
                        <span className={`text-[8px] font-mono block ${themeMode === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>CARBS</span>
                        <span className="text-xs sm:text-sm font-semibold font-mono">{formatMacro(latest.carbs)}g</span>
                      </div>
                      <div>
                        <div className="flex justify-center mb-0.5">
                          <Droplet className="w-4 h-4 text-indigo-500" />
                        </div>
                        <span className={`text-[8px] font-mono block ${themeMode === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>FATS</span>
                        <span className="text-xs sm:text-sm font-semibold font-mono">{formatMacro(latest.fat)}g</span>
                      </div>
                      <div>
                        <div className="flex justify-center mb-0.5">
                          <Leaf className="w-4 h-4 text-teal-500" />
                        </div>
                        <span className={`text-[8px] font-mono block ${themeMode === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>FIBER</span>
                        <span className="text-xs sm:text-sm font-semibold font-mono">
                          {formatMacro(latest.fiber !== undefined ? latest.fiber : (latest.carbs || 0) * 0.1)}g
                        </span>
                      </div>
                    </div>

                    {/* Ingredients detail */}
                    <div className="space-y-1.5 text-left">
                      <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">INGREDIENTS DETECTED</span>
                      <div className="flex flex-wrap gap-1.5">
                        {latest.ingredients.map((ing, i) => (
                          <span 
                            key={i} 
                            className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}
                          >
                            <span className="font-semibold capitalize">{ing.name}</span>
                            {ing.amount && <span className="text-[10px] text-slate-400 font-mono font-normal">({ing.amount})</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Shame-Free Actionable Insights section */}
                  <div className={`p-5 space-y-5 text-left transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900/60' : 'bg-gradient-to-b from-teal-50/20 to-white'}`}>
                    <h4 className="text-xs font-mono font-bold text-teal-500 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2 dark:border-slate-800 border-slate-100">
                      <Sparkles className="w-3.5 h-3.5" />
                      Insights
                    </h4>

                    {/* Section 1: Nutritional Insights */}
                    <div className="space-y-3.5 border-b pb-4 dark:border-slate-800 border-slate-150">
                      <div className="flex gap-3">
                        <div className={`p-2 rounded-xl h-fit border shrink-0 ${themeMode === 'dark' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/60' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          <Compass className="w-4 h-4" />
                        </div>
                        <div className="space-y-2 text-left flex-1">
                          <span className="text-xs font-semibold block">Nutritional Insights</span>

                          {/* Achievements */}
                          <div className={`mt-2 p-2.5 rounded-xl border flex justify-between items-center font-mono text-[10px] ${themeMode === 'dark' ? 'bg-slate-950/80 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-100/80'}`}>
                            <div>
                              <span className="text-slate-400 block pb-0.5 uppercase text-[9px]">Phosphorus Achieved</span>
                              <span className="font-bold text-sky-500">{(totalPhosphorusLogged / 1000).toFixed(2)} g</span>
                            </div>
                            <div className="w-px h-6 bg-slate-250 dark:bg-slate-800" />
                            <div>
                              <span className="text-slate-400 block pb-0.5 uppercase text-[9px]">Antioxidants Score</span>
                              <span className="font-bold text-emerald-500">+{totalAntioxidantsLogged} units</span>
                            </div>
                          </div>

                          {latest.digestBetter && (
                            <p className={`text-xs leading-relaxed mt-2.5 pt-2 border-t border-dashed dark:border-slate-800 border-slate-100 ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                              {latest.digestBetter}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Next intake */}
                    <div className="space-y-3.5 border-b pb-4 dark:border-slate-800 border-slate-150">
                      <div className="flex gap-3">
                        <div className={`p-2 rounded-xl h-fit border shrink-0 ${themeMode === 'dark' ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/60' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="space-y-2 text-left flex-1">
                          <span className="text-xs font-semibold block">Next intake</span>
                          
                          <div className="space-y-2 text-[11px]">
                            <div className={`p-3 rounded-xl border transition-colors ${themeMode === 'dark' ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-100' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'}`}>
                              <span className="font-extrabold text-emerald-700 dark:text-emerald-400 text-[10px] tracking-wider uppercase block mb-1 font-mono">✓ What To Do</span>
                              {(() => {
                                const getDietCompliantProteins = (dietStr: string): string => {
                                  const normalized = (dietStr || "").toLowerCase();
                                  if (normalized.includes("vegan")) {
                                    return "organic baked tofu, tempeh, edamame, or organic lentil soup";
                                  } else if (normalized.includes("vegetarian") || normalized.includes("veg")) {
                                    return "baked tofu, organic egg whites, Greek yogurt, or organic cottage cheese";
                                  }
                                  return "clean chicken breast, pastured eggs, or wild-caught salmon";
                                };
                                const compliantProteins = getDietCompliantProteins(dietType);
                                
                                const defaultWhatToDo = totalFiberLogged >= 20 ? (
                                  `Your fiber is fully completed (${formatMacro(totalFiberLogged)}g total)! For your next intake, you can eat a protein-heavy item now (such as ${compliantProteins}) to optimize glucose levels and tissue synthesis.`
                                ) : (latest.protein || 0) < 15 && totalProteinLogged < 60 ? (
                                  `Since protein level is currently low (${formatMacro(latest.protein || 0)}g) relative to carbs (${formatMacro(latest.carbs || 0)}g), make your next intake focus strictly on clean muscle repair. Incorporate a high-quality protein addition (such as ${compliantProteins}).`
                                ) : (latest.carbs || 0) > 40 ? (
                                  `To balance out the high carbohydrate count from this meal, introduce some healthy, slow-burning lipid and rich fiber pairings (such as chia pudding, raw flax seeds, avocado, or high-density green salad) on your next portion.`
                                ) : (
                                  `Incorporate an active fiber-dense addition (such as chia seeds, oats, stable raw walnuts, or high-density green salad) to feed healthy gut biota and ease gastric transition on your next portion.`
                                );
                                const combinedText = getCombinedWhatToDo(latest.whatToDo || defaultWhatToDo, latest.bestTimeOfDay);
                                return <p className="leading-relaxed text-xs">{combinedText}</p>;
                              })()}
                            </div>

                            <div className={`p-3 rounded-xl border transition-colors ${themeMode === 'dark' ? 'bg-rose-950/20 border-rose-900/40 text-rose-100' : 'bg-rose-50/70 border-rose-200 text-rose-950'}`}>
                              <span className="font-extrabold text-rose-700 dark:text-rose-400 text-[10px] tracking-wider uppercase block mb-1 font-mono">✗ What Not To Do</span>
                              {latest.whatNotToDo ? (
                                <p className="leading-relaxed text-xs">{latest.whatNotToDo}</p>
                              ) : totalFiberLogged >= 20 ? (
                                <p className="leading-relaxed text-xs">
                                  Avoid excessive fiber stacks on your next intake to prevent sluggish gastric empty rates. Keep your proteins clean and steer clear of pairing them with sweetened juices or heavy artificial binders.
                                </p>
                              ) : (latest.protein || 0) < 15 && totalProteinLogged < 60 ? (
                                <p className="leading-relaxed text-xs">
                                  Avoid loading up on isolated, fast-release carbohydrate snack bars, sugary juices, or fruit bowls which lack a robust protein anchor, as they will cause a sharp glucose rollercoaster.
                                </p>
                              ) : (latest.carbs || 0) > 40 ? (
                                <p className="leading-relaxed text-xs">
                                  Steer clear of refined grains, pastries, sweetened drinks, or sugary syrups on your next intake, which would exacerbate the insulin spike from this heavy-carb portion and cause subsequent afternoon drowsiness.
                                </p>
                              ) : (
                                <p className="leading-relaxed text-xs">
                                  Avoid loading up on isolated, fast-release carbohydrate starches or sugary pastries which will spike cortisol and provoke insulin rollercoasters.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Lifestyle */}
                    <div className="space-y-3.5">
                      <div className="flex gap-3">
                        <div className={`p-2 rounded-xl h-fit border shrink-0 ${themeMode === 'dark' ? 'bg-amber-950/40 text-amber-400 border-amber-900/60' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                          <Activity className="w-4 h-4" />
                        </div>
                        <div className="space-y-2 text-left flex-1">
                          <span className="text-xs font-semibold block">Lifestyle</span>
                          
                          <div className="space-y-2 text-[11px] leading-relaxed text-slate-800 dark:text-slate-300">
                            {/* Always render the custom AI Activity guidance for the latest meal split into matching dual green/red boxes */}
                            {latest.activityToEliminate && (() => {
                              const advice = parseLifestyleAdvice(latest.activityToEliminate);
                              return (
                                <div className="space-y-2 mt-2">
                                  {advice.whatToDo && (
                                    <div className={`p-3 rounded-xl border transition-colors ${themeMode === 'dark' ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-100' : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'}`}>
                                      <span className="font-extrabold text-emerald-700 dark:text-emerald-400 text-[10px] tracking-wider uppercase block mb-1 font-mono">✓ What To Do</span>
                                      <p className="leading-relaxed text-xs">{advice.whatToDo}</p>
                                    </div>
                                  )}
                                  {advice.whatNotToDo && (
                                    <div className={`p-3 rounded-xl border transition-colors ${themeMode === 'dark' ? 'bg-rose-950/20 border-rose-900/40 text-rose-100' : 'bg-rose-50/70 border-rose-200 text-rose-950'}`}>
                                      <span className="font-extrabold text-rose-700 dark:text-rose-400 text-[10px] tracking-wider uppercase block mb-1 font-mono">✗ What Not To Do</span>
                                      <p className="leading-relaxed text-xs">{advice.whatNotToDo}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Combined Insights Section after What Not To Do - dynamically computed from real history logs with full high-contrast accessibility */}
                            {pastLogs.length > 0 && (
                              <div className={`p-4 rounded-xl border space-y-3 mt-4 ${themeMode === 'dark' ? 'bg-slate-950/45 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                <span className={`font-semibold text-xs block border-b pb-1.5 ${themeMode === 'dark' ? 'text-teal-400 border-slate-800' : 'text-teal-800 border-slate-200'}`}>
                                  Habits & Routines Insights
                                </span>
                                
                                <div className={`space-y-3 text-xs leading-relaxed ${themeMode === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                                  {/* Coffee Advice: ONLY customized if user actually drinks coffee, otherwise hidden to avoid irrelevant AI guessing */}
                                  {userEverHadCoffee && (
                                    <p>
                                      ☕ <strong>Caffeine Habit:</strong> {hadCoffeeToday ? (
                                        "You logged caffeine today. To maintain steady adrenal function and prevent blood sugar rollercoaster effects, keep well hydrated and try to ensure caffeine is taken alongside or after some solid protein/fat."
                                      ) : (
                                        "You haven't logged coffee today. Giving your adenosine receptors a natural caffeine-free rest day is a superb routine to optimize long-term cortisol rhythms and sleep quality!"
                                      )}
                                    </p>
                                  )}

                                  {/* Exercise / Glycemic load activity recommendation */}
                                  {todayCarbs > 120 ? (
                                    <p>
                                      🏃‍♂️ <strong>Glycogen Loading:</strong> With {formatMacro(todayCarbs)}g of carbs logged today, your muscle glycogen stores are well stocked. This is a prime physiological window for exercise or a brisk 15-minute walk to prompt immediate skeletal muscle glucose clearance.
                                    </p>
                                  ) : (
                                    <p>
                                      💻 <strong>Cognitive Focus:</strong> Your systemic insulin load is highly stable under lower carbohydrate inputs today ({formatMacro(todayCarbs)}g). Take advantage of this pristine metabolic window to complete deep cognitive tasks or intense design blocks.
                                    </p>
                                  )}

                                  {/* Rest advice */}
                                  {latest.calories > 500 && new Date().getHours() >= 13 && new Date().getHours() <= 16 && (
                                    <p>
                                      😴 <strong>Digestive Support:</strong> After processing a solid {formatMacro(latest.calories)} kcal intake, doing some slow diaphragmatic breaths or taking a 10-minute quiet block will optimize parasympathetic bowel transit.
                                    </p>
                                  )}

                                  {/* High-quality routines only, avoiding processed items */}
                                  {loggedHealthy.length > 0 && (
                                    <p className={`pt-2 border-t border-dashed text-[11px] italic ${themeMode === 'dark' ? 'border-slate-800 text-slate-300' : 'border-slate-200 text-slate-800'}`}>
                                      🌟 <strong>Nutritional Cornerstones:</strong> You regularly fuel your system with clean ingredients like <span className={`font-bold capitalize ${themeMode === 'dark' ? 'text-teal-400' : 'text-teal-700'}`}>{loggedHealthy.join(", ")}</span>. Keep reinforcing these positive repeats!
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
          </div>
        )}
          {activeTab === "history" && (
           <div className="space-y-4 animate-fade-in">
            {/* Quick Metrics Header Card */}
            <div className={`border rounded-2xl p-5 shadow-sm transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/85'}`}>
              <div className="grid grid-cols-3 gap-3.5 font-sans">
                <div className="space-y-1.5 text-center">
                  <span className={`text-[9px] font-mono block uppercase font-bold tracking-wider ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>streak</span>
                  <div className="flex items-center justify-center gap-1">
                    <Flame className="w-4 h-4 text-orange-500 animate-pulse" />
                    <span className={`text-sm font-bold leading-none ${themeMode === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>
                      {(() => {
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
                      })()} days
                    </span>
                  </div>
                </div>

                <div className={`space-y-1.5 text-center border-x ${themeMode === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                  <span className={`text-[9px] font-mono block uppercase font-bold tracking-wider ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>tracked</span>
                  <span className={`text-sm font-bold block leading-none ${themeMode === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>{daysTrackedCount}/7 days</span>
                </div>

                <div className="space-y-1.5 text-center">
                  <span className={`text-[9px] font-mono block uppercase font-bold tracking-wider ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>logs qty</span>
                  <span className={`text-sm font-bold block leading-none ${themeMode === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>{pastLogs.length} entries</span>
                </div>
              </div>
            </div>

            {/* Historical Logs List Archive Section */}
            <div className={`border rounded-2xl p-5 shadow-sm space-y-4 transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-500" />
                  Past Logs
                </h3>
                {pastLogs.length > 0 && (
                  <button 
                    onClick={() => {
                      if (window.confirm("Are you sure you want to permanently clear all logs?")) {
                        clearAllLogs();
                      }
                    }}
                    className="text-[10px] text-rose-500 hover:text-rose-600 font-mono font-semibold uppercase tracking-wider bg-transparent border-0 cursor-pointer text-right shrink-0"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {pastLogs.length === 0 ? (
                <div className={`text-center py-10 border border-dashed rounded-xl ${themeMode === 'dark' ? 'border-slate-800 bg-slate-950/20' : 'border-slate-200 bg-slate-50/20'}`}>
                  <span className="text-xs text-slate-500 block font-mono">NO ENTRIES</span>
                  <p className={`text-xs mt-1.5 max-w-[250px] mx-auto ${themeMode === 'dark' ? 'text-slate-410' : 'text-slate-500'}`}>
                    Use the 'Balance' tab to record food descriptions or upload plates to compile your eating timeline.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Filter search bar */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search saved meals or components..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full text-xs p-2.5 pl-8 border rounded-lg focus:outline-none placeholder-slate-500 ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-850'}`}
                    />
                    <span className="absolute left-2.5 top-3.5 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </span>
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer animate-fade-in">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1 scrollbar-thin">
                    <AnimatePresence initial={false}>
                      {filteredLogs.map((log) => {
                        if (editingLogId === log.id) {
                          return (
                            <div 
                              key={log.id} 
                              className={`border rounded-xl p-4 transition-all flex flex-col gap-3.5 text-left border-teal-500 dark:border-teal-500/60 ${themeMode === 'dark' ? 'bg-slate-900' : 'bg-white'}`}
                              onClick={e => e.stopPropagation()}
                            >
                              <div className="flex justify-between items-center border-b pb-2 dark:border-slate-800 border-slate-100">
                                <span className="text-[10px] font-bold font-mono tracking-wider text-teal-605 dark:text-teal-400 uppercase">✏️ Edit Log Record</span>
                                <button 
                                  onClick={() => setEditingLogId(null)}
                                  className="text-[10px] text-slate-400 hover:text-slate-650 font-mono uppercase bg-transparent border-0 cursor-pointer font-bold"
                                >
                                  Cancel
                                </button>
                              </div>
                              
                              <div className="space-y-3 text-xs">
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Meal Name</label>
                                  <textarea 
                                    value={editName} 
                                    onChange={e => setEditName(e.target.value)} 
                                    rows={3}
                                    className={`w-full p-2 border rounded-lg focus:outline-none resize-none text-xs ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Date</label>
                                    <input 
                                      type="date" 
                                      value={tempEditDate} 
                                      onChange={e => setTempEditDate(e.target.value)} 
                                      className={`w-full p-2 border rounded-lg text-xs focus:outline-none ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Time</label>
                                    <input 
                                      type="time" 
                                      value={tempEditTime} 
                                      onChange={e => setTempEditTime(e.target.value)} 
                                      className={`w-full p-2 text-xs border rounded-lg focus:outline-none ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-5 gap-1 text-center font-mono">
                                  <div>
                                    <label className="text-[8px] text-slate-400 uppercase block mb-0.5">Kcal</label>
                                    <input 
                                      type="number" 
                                      value={editCalories} 
                                      onChange={e => setEditCalories(Number(e.target.value))} 
                                      className={`w-full p-1 text-[11px] text-center border rounded-lg focus:outline-none ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-slate-400 uppercase block mb-0.5">Prot(g)</label>
                                    <input 
                                      type="number" 
                                      value={editProtein} 
                                      onChange={e => setEditProtein(Number(e.target.value))} 
                                      className={`w-full p-1 text-[11px] text-center border rounded-lg focus:outline-none ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-slate-400 uppercase block mb-0.5">Carb(g)</label>
                                    <input 
                                      type="number" 
                                      value={editCarbs} 
                                      onChange={e => setEditCarbs(Number(e.target.value))} 
                                      className={`w-full p-1 text-[11px] text-center border rounded-lg focus:outline-none ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-slate-400 uppercase block mb-0.5">Fat(g)</label>
                                    <input 
                                      type="number" 
                                      value={editFat} 
                                      onChange={e => setEditFat(Number(e.target.value))} 
                                      className={`w-full p-1 text-[11px] text-center border rounded-lg focus:outline-none ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[8px] text-slate-400 uppercase block mb-0.5">Fibr(g)</label>
                                    <input 
                                      type="number" 
                                      value={editFiber} 
                                      onChange={e => setEditFiber(Number(e.target.value))} 
                                      className={`w-full p-1 text-[11px] text-center border rounded-lg focus:outline-none ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200'}`}
                                    />
                                  </div>
                                </div>

                                <div className="pt-2">
                                  <button 
                                    onClick={saveEditedLog}
                                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition-all shadow-sm cursor-pointer border-0 active:scale-95"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    <span>Save Changes</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <motion.div
                            key={log.id}
                            layout="position"
                            onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                            className={`border rounded-xl p-3.5 transition-all relative flex flex-col gap-3 cursor-pointer text-left ${
                              expandedLogId === log.id
                                ? (themeMode === 'dark' ? 'border-teal-800 bg-slate-900 shadow-md shadow-teal-950/20' : 'border-teal-100 bg-white shadow-md shadow-teal-100/15')
                                : (themeMode === 'dark' ? 'border-slate-800 bg-slate-950 hover:bg-slate-800' : 'border-slate-100 bg-slate-50/50 hover:bg-slate-100/40')
                            }`}
                          >
                            <div className="w-full flex justify-between items-center gap-3">
                              <div className="min-w-0 flex-1 text-left">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] text-slate-400 font-mono">{log.timestamp}</span>
                                  <span className={`text-[9px] font-mono px-1.5 rounded ${themeMode === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                                    {formatCalories(log.calories)} kcal
                                  </span>
                                  {log.mealPeriod && (
                                    <span className={`text-[9px] font-mono px-1.5 rounded ${themeMode === 'dark' ? 'bg-teal-950/50 text-teal-300 border border-teal-900/60' : 'bg-teal-50 text-teal-700 border border-teal-100'}`}>
                                      {log.mealPeriod}
                                    </span>
                                  )}
                                  {log.isLearned && (
                                    <span className={`text-[9px] font-mono px-1.5 rounded ${themeMode === 'dark' ? 'bg-indigo-950/50 text-indigo-300 border border-indigo-900/60' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>
                                      ✨ Smart Recall
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-xs font-semibold capitalize mt-1.5 leading-snug break-words">
                                  {log.name}
                                </h4>
                                <p className={`text-[10px] mt-0.5 break-words ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {log.ingredients.map(i => i.name).join(", ")}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
                                {log.image && (
                                  <img 
                                    src={log.image} 
                                    alt={log.name} 
                                    className="w-10 h-10 object-cover rounded-lg border border-slate-300/30 shrink-0" 
                                  />
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditingLog(log);
                                  }}
                                  title="Edit intake timing and values"
                                  className="p-1.5 text-slate-400 hover:text-teal-500 hover:bg-teal-50/10 rounded-lg transition-all bg-transparent border-0 cursor-pointer shrink-0"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={(e) => deleteHistoryLog(log.id, e)}
                                  title="Delete entry from server"
                                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50/10 rounded-lg transition-all bg-transparent border-0 cursor-pointer shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                          <AnimatePresence>
                            {expandedLogId === log.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="w-full text-left border-t border-dashed dark:border-slate-800 border-slate-200 mt-2.5 pt-3 space-y-3"
                                onClick={e => e.stopPropagation()}
                              >
                                {/* Macro pills row */}
                                <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono pt-1">
                                  <div className={`p-1.5 rounded-lg border ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-100/40 border-slate-200'}`}>
                                    <span className="block font-bold text-teal-400">{formatMacro(log.protein)}g</span>
                                    <span className="text-[8px] text-slate-400 uppercase tracking-widest block font-sans">Protein</span>
                                  </div>
                                  <div className={`p-1.5 rounded-lg border ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-100/40 border-slate-200'}`}>
                                    <span className="block font-bold text-sky-500">{formatMacro(log.carbs)}g</span>
                                    <span className="text-[8px] text-slate-400 uppercase tracking-widest block font-sans">Carbs</span>
                                  </div>
                                  <div className={`p-1.5 rounded-lg border ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-100/40 border-slate-200'}`}>
                                    <span className="block font-bold text-indigo-400">{formatMacro(log.fat)}g</span>
                                    <span className="text-[8px] text-slate-400 uppercase tracking-widest block font-sans">Fat</span>
                                  </div>
                                  <div className={`p-1.5 rounded-lg border ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-100/40 border-slate-200'}`}>
                                    <span className="block font-bold text-emerald-500">
                                      {formatMacro(log.fiber !== undefined ? log.fiber : log.carbs * 0.1)}g
                                    </span>
                                    <span className="text-[8px] text-slate-400 uppercase tracking-widest block font-sans">Fiber</span>
                                  </div>
                                </div>

                                {/* Detailed portions */}
                                <div className="space-y-1">
                                  <span className="text-[9px] uppercase font-mono tracking-wider text-slate-400 font-bold block">Involved Food Elements</span>
                                  <div className="flex flex-wrap gap-1">
                                    {log.ingredients.map((ing, idx) => (
                                      <span key={idx} className={`text-[9.5px] px-2 py-0.5 rounded-md border font-sans ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200/60 text-slate-600'}`}>
                                        {ing.name} {ing.amount ? `(${ing.amount})` : ""}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {/* Digestion benefit */}
                                {log.digestBetter && (
                                  <div className="bg-teal-500/5 dark:bg-slate-950 p-2.5 rounded-lg border dark:border-slate-800 border-teal-100/30">
                                    <span className="text-[9px] font-mono font-bold text-teal-400 uppercase block">✨ Metabolic Benefit</span>
                                    <p className="text-[10.5px] leading-relaxed mt-0.5 text-slate-600 dark:text-slate-300">{log.digestBetter}</p>
                                  </div>
                                )}

                                {/* Timing guide */}
                                {log.bestTimeOfDay && (
                                  <div className="bg-sky-500/5 dark:bg-slate-950 p-2.5 rounded-lg border dark:border-slate-800 border-sky-100/30">
                                    <span className="text-[9px] font-mono font-bold text-sky-400 uppercase block">🧭 Circular Timing</span>
                                    <p className="text-[10.5px] leading-relaxed mt-0.5 text-slate-600 dark:text-slate-300">{log.bestTimeOfDay}</p>
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}

                      {filteredLogs.length === 0 && searchQuery && (
                        <div className="text-center py-6">
                          <p className="text-xs text-slate-400 font-mono">No matching files or logs found.</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>

            {/* Baseline Calibration Progress Card */}
            <div className={`border rounded-2xl p-5 shadow-sm space-y-4 transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold block">
                  {daysTrackedCount >= 7 ? "✨ Calibration Completed" : "Baseline Calibration Progress"}
                </span>
                <span className="text-[10px] text-teal-500 font-mono font-bold">
                  {Math.min(7, daysTrackedCount)} / 7 days
                </span>
              </div>
              <p className={`text-[10.5px] leading-relaxed ${themeMode === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                {daysTrackedCount >= 7 
                  ? "Calibration complete! balanceAI is now fully calibrated to your personal metabolic baseline. Your meal insights, macro suggestions, and timing recommendations are now actively customized based on your historical eating habits."
                  : "The first 7 days are about calibrating your dynamic metabolic baseline. Logging food consistently helps us refine your personalized target metrics."
                }
              </p>
              <div className="space-y-1.5 pt-1.5">
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, daysTrackerProgressPerc)}%` }} />
                </div>
                <div className="text-[9px] font-mono text-slate-400 flex justify-between">
                  <span>{Math.min(100, daysTrackerProgressPerc)}% COMPLETE</span>
                  {daysTrackedCount >= 7 ? (
                    <span className="text-emerald-500 font-bold">TUNED TO BASELINE</span>
                  ) : (
                    <span>{Math.max(0, 7 - daysTrackedCount)} CALIBRATION DAYS LEFT</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-4 animate-fade-in">
            {/* User Profile Card */}
            <div className={`border rounded-2xl p-6 shadow-sm text-center transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'}`}>
              <div className="relative w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                {user && user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt={user.displayName || "User Avatar"} 
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-2xl object-cover shadow-sm border dark:border-slate-800 border-slate-100"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-teal-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold font-display shadow-sm shadow-indigo-500/10">
                    {(() => {
                      const name = user?.displayName || "";
                      if (!name) return "ME";
                      const parts = name.trim().split(/\s+/);
                      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
                      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                    })()}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 p-1 bg-teal-500 border-2 border-white dark:border-slate-900 rounded-full animate-pulse">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </div>
              </div>

              <h2 className="text-sm font-display font-bold">
                {user ? (user.displayName || "Mindful User") : "Guest User"}
              </h2>
              <p className="text-[10.5px] text-slate-400 font-mono mt-0.5">
                {user ? (user.email || "No email synchronized") : "offline-first guest"}
              </p>

              {user && (
                <button
                  onClick={() => {
                    localStorage.removeItem("mindful_flow_last_uid");
                    signOut(auth).catch(err => setErrorMessage(err.message));
                  }}
                  className="mt-3 px-3.5 py-1.5 border border-rose-500/20 hover:border-rose-500/50 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-bold cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 mx-auto"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              )}


            </div>

            {/* Diet Type Input Card */}
            <div className={`border rounded-2xl p-5 shadow-sm space-y-4 text-left transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-zinc-150'}`}>
              <div className="flex gap-2 items-center">
                <div className={`p-2 rounded-xl h-fit border shrink-0 ${themeMode === 'dark' ? 'bg-teal-950/40 text-teal-400 border-teal-900/60' : 'bg-teal-50 text-teal-600 border-teal-100'}`}>
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 block font-bold">Diet Style Configuration</span>
                  <span className="text-xs font-semibold">What is your diet type?</span>
                </div>
              </div>
              
              <div className="space-y-2 pt-1">
                <p className="text-[10px] text-slate-400 leading-normal">
                  Indicate your dietary requirements (e.g., Vegetarian, Vegan, Keto, Gluten-Free) or specific allergies. This instructs the virtual dietitian to customize focus guidelines and next intakes specifically to your style.
                </p>
                <input 
                  type="text"
                  placeholder="e.g. Vegetarian, vegan, keto, no raw meat..."
                  value={dietType}
                  onChange={(e) => setDietType(e.target.value)}
                  className={`w-full text-xs p-2.5 border rounded-lg focus:outline-none placeholder-slate-400 ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                />
              </div>
            </div>

            {/* Body Weight Input Card */}
            <div className={`border rounded-2xl p-5 shadow-sm space-y-4 text-left transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-zinc-150'}`}>
              <div className="flex gap-2 items-center">
                <div className={`p-2 rounded-xl h-fit border shrink-0 ${themeMode === 'dark' ? 'bg-teal-950/40 text-teal-400 border-teal-900/60' : 'bg-teal-50 text-teal-600 border-teal-100'}`}>
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 block font-bold">Body Metrics Setup</span>
                  <span className="text-xs font-semibold">What is your body weight?</span>
                </div>
              </div>
              
              <div className="space-y-2 pt-1">
                <p className="text-[10px] text-slate-400 leading-normal">
                  Specify your body weight in kilograms (kg) to calculate your personalized daily protein intake goal (target is 1g of protein per 1 kg of body weight).
                </p>
                <div className="relative">
                  <input 
                    type="number"
                    min="1"
                    max="500"
                    placeholder="e.g. 70"
                    value={bodyWeight || ""}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : 0;
                      setBodyWeight(val);
                    }}
                    className={`w-full text-xs p-2.5 pr-8 border rounded-lg focus:outline-none placeholder-slate-400 ${themeMode === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">kg</span>
                </div>
              </div>
            </div>

            {/* In-App Theme Selector */}
            <div className={`border rounded-2xl p-5 shadow-sm space-y-4 transition-colors duration-300 ${themeMode === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200/80'}`}>
              <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 block font-bold">System Preference</span>
              
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setThemeMode("light")}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer border transition-all ${
                    themeMode === "light"
                      ? "bg-teal-50 border-teal-200 text-teal-600 shadow-sm font-bold"
                      : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-850/50"
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  Light Theme
                </button>
                <button
                  onClick={() => setThemeMode("dark")}
                  className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer border transition-all ${
                    themeMode === "dark"
                      ? "bg-slate-850 border-slate-700 text-teal-400 font-bold shadow-sm shadow-teal-500/5"
                      : "bg-slate-50 border-slate-250 text-slate-550 hover:text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  Dark Theme
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Premium Constrained Sticky Bottom Tab Navigation Pane */}
        <div className={`fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-md transition-all duration-350 ${
          themeMode === 'dark' 
            ? 'bg-slate-900/95 border-slate-800 text-slate-400' 
            : 'bg-white/95 border-teal-100 text-slate-500'
        }`}>
          <nav className="max-w-md mx-auto px-4 py-2 flex justify-around items-center">
            <button
              onClick={() => {
                setActiveTab("balance");
                setErrorMessage(null);
              }}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl cursor-pointer transition-all border-0 bg-transparent ${
                activeTab === "balance"
                  ? 'text-teal-500 font-bold scale-105'
                  : 'hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Scale className="w-5 h-5" />
              <span className="text-[9px] font-mono tracking-wider uppercase font-bold">Balance</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("history");
                setErrorMessage(null);
              }}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl cursor-pointer transition-all border-0 bg-transparent ${
                activeTab === "history"
                  ? 'text-teal-500 font-bold scale-105'
                  : 'hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Clock className="w-5 h-5" />
              <span className="text-[9px] font-mono tracking-wider uppercase font-bold">History</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("settings");
                setErrorMessage(null);
              }}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl cursor-pointer transition-all border-0 bg-transparent ${
                activeTab === "settings"
                  ? 'text-teal-500 font-bold scale-105'
                  : 'hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="text-[9px] font-mono tracking-wider uppercase font-bold">Settings</span>
            </button>
          </nav>
        </div>

        {/* Informative Footer */}
        <div className="footer text-center space-y-1 py-4">
          <p className="text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 text-slate-400">
            <Info className="w-3.5 h-3.5" />
            Designed For Physical Liberation & Wellness
          </p>
        </div>

      </main>
    </div>
  );
}
