import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Force account selection to allow users to switch accounts
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const loginEmailPassword = async (email: string, pass: string) => {
  return await signInWithEmailAndPassword(auth, email, pass);
};

export const registerEmailPassword = async (email: string, pass: string) => {
  return await createUserWithEmailAndPassword(auth, email, pass);
};

export const signInWithGoogle = async () => {
  // We propagate the error so the UI can show specific messages (like unauthorized domain)
  return await signInWithPopup(auth, googleProvider);
};

export const logout = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
  }
};