
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { HSKLevel, VocabCard, ChatMessage, AppLanguage, PronunciationAttempt, UserGoals, DailyProgress } from '../types';
import { auth, db } from './firebase'; 

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
      examplePinyin?: string;
      exampleTranslation: string;
      level: HSKLevel;
      rating?: 'hard' | 'good' | 'easy';
      bookmarked?: boolean;
      customImage?: string; // Stored user image
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
    value: { key: string; value: UserGoals };
  };
  global_audio: {
    key: string; // text hash or cleaned text
    value: {
      text: string;
      audio: string; // base64
      timestamp: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<HSKTutorDB>>;
let cloudDisabled = false; // Circuit breaker for permissions

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<HSKTutorDB>('hsk-tutor-db', 4, {
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
        if (oldVersion < 4) {
          db.createObjectStore('global_audio', { keyPath: 'text' });
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

// --- Helper: Cloud Error Logging ---
const handleCloudError = (e: any, context: string) => {
  const msg = e?.message || '';
  // Check for various permission denied signatures
  if (msg.includes('Missing or insufficient permissions') || e?.code === 'permission-denied' || msg.includes('Permission denied')) {
     if (!cloudDisabled) {
         console.warn(`[${context}] Cloud permission denied. Disabling cloud sync for this session to prevent errors.`);
         cloudDisabled = true;
     }
  } else {
     console.debug(`[${context}] Cloud skipped:`, e);
  }
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

  if (user && !cloudDisabled) {
    // CLOUD (Compat)
    try {
      const resultsRef = db.collection('users').doc(user.uid).collection('results');
      await withTimeout(resultsRef.add(data));
      savedToCloud = true;
    } catch (e) {
      handleCloudError(e, 'saveResult');
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

  if (user && !cloudDisabled) {
    // CLOUD (Compat)
    try {
      const resultsRef = db.collection('users').doc(user.uid).collection('results');
      const q = resultsRef.orderBy('timestamp', 'desc').limit(20);
      const snapshot = await withTimeout(q.get()) as any;
      snapshot.forEach((doc: any) => results.push(doc.data()));
      fetchedFromCloud = true;
    } catch (e) {
       handleCloudError(e, 'getRecentResults');
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

export const saveVocabCustomImage = async (card: VocabCard, imageBase64: string) => {
  const user = getUser();
  const dataToMerge = { customImage: imageBase64 };

  let savedToCloud = false;

  if (user && !cloudDisabled) {
    try {
      const docRef = db.collection('users').doc(user.uid).collection('vocabulary').doc(card.character);
      await withTimeout(docRef.set(dataToMerge, { merge: true }));
      savedToCloud = true;
    } catch (e) {
      handleCloudError(e, 'saveVocabCustomImage');
    }
  }

  // Local
  try {
    const localDb = await initDB();
    const tx = localDb.transaction('vocabulary', 'readwrite');
    const store = tx.objectStore('vocabulary');
    const existing = await store.get(card.character);
    
    // We must reconstruct the full object for IndexedDB put
    const merged = {
       ...card,
       ...(existing || {}),
       customImage: imageBase64
    };
    
    await store.put(merged);
    await tx.done;
  } catch (e) {
    console.error("Failed to save custom image locally", e);
  }
};

export const saveVocabProgress = async (card: VocabCard, level: HSKLevel, rating: 'hard' | 'good' | 'easy') => {
  const user = getUser();
  // We need to fetch existing first to ensure we don't overwrite customImage or bookmarks if they aren't in `card`
  let existingCustomImage = card.customImage;
  let existingBookmarked = card.bookmarked;

  // Optimistic local check for existing data if card prop is missing it
  if (!existingCustomImage || existingBookmarked === undefined) {
      try {
          const localDb = await initDB();
          const localExisting = await localDb.get('vocabulary', card.character);
          if (localExisting) {
              if (!existingCustomImage) existingCustomImage = localExisting.customImage;
              if (existingBookmarked === undefined) existingBookmarked = localExisting.bookmarked;
          }
      } catch(e) {}
  }

  const vocabData = {
    character: card.character,
    pinyin: card.pinyin,
    translation: card.translation,
    exampleSentence: card.exampleSentence,
    examplePinyin: card.examplePinyin || '',
    exampleTranslation: card.exampleTranslation,
    level,
    rating,
    bookmarked: existingBookmarked || false,
    customImage: existingCustomImage, // Preserve image
    lastReviewed: Date.now(),
  };

  let savedToCloud = false;

  if (user && !cloudDisabled) {
    // CLOUD (Compat)
    try {
      const docRef = db.collection('users').doc(user.uid).collection('vocabulary').doc(card.character);
      await withTimeout(docRef.set(vocabData, { merge: true }));
      savedToCloud = true;
    } catch (e) {
      handleCloudError(e, 'saveVocabProgress');
    }
  } 
  
  if (!savedToCloud) {
    // LOCAL
    try {
      const localDb = await initDB();
      await localDb.put('vocabulary', vocabData);
    } catch (e) {
      console.error("Failed to save vocab locally:", e);
    }
  }
};

export const toggleVocabBookmark = async (card: VocabCard, level: HSKLevel) => {
  const user = getUser();
  let newBookmarkState = !card.bookmarked;
  let savedToCloud = false;

  if (user && !cloudDisabled) {
    // CLOUD (Compat)
    try {
      const docRef = db.collection('users').doc(user.uid).collection('vocabulary').doc(card.character);
      const updateData = {
          character: card.character,
          pinyin: card.pinyin,
          translation: card.translation,
          exampleSentence: card.exampleSentence,
          examplePinyin: card.examplePinyin || '',
          exampleTranslation: card.exampleTranslation,
          level,
          bookmarked: newBookmarkState,
          lastReviewed: Date.now()
      };
      await withTimeout(docRef.set(updateData, { merge: true }));
      savedToCloud = true;
    } catch (e) {
      handleCloudError(e, 'toggleVocabBookmark');
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
        examplePinyin: card.examplePinyin || (existing?.examplePinyin || ''),
        exampleTranslation: card.exampleTranslation,
        level,
        rating: existing?.rating,
        bookmarked: newBookmarkState,
        customImage: existing?.customImage, // Preserve image
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
  
  if (user && !cloudDisabled) {
    // CLOUD (Compat)
    try {
      const vocabRef = db.collection('users').doc(user.uid).collection('vocabulary');
      const q = vocabRef.where("bookmarked", "==", true).where("level", "==", level);
      const snapshot = await withTimeout(q.get()) as any;
      const cards = snapshot.docs.map((d: any) => d.data() as VocabCard);
      return cards;
    } catch (e) {
      handleCloudError(e, 'getBookmarkedWords');
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
        examplePinyin: v.examplePinyin,
        exampleTranslation: v.exampleTranslation,
        bookmarked: true,
        customImage: v.customImage
      }));
  } catch (e) {
    console.error("Failed to fetch local bookmarks:", e);
    return [];
  }
};

export const getVocabStats = async (level?: HSKLevel) => {
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

  if (user && !cloudDisabled) {
    // CLOUD (Compat)
    try {
      const vocabRef = db.collection('users').doc(user.uid).collection('vocabulary');
      const snapshot = await withTimeout(vocabRef.get()) as any;
      allVocab = snapshot.docs.map((d: any) => d.data());
      fetchedFromCloud = true;
    } catch (e) {
      handleCloudError(e, 'getVocabStats');
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

  if (level) {
    allVocab = allVocab.filter(v => v.level === level);
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
    if (user && !cloudDisabled) {
        try {
            const vocabRef = db.collection('users').doc(user.uid).collection('vocabulary');
            const snap = await withTimeout(vocabRef.get()) as any;
            allVocab = snap.docs.map((d: any) => d.data());
        } catch(e) { handleCloudError(e, 'getUserStats-vocab'); }
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
     if (user && !cloudDisabled) {
         try {
             const resRef = db.collection('users').doc(user.uid).collection('results');
             const snap = await withTimeout(resRef.get()) as any;
             allResults = snap.docs.map((d: any) => d.data());
         } catch(e) { handleCloudError(e, 'getUserStats-results'); }
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

// --- Global Audio Cache API ---

export const getCachedAudio = async (text: string): Promise<string | null> => {
  // 1. Check Local IndexedDB
  try {
    const localDb = await initDB();
    const cached = await localDb.get('global_audio', text);
    if (cached) {
      return cached.audio;
    }
  } catch (e) {
    console.warn("Local audio cache fetch failed", e);
  }

  // 2. Check Cloud (Firestore) - Shared global collection
  try {
    if (cloudDisabled) return null;
    
    // Clean text to avoid invalid ID characters, or use query
    const audioRef = db.collection('global_audio_cache');
    const q = audioRef.where("text", "==", text).limit(1);
    const snapshot = await withTimeout(q.get(), 1500) as any;
    
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      // Cache it locally for next time
      try {
         const localDb = await initDB();
         await localDb.put('global_audio', {
             text: text,
             audio: data.audio,
             timestamp: Date.now()
         });
      } catch(e) {}

      return data.audio;
    }
  } catch (e) {
    handleCloudError(e, 'getCachedAudio');
  }

  return null;
};

export const saveCachedAudio = async (text: string, audioBase64: string) => {
  // 1. Save to Local DB
  try {
     const localDb = await initDB();
     await localDb.put('global_audio', {
         text: text,
         audio: audioBase64,
         timestamp: Date.now()
     });
  } catch (e) {
     console.warn("Local audio save failed", e);
  }

  // 2. Save to Cloud (Global) - Best effort, don't block
  const user = getUser();
  if (user && !cloudDisabled) {
    try {
       // Check if exists first to avoid duplicate heavy writes
       const audioRef = db.collection('global_audio_cache');
       const q = audioRef.where("text", "==", text).limit(1);
       const snapshot = await q.get();
       
       if (snapshot.empty) {
           await audioRef.add({
               text: text,
               audio: audioBase64,
               timestamp: Date.now(),
               contributor: user.uid // Optional: track who generated it
           });
       }
    } catch (e) {
       handleCloudError(e, 'saveCachedAudio');
    }
  }
};


// --- Chat History API ---

export const saveChatMessage = async (msg: ChatMessage) => {
  const user = getUser();
  if (user && !cloudDisabled) {
    try {
      const chatRef = db.collection('users').doc(user.uid).collection('chat_history').doc(msg.id);
      await withTimeout(chatRef.set({
        ...msg,
        timestamp: Date.now()
      }));
    } catch (e) {
      handleCloudError(e, 'saveChatMessage');
    }
  }
};

export const updateMessageAudio = async (msgId: string, audioBase64: string) => {
  const user = getUser();
  if (user && !cloudDisabled) {
    try {
      const chatRef = db.collection('users').doc(user.uid).collection('chat_history').doc(msgId);
      await chatRef.set({ audio: audioBase64 }, { merge: true });
    } catch (e) {
      handleCloudError(e, 'updateMessageAudio');
    }
  }
};

export const getChatHistory = async (): Promise<ChatMessage[]> => {
  const user = getUser();
  if (!user || cloudDisabled) return [];
  
  try {
    const chatRef = db.collection('users').doc(user.uid).collection('chat_history');
    const q = chatRef.orderBy('timestamp', 'asc').limit(50);
    const snapshot = await withTimeout(q.get()) as any;
    return snapshot.docs.map((d: any) => {
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
    handleCloudError(e, 'getChatHistory');
    return [];
  }
};

export const clearChatHistory = async () => {
    const user = getUser();
    if (!user || cloudDisabled) return;
    try {
        const chatRef = db.collection('users').doc(user.uid).collection('chat_history');
        const snapshot = await chatRef.get();
        const batch = db.batch();
        snapshot.forEach((d: any) => batch.delete(d.ref));
        await batch.commit();
    } catch (e) {
        handleCloudError(e, 'clearChatHistory');
    }
};

// --- Pronunciation History ---

export const savePronunciationAttempt = async (attempt: PronunciationAttempt) => {
  const user = getUser();
  const id = `${attempt.word}_${attempt.timestamp}`;
  const data = { ...attempt, id };

  if (user && !cloudDisabled) {
    try {
      const ref = db.collection('users').doc(user.uid).collection('pronunciation_history').doc(id);
      await ref.set(data);
    } catch (e) {
      handleCloudError(e, 'savePronunciationAttempt');
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

  if (user && !cloudDisabled) {
    try {
      const ref = db.collection('users').doc(user.uid).collection('pronunciation_history');
      const q = ref.where("word", "==", word).orderBy("timestamp", "desc").limit(10);
      const snap = await q.get();
      results = snap.docs.map((d: any) => d.data() as PronunciationAttempt);
    } catch (e) {
      handleCloudError(e, 'getPronunciationHistory');
    }
  }

  if (results.length === 0) {
    try {
      const localDb = await initDB();
      results = await localDb.getAllFromIndex('pronunciation_history', 'by-word', word);
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
  
  if (user && !cloudDisabled) {
    try {
      const ref = db.collection('users').doc(user.uid).collection('settings').doc('goals');
      await ref.set(goals);
    } catch (e) { handleCloudError(e, 'saveUserGoals'); }
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

  if (user && !cloudDisabled) {
    try {
      const ref = db.collection('users').doc(user.uid).collection('settings').doc('goals');
      const snap = await ref.get();
      if (snap.exists) return { ...defaultGoals, ...snap.data() } as UserGoals;
    } catch (e) { handleCloudError(e, 'getUserGoals'); }
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

  if (user && !cloudDisabled) {
    try {
      const ref = db.collection('users').doc(user.uid).collection('daily_stats').doc(dateKey);
      const snap = await ref.get();
      const current = snap.exists ? snap.data() : {};
      await ref.set({ 
        ...current,
        date: dateKey, 
        minutes: (current?.minutes || 0) + minutes 
      }, { merge: true });
    } catch (e) { handleCloudError(e, 'updateStudyTime'); }
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

  if (user && !cloudDisabled) {
    try {
      const ref = db.collection('users').doc(user.uid).collection('daily_stats').doc(dateKey);
      const snap = await ref.get();
      const current = snap.exists ? snap.data() : {};
      await ref.set({ 
        ...current,
        date: dateKey, 
        speakingMinutes: (current?.speakingMinutes || 0) + minutes 
      }, { merge: true });
    } catch (e) { handleCloudError(e, 'updateSpeakingTime'); }
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
  if (user && !cloudDisabled) {
    try {
      const ref = db.collection('users').doc(user.uid).collection('daily_stats').doc(dateKey);
      const snap = await ref.get();
      if (snap.exists) {
        const d = snap.data();
        minutes = d?.minutes || 0;
        speakingMinutes = d?.speakingMinutes || 0;
      }
    } catch (e) {
      handleCloudError(e, 'getDailyProgress-stats');
    }
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
  if (user && !cloudDisabled) {
    try {
        const ref = db.collection('users').doc(user.uid).collection('vocabulary');
        const q = ref.where("lastReviewed", ">=", startOfDay);
        const snap = await q.get();
        words = snap.size;
    } catch(e) { handleCloudError(e, 'getDailyProgress-vocab'); }
    
    try {
        const ref = db.collection('users').doc(user.uid).collection('pronunciation_history');
        const q = ref.where("timestamp", ">=", startOfDay);
        const snap = await q.get();
        pronCount = snap.size;
    } catch(e) { handleCloudError(e, 'getDailyProgress-pron'); }

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
