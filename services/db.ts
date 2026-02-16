import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { HSKLevel, VocabCard, ChatMessage, AppLanguage, PronunciationAttempt, UserGoals, DailyProgress } from '../types';
import { auth, db } from './firebase'; // Import Firebase
import { collection, addDoc, query, where, getDocs, orderBy, limit, doc, setDoc, deleteDoc, getDoc, QuerySnapshot, DocumentData } from 'firebase/firestore';

interface HSKTutorDB extends DBSchema {
  results: {
    key: number;
    value: {
      type: 'quiz' | 'exam';
      score: number;
      total: number;
      level: HSKLevel;
      date: string;
      timestamp: number;
    };
    indexes: { 'by-date': number };
  };
  vocabulary: {
    key: string; // character as key
    value: {
      character: string;
      pinyin: string;
      translation: string;
      exampleSentence: string;
      exampleTranslation: string;
      level: HSKLevel;
      rating?: 'hard' | 'good' | 'easy';
      bookmarked?: boolean;
      lastReviewed: number;
    };
  };
  pronunciation_history: {
    key: string;
    value: PronunciationAttempt;
    indexes: { 'by-word': string, 'by-timestamp': number };
  };
  daily_stats: {
    key: string; // YYYY-MM-DD
    value: {
      date: string;
      minutes: number;
      speakingMinutes?: number;
    };
  };
  user_goals: {
    key: string; // 'goals'
    value: UserGoals;
  };
}

let dbPromise: Promise<IDBPDatabase<HSKTutorDB>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<HSKTutorDB>('hsk-tutor-db', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const resultStore = db.createObjectStore('results', { keyPath: 'id', autoIncrement: true });
          resultStore.createIndex('by-date', 'timestamp');
          db.createObjectStore('vocabulary', { keyPath: 'character' });
        }
        if (oldVersion < 2) {
          const pronStore = db.createObjectStore('pronunciation_history', { keyPath: 'id' });
          pronStore.createIndex('by-word', 'word');
          pronStore.createIndex('by-timestamp', 'timestamp');
        }
        if (oldVersion < 3) {
          db.createObjectStore('daily_stats', { keyPath: 'date' });
          db.createObjectStore('user_goals', { keyPath: 'key' }); // dummy key 'goals'
        }
      },
    });
  }
  return dbPromise;
};

// --- Helper to check Auth ---
const getUser = () => auth.currentUser;

// --- Helper: Timeout for Cloud Ops ---
const withTimeout = <T>(promise: Promise<T>, ms: number = 2000): Promise<T> => {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("Firestore operation timed out"));
        }, ms);
        promise
            .then(res => {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
};

// --- Results API ---

export const saveResult = async (type: 'quiz' | 'exam', score: number, total: number, level: HSKLevel) => {
  const user = getUser();
  const data = {
    type,
    score,
    total,
    level,
    date: new Date().toLocaleDateString(),
    timestamp: Date.now(),
  };

  let savedToCloud = false;

  if (user) {
    // CLOUD
    try {
      const resultsRef = collection(db, 'users', user.uid, 'results');
      await withTimeout(addDoc(resultsRef, data));
      savedToCloud = true;
    } catch (e) {
      console.debug("Cloud save skipped (offline/timeout):", e);
    }
  } 
  
  if (!savedToCloud) {
    // LOCAL
    try {
      const localDb = await initDB();
      await localDb.add('results', data as any);
    } catch (e) {
      console.error("Failed to save result locally:", e);
    }
  }
};

export const getRecentResults = async () => {
  const user = getUser();
  const results: any[] = [];
  let fetchedFromCloud = false;

  if (user) {
    // CLOUD
    try {
      const resultsRef = collection(db, 'users', user.uid, 'results');
      const q = query(resultsRef, orderBy('timestamp', 'desc'), limit(20));
      const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(q));
      snapshot.forEach(doc => results.push(doc.data()));
      fetchedFromCloud = true;
    } catch (e) {
       console.debug("Cloud fetch skipped (offline/timeout):", e);
    }
  } 
  
  if (!fetchedFromCloud) {
    // LOCAL
    try {
      const localDb = await initDB();
      const tx = localDb.transaction('results', 'readonly');
      const index = tx.store.index('by-date');
      let cursor = await index.openCursor(null, 'prev');
      let count = 0;
      while (cursor && count < 20) {
        results.push(cursor.value);
        count++;
        cursor = await cursor.continue();
      }
    } catch (e) {
      console.error("Failed to fetch local results:", e);
    }
  }
  return results; 
};

