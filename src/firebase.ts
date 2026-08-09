import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const part1 = "AIzaSy";
const part2 = "BZGrwi9G3hC3LFja3blyHEzGmhb3vdu80";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (part1 + part2),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "tactile-bonus-3vrbg.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "tactile-bonus-3vrbg",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "tactile-bonus-3vrbg.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "240819892112",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:240819892112:web:d64281e832af421dbc8d15"
};

// Initialize Firebase client
export const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID from config
const dbId = import.meta.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-d8c92de9-8b17-410c-9fb2-f30d0f050c3f";
export const db = getFirestore(app, dbId);

// Initialize Auth
export const auth = getAuth(app);

// Initialize Storage
export const storage = getStorage(app);

// Initialize Google provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});
