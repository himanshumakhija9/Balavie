import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBZGrwi9G3hC3LFja3blyHEzGmhb3vdu80",
  authDomain: "tactile-bonus-3vrbg.firebaseapp.com",
  projectId: "tactile-bonus-3vrbg",
  storageBucket: "tactile-bonus-3vrbg.firebasestorage.app",
  messagingSenderId: "240819892112",
  appId: "1:240819892112:web:d64281e832af421dbc8d15"
};

// Initialize Firebase client
export const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID from config
export const db = getFirestore(app, "ai-studio-d8c92de9-8b17-410c-9fb2-f30d0f050c3f");

// Initialize Auth
export const auth = getAuth(app);

// Initialize Google provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});