// --- Vocabulary API ---

export const saveVocabProgress = async (card: VocabCard, level: HSKLevel, rating: 'hard' | 'good' | 'easy') => {
  const user = getUser();
  const vocabData = {
    character: card.character,
    pinyin: card.pinyin,
    translation: card.translation,
    exampleSentence: card.exampleSentence,
    exampleTranslation: card.exampleTranslation,
    level,
    rating,
    lastReviewed: Date.now(),
  };

  let savedToCloud = false;

  if (user) {
    // CLOUD
    try {
      const docRef = doc(db, 'users', user.uid, 'vocabulary', card.character);
      await withTimeout(setDoc(docRef, vocabData, { merge: true }));
      savedToCloud = true;
    } catch (e) {
      console.debug("Cloud save skipped (offline/timeout):", e);
    }
  } 
  
  if (!savedToCloud) {
    // LOCAL
    try {
      const localDb = await initDB();
      const tx = localDb.transaction('vocabulary', 'readwrite');
      const store = tx.objectStore('vocabulary');
      const existing = await store.get(card.character);
      
      await store.put({
        ...vocabData,
        bookmarked: existing?.bookmarked || false,
      });
      await tx.done;
    } catch (e) {
      console.error("Failed to save vocab locally:", e);
    }
  }
};

export const toggleVocabBookmark = async (card: VocabCard, level: HSKLevel) => {
  const user = getUser();
  let newBookmarkState = !card.bookmarked;
  let savedToCloud = false;

  if (user) {
    // CLOUD
    try {
      const docRef = doc(db, 'users', user.uid, 'vocabulary', card.character);
      const updateData = {
          character: card.character,
          pinyin: card.pinyin,
          translation: card.translation,
          exampleSentence: card.exampleSentence,
          exampleTranslation: card.exampleTranslation,
          level,
          bookmarked: newBookmarkState,
          lastReviewed: Date.now()
      };
      await withTimeout(setDoc(docRef, updateData, { merge: true }));
      savedToCloud = true;
    } catch (e) {
      console.debug("Cloud toggle skipped (offline/timeout):", e);
    }
  } 
  
  if (!savedToCloud) {
    // LOCAL
    try {
      const localDb = await initDB();
      const tx = localDb.transaction('vocabulary', 'readwrite');
      const store = tx.objectStore('vocabulary');
      const existing = await store.get(card.character);
      
      const currentState = existing ? !!existing.bookmarked : card.bookmarked;
      newBookmarkState = !currentState;

      await store.put({
        character: card.character,
        pinyin: card.pinyin,
        translation: card.translation,
        exampleSentence: card.exampleSentence,
        exampleTranslation: card.exampleTranslation,
        level,
        rating: existing?.rating,
        bookmarked: newBookmarkState,
        lastReviewed: Date.now(),
      });
      await tx.done;
    } catch (e) {
      console.error("Failed to toggle bookmark locally:", e);
    }
  }
  
  return newBookmarkState;
};

export const getBookmarkedWords = async (level: HSKLevel): Promise<VocabCard[]> => {
  const user = getUser();
  
  if (user) {
    // CLOUD
    try {
      const vocabRef = collection(db, 'users', user.uid, 'vocabulary');
      const q = query(vocabRef, where("bookmarked", "==", true), where("level", "==", level));
      const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(q));
      const cards = snapshot.docs.map(d => d.data() as VocabCard);
      return cards;
    } catch (e) {
      console.debug("Cloud bookmarks fetch skipped (offline/timeout):", e);
    }
  } 
  
  // LOCAL
  try {
    const localDb = await initDB();
    const allVocab = await localDb.getAll('vocabulary');
    return allVocab
      .filter(v => v.bookmarked === true && v.level === level)
      .map(v => ({
        character: v.character,
        pinyin: v.pinyin,
        translation: v.translation,
        exampleSentence: v.exampleSentence,
        exampleTranslation: v.exampleTranslation,
        bookmarked: true
      }));
  } catch (e) {
    console.error("Failed to fetch local bookmarks:", e);
    return [];
  }
};

