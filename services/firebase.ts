import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// Configuration from Firebase Console
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
let app;
if (!firebase.apps.length) {
  try {
    app = firebase.initializeApp(firebaseConfig);
  } catch (e) {
    console.warn("Firebase initialization error:", e);
  }
} else {
  app = firebase.app();
}

// Export services used by the app
export const auth = firebase.auth();
export const db = firebase.firestore();
export const googleProvider = new firebase.auth.GoogleAuthProvider();

// Force account selection to allow users to switch accounts
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Auth Helpers
export const loginEmailPassword = async (email: string, pass: string) => {
  return await auth.signInWithEmailAndPassword(email, pass);
};

export const registerEmailPassword = async (email: string, pass: string) => {
  return await auth.createUserWithEmailAndPassword(email, pass);
};

export const signInWithGoogle = async () => {
  return await auth.signInWithPopup(googleProvider);
};

export const logout = async () => {
  try {
    await auth.signOut();
  } catch (error) {
    console.error("Error signing out", error);
  }
};
