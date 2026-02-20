
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import "firebase/compat/firestore";
import "firebase/compat/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA6a-dg6TuGIiYgIX9HNBzFOuGUya8yy8c",
  authDomain: "chinese-ad-7e96a.firebaseapp.com",
  databaseURL: "https://chinese-ad-7e96a-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chinese-ad-7e96a",
  storageBucket: "chinese-ad-7e96a.firebasestorage.app",
  messagingSenderId: "998693750920",
  appId: "1:998693750920:web:a89235e2bb6458eb8eb73d",
  measurementId: "G-BY2WM564FR"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const app = firebase.app();

// Initialize Analytics conditionally
let analytics;
if (typeof window !== 'undefined') {
  try {
    analytics = firebase.analytics();
  } catch (e) {
    console.warn("Analytics failed to load", e);
  }
}

// Initialize Services
export const auth = app.auth();
export const db = app.firestore();
export const googleProvider = new firebase.auth.GoogleAuthProvider();

// Enable Persistence safely
// We handle the 'unimplemented' and 'failed-precondition' errors that frequently occur
// in dev environments or when multiple tabs are open.
if (typeof window !== 'undefined') {
  try {
    // Note: Google recently deprecated enableMultiTabIndexedDbPersistence in favor of new cache settings.
    // We'll try to enable persistence without specific tab synchronization options to avoid the warning,
    // or just accept that it might be single-tab.
    db.enablePersistence().catch((err) => {
      if (err.code === 'failed-precondition') {
          // Multiple tabs open, persistence can only be enabled in one tab at a time.
          console.warn('Firestore persistence enabled in another tab');
      } else if (err.code === 'unimplemented') {
          // The current browser does not support all of the features required to enable persistence
          console.warn('Firestore persistence not supported');
      } else {
          // Swallow other warnings to keep console clean (including deprecation warnings if they come as errors)
          console.debug('Firestore persistence warning:', err);
      }
    });
  } catch (e) {
    console.warn("Firestore persistence init error", e);
  }
}

// Auth Helpers
export const signInWithGoogle = async () => {
  const result = await auth.signInWithPopup(googleProvider);
  return result.user;
};

export const loginEmailPassword = async (email: string, password: string) => {
  const result = await auth.signInWithEmailAndPassword(email, password);
  return result.user;
};

export const registerEmailPassword = async (email: string, password: string) => {
  const result = await auth.createUserWithEmailAndPassword(email, password);
  return result.user;
};

export const logout = async () => {
  await auth.signOut();
};