export const getVocabStats = async () => {
  const user = getUser();
  const last7Days: Record<string, number> = {};
  const today = new Date();
  
  for(let i=6; i>=0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      last7Days[dayName] = 0;
  }

  let allVocab: any[] = [];
  let fetchedFromCloud = false;

  if (user) {
    // CLOUD
    try {
      const vocabRef = collection(db, 'users', user.uid, 'vocabulary');
      const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(vocabRef));
      allVocab = snapshot.docs.map(d => d.data());
      fetchedFromCloud = true;
    } catch (e) {
      console.debug("Cloud stats fetch skipped (offline/timeout):", e);
    }
  } 
  
  if (!fetchedFromCloud) {
    // LOCAL
    try {
      const localDb = await initDB();
      allVocab = await localDb.getAll('vocabulary');
    } catch (e) {
      console.error("Failed to fetch local stats:", e);
    }
  }

  allVocab.forEach(v => {
      const d = new Date(v.lastReviewed);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      if (last7Days[dayName] !== undefined) {
          last7Days[dayName]++;
      }
  });

  return Object.keys(last7Days).map(key => ({
      name: key,
      words: last7Days[key]
  }));
};

export const getUserStats = async () => {
  const user = getUser();
  let totalWords = 0;
  let quizAverage = 0;
  let examsTaken = 0;

  // Vocab Stats
  try {
    let allVocab: any[] = [];
    if (user) {
        try {
            const vocabRef = collection(db, 'users', user.uid, 'vocabulary');
            const snap = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(vocabRef));
            allVocab = snap.docs.map(d => d.data());
        } catch(e) { /* ignore offline */ }
    }
    if (allVocab.length === 0) {
        const localDb = await initDB();
        allVocab = await localDb.getAll('vocabulary');
    }
    totalWords = allVocab.length;
  } catch(e) { console.error(e); }

  // Result Stats
  try {
     let allResults: any[] = [];
     if (user) {
         try {
             const resRef = collection(db, 'users', user.uid, 'results');
             const snap = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(resRef));
             allResults = snap.docs.map(d => d.data());
         } catch(e) { /* ignore offline */ }
     }
     if (allResults.length === 0) {
         const localDb = await initDB();
         allResults = await localDb.getAll('results');
     }

     const quizzes = allResults.filter(r => r.type === 'quiz');
     const exams = allResults.filter(r => r.type === 'exam');
     
     examsTaken = exams.length;
     
     if (quizzes.length > 0) {
         const totalPct = quizzes.reduce((acc, curr) => acc + ((curr.score / curr.total) * 100), 0);
         quizAverage = Math.round(totalPct / quizzes.length);
     }

  } catch(e) { console.error(e); }

  return { totalWords, quizAverage, examsTaken };
};

export const getGoalAdvice = async (level: HSKLevel, language: AppLanguage = AppLanguage.EN): Promise<string> => {
    return "Keep practicing with the AI Tutor to improve your grammar and natural phrasing!";
};

// --- Chat History API ---

