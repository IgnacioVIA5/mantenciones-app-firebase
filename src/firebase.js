// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAwBnvWXLKO7ctOwmHYf4SO2CACz1D6ADI",
  authDomain: "mantenciones-v-5.firebaseapp.com",
  projectId: "mantenciones-v-5",
  storageBucket: "mantenciones-v-5.firebasestorage.app",
  messagingSenderId: "294743117767",
  appId: "1:294743117767:web:27f28d9e2276484308d3e2",
  measurementId: "G-84565JJ9L0",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function ensureAnonAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser;
}