export const saveChatMessage = async (msg: ChatMessage) => {
  const user = getUser();
  if (user) {
    try {
      const chatRef = collection(db, 'users', user.uid, 'chat_history');
      await withTimeout(setDoc(doc(chatRef, msg.id), {
        ...msg,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.debug("Cloud chat save skipped", e);
    }
  }
};

export const updateMessageAudio = async (msgId: string, audioBase64: string) => {
  const user = getUser();
  if (user) {
    try {
      const chatRef = doc(db, 'users', user.uid, 'chat_history', msgId);
      await setDoc(chatRef, { audio: audioBase64 }, { merge: true });
    } catch (e) {
      console.debug("Cloud audio update skipped", e);
    }
  }
};

export const getChatHistory = async (): Promise<ChatMessage[]> => {
  const user = getUser();
  if (!user) return [];
  
  try {
    const chatRef = collection(db, 'users', user.uid, 'chat_history');
    const q = query(chatRef, orderBy('timestamp', 'asc'), limit(50));
    const snapshot = await withTimeout<QuerySnapshot<DocumentData>>(getDocs(q));
    return snapshot.docs.map(d => {
        const data = d.data();
        return {
            id: data.id,
            role: data.role,
            text: data.text,
            image: data.image,
            audio: data.audio,
            groundingUrls: data.groundingUrls
        } as ChatMessage;
    });
  } catch (e) {
    console.debug("Cloud chat fetch error", e);
    return [];
  }
};

export const clearChatHistory = async () => {
    const user = getUser();
    if (!user) return;
    try {
        const chatRef = collection(db, 'users', user.uid, 'chat_history');
        const snapshot = await getDocs(chatRef);
        const promises = snapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(promises);
    } catch (e) {
        console.error("Clear chat error", e);
    }
};

// --- Pronunciation History ---

export const savePronunciationAttempt = async (attempt: PronunciationAttempt) => {
  const user = getUser();
  const id = `${attempt.word}_${attempt.timestamp}`;
  const data = { ...attempt, id };

  if (user) {
    try {
      const ref = doc(db, 'users', user.uid, 'pronunciation_history', id);
      await setDoc(ref, data);
    } catch (e) {
      console.debug("Cloud pron save skipped", e);
    }
  }

  try {
    const localDb = await initDB();
    await localDb.put('pronunciation_history', data);
  } catch (e) {
    console.error("Local pron save failed", e);
  }
};

export const getPronunciationHistory = async (word: string): Promise<PronunciationAttempt[]> => {
  const user = getUser();
  let results: PronunciationAttempt[] = [];

  if (user) {
    try {
      const ref = collection(db, 'users', user.uid, 'pronunciation_history');
      const q = query(ref, where("word", "==", word), orderBy("timestamp", "desc"), limit(10));
      const snap = await getDocs(q);
      results = snap.docs.map(d => d.data() as PronunciationAttempt);
    } catch (e) {
      console.debug("Cloud pron fetch skipped", e);
    }
  }

  if (results.length === 0) {
    try {
      const localDb = await initDB();
      results = await localDb.getAllByIndex('pronunciation_history', 'by-word', word);
      results.sort((a, b) => b.timestamp - a.timestamp);
      results = results.slice(0, 10);
    } catch (e) {
      console.error("Local pron fetch failed", e);
    }
  }

  return results;
};

// --- Goals & Daily Progress ---

export const saveUserGoals = async (goals: UserGoals) => {
  const user = getUser();
  
  if (user) {
    try {
      const ref = doc(db, 'users', user.uid, 'settings', 'goals');
      await setDoc(ref, goals);
    } catch (e) { console.debug("Cloud goal save skipped", e); }
  }

  try {
    const localDb = await initDB();
    await localDb.put('user_goals', { key: 'goals', value: goals } as any);
  } catch (e) { console.error("Local goal save failed", e); }
};

export const getUserGoals = async (): Promise<UserGoals> => {
  const user = getUser();
  const defaultGoals: UserGoals = { 
    dailyWords: 10, 
    dailyMinutes: 15,
    dailySpeakingMinutes: 5,
    dailyPronunciation: 10
  };

  if (user) {
    try {
      const ref = doc(db, 'users', user.uid, 'settings', 'goals');
      const snap = await getDoc(ref);
      if (snap.exists()) return { ...defaultGoals, ...snap.data() } as UserGoals;
    } catch (e) { console.debug("Cloud goal fetch skipped", e); }
  }

  try {
    const localDb = await initDB();
    const data = await localDb.get('user_goals', 'goals');
    if (data) return { ...defaultGoals, ...data.value };
  } catch (e) { console.error("Local goal fetch failed", e); }

  return defaultGoals;
};

export const updateStudyTime = async (minutes: number) => {
  const user = getUser();
  const dateKey = new Date().toISOString().split('T')[0];

  if (user) {
    try {
      const ref = doc(db, 'users', user.uid, 'daily_stats', dateKey);
      const snap = await getDoc(ref);
      const current = snap.exists() ? snap.data() : {};
      await setDoc(ref, { 
        ...current,
        date: dateKey, 
        minutes: (current.minutes || 0) + minutes 
      }, { merge: true });
    } catch (e) { console.debug("Cloud time update skipped", e); }
  }

  try {
    const localDb = await initDB();
    const existing = await localDb.get('daily_stats', dateKey);
    const currentMinutes = existing ? existing.minutes : 0;
    const currentSpeaking = existing ? existing.speakingMinutes || 0 : 0;
    await localDb.put('daily_stats', { date: dateKey, minutes: currentMinutes + minutes, speakingMinutes: currentSpeaking });
  } catch (e) { console.error("Local time update failed", e); }
};

export const updateSpeakingTime = async (minutes: number) => {
  const user = getUser();
  const dateKey = new Date().toISOString().split('T')[0];

  if (user) {
    try {
      const ref = doc(db, 'users', user.uid, 'daily_stats', dateKey);
      const snap = await getDoc(ref);
      const current = snap.exists() ? snap.data() : {};
      await setDoc(ref, { 
        ...current,
        date: dateKey, 
        speakingMinutes: (current.speakingMinutes || 0) + minutes 
      }, { merge: true });
    } catch (e) { console.debug("Cloud speaking time update skipped", e); }
  }

  try {
    const localDb = await initDB();
    const existing = await localDb.get('daily_stats', dateKey);
    const currentMinutes = existing ? existing.minutes : 0;
    const currentSpeaking = existing ? existing.speakingMinutes || 0 : 0;
    await localDb.put('daily_stats', { date: dateKey, minutes: currentMinutes, speakingMinutes: currentSpeaking + minutes });
  } catch (e) { console.error("Local speaking time update failed", e); }
};

export const getDailyProgress = async (): Promise<DailyProgress> => {
  const user = getUser();
  const dateKey = new Date().toISOString().split('T')[0];
  const startOfDay = new Date(dateKey).getTime();
  
  let minutes = 0;
  let speakingMinutes = 0;
  let words = 0;
  let pronCount = 0;

  // 1. Get Time Stats
  if (user) {
    try {
      const ref = doc(db, 'users', user.uid, 'daily_stats', dateKey);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data();
        minutes = d.minutes || 0;
        speakingMinutes = d.speakingMinutes || 0;
      }
    } catch (e) {}
  } else {
      try {
        const localDb = await initDB();
        const stat = await localDb.get('daily_stats', dateKey);
        if (stat) {
          minutes = stat.minutes || 0;
          speakingMinutes = stat.speakingMinutes || 0;
        }
      } catch (e) {}
  }

  // 2. Get Words Reviewed Today
  if (user) {
    try {
        const ref = collection(db, 'users', user.uid, 'vocabulary');
        const q = query(ref, where("lastReviewed", ">=", startOfDay));
        const snap = await getDocs(q);
        words = snap.size;
    } catch(e) {}
    
    try {
        const ref = collection(db, 'users', user.uid, 'pronunciation_history');
        const q = query(ref, where("timestamp", ">=", startOfDay));
        const snap = await getDocs(q);
        pronCount = snap.size;
    } catch(e) {}

  }

  // Fallback / Merge with local
  if (words === 0 || pronCount === 0) {
      try {
        const localDb = await initDB();
        if (words === 0) {
            const allVocab = await localDb.getAll('vocabulary');
            words = allVocab.filter(v => v.lastReviewed >= startOfDay).length;
        }
        if (pronCount === 0) {
            const allPron = await localDb.getAll('pronunciation_history');
            pronCount = allPron.filter(p => p.timestamp >= startOfDay).length;
        }
      } catch(e) {}
  }

  return { minutesSpent: minutes, wordsReviewed: words, speakingMinutes, pronunciationCount: pronCount };
};
