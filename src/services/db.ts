import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { HSKLevel, VocabCard, ChatMessage, AppLanguage, PronunciationAttempt, UserGoals, DailyProgress } from '../types';
import { supabase } from './supabase';

// Keep IDB only for offline content batches and audio cache
interface HSKTutorDB extends DBSchema {
  global_audio: {
    key: string; // text hash or cleaned text
    value: {
      text: string;
      audio: string; // base64
      timestamp: number;
    };
  };
  offline_batches: {
    key: string; // e.g. 'vocab_hsk1_12345'
    value: {
      id: string;
      type: 'vocab' | 'quiz' | 'exam';
      level: HSKLevel;
      title: string;
      content: any;
      timestamp: number;
    };
    indexes: { 'by-type-level': [string, string] };
  };
}

let dbPromise: Promise<IDBPDatabase<HSKTutorDB>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<HSKTutorDB>('hsk-tutor-db-v2', 1, {
      upgrade(db) {
        db.createObjectStore('global_audio', { keyPath: 'text' });
        const batchStore = db.createObjectStore('offline_batches', { keyPath: 'id' });
        batchStore.createIndex('by-type-level', ['type', 'level']);
      },
    });
  }
  return dbPromise;
};

// --- Helper to get current user ID ---
const getUserId = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id;
};

// Helper to check for missing table errors
const isTableMissingError = (error: any) => {
  return error && (
    error.code === 'PGRST205' || // PostgREST: Could not find the table
    error.code === '42P01'       // Postgres: undefined_table
  );
};

// Helper to check for network errors (Failed to fetch)
const isNetworkError = (error: any) => {
  const msg = error?.message || error?.toString() || '';
  return msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network');
};

// Track warned tables to avoid spamming the console
const warnedTables = new Set<string>();

const logMissingTableWarning = (tableName: string, operation: string) => {
  if (!warnedTables.has(tableName)) {
    console.debug(`[Setup Required] Table '${tableName}' missing. ${operation} disabled.`);
    warnedTables.add(tableName);
  }
};

// --- Results API ---

export const saveResult = async (type: 'quiz' | 'exam', score: number, total: number, level: HSKLevel) => {
  try {
    const userId = await getUserId();
    if (!userId) return;

    const { error } = await supabase.from('results').insert({
      user_id: userId,
      type,
      score,
      total,
      level,
      date: new Date().toLocaleDateString(),
      timestamp: Date.now(),
    });

    if (error) {
      if (isTableMissingError(error)) {
        logMissingTableWarning('results', 'Saving results');
      } else {
        console.error('Error saving result:', error);
      }
    }
  } catch (e) {
    console.error("Network/Unexpected error in saveResult:", e);
  }
};

export const getRecentResults = async () => {
  try {
    const userId = await getUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(20);

    if (error) {
      if (isTableMissingError(error)) {
        logMissingTableWarning('results', 'Fetching results');
        return [];
      }
      if (!isNetworkError(error)) {
        console.error('Error fetching results:', error);
      }
      return [];
    }
    return data || [];
  } catch (e) {
    if (!isNetworkError(e)) {
       console.error("Network/Unexpected error in getRecentResults:", e);
    }
    return [];
  }
};

// --- Vocabulary API ---

export const saveVocabCustomImage = async (card: VocabCard, imageBase64: string, level: HSKLevel) => {
  const userId = await getUserId();
  if (!userId) return;

  // Upsert vocabulary item
  const { error } = await supabase.from('vocabulary').upsert({
    user_id: userId,
    character: card.character,
    custom_image: imageBase64,
    level,
    // We need to ensure other fields are present if it's a new insert, 
    // but upsert with just these might fail not-null constraints if it's new.
    // Ideally we should fetch first or provide all data. 
    // For now assuming the card object has most data or we just update the image.
    // Actually, to be safe, we should provide all fields from card.
    pinyin: card.pinyin,
    translation: card.translation,
    example_sentence: card.exampleSentence,
    example_pinyin: card.examplePinyin,
    example_translation: card.exampleTranslation,
    last_reviewed: Date.now()
  }, { onConflict: 'user_id, character' });

  if (error) {
    if (isTableMissingError(error)) {
       logMissingTableWarning('vocabulary', 'Saving custom image');
    } else {
       console.error('Error saving custom image:', error);
    }
  }
};

export const saveVocabProgress = async (card: VocabCard, level: HSKLevel, rating: 'hard' | 'good' | 'easy') => {
  const userId = await getUserId();
  if (!userId) return;

  // Strategy: Fetch existing to get bookmark/image status, then upsert.
  const { data: existing, error: fetchError } = await supabase
    .from('vocabulary')
    .select('bookmarked, custom_image, last_reviewed')
    .eq('user_id', userId)
    .eq('character', card.character)
    .single();
    
  if (fetchError && !isTableMissingError(fetchError) && fetchError.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
      console.warn("Error fetching existing vocab:", fetchError);
  }

  const now = Date.now();
  const todayStart = new Date().setHours(0,0,0,0);
  
  // If not reviewed today, increment daily stats
  if (!existing || !existing.last_reviewed || existing.last_reviewed < todayStart) {
      const dateKey = new Date().toISOString().split('T')[0];
      
      const { data: currentStats, error: statsError } = await supabase
        .from('daily_stats')
        .select('words_reviewed')
        .eq('user_id', userId)
        .eq('date', dateKey)
        .single();
      
      if (!statsError || isTableMissingError(statsError) || statsError.code === 'PGRST116') {
          const currentWords = currentStats?.words_reviewed || 0;
          
          const { error: upsertError } = await supabase.from('daily_stats').upsert({
              user_id: userId,
              date: dateKey,
              words_reviewed: currentWords + 1
          }, { onConflict: 'user_id, date' });
          
          if (upsertError && isTableMissingError(upsertError)) {
             logMissingTableWarning('daily_stats', 'Updating daily stats');
          }
      }
  }

  const { error } = await supabase.from('vocabulary').upsert({
    user_id: userId,
    character: card.character,
    pinyin: card.pinyin,
    translation: card.translation,
    example_sentence: card.exampleSentence,
    example_pinyin: card.examplePinyin || '',
    example_translation: card.exampleTranslation,
    level,
    rating,
    bookmarked: existing?.bookmarked || card.bookmarked || false,
    custom_image: existing?.custom_image || card.customImage,
    last_reviewed: Date.now(),
  }, { onConflict: 'user_id, character' });

  if (error) {
    if (isTableMissingError(error)) {
       logMissingTableWarning('vocabulary', 'Saving vocab progress');
    } else {
       console.error('Error saving vocab progress:', error);
    }
  }
};

export const toggleVocabBookmark = async (card: VocabCard, level: HSKLevel) => {
  const userId = await getUserId();
  if (!userId) return !card.bookmarked;

  const { data: existing, error: fetchError } = await supabase
    .from('vocabulary')
    .select('bookmarked, custom_image, rating')
    .eq('user_id', userId)
    .eq('character', card.character)
    .single();

  if (fetchError && isTableMissingError(fetchError)) {
      logMissingTableWarning('vocabulary', 'Toggling bookmark');
      return !card.bookmarked; // Optimistic toggle? Or fail? Let's fail safe.
  }

  const newBookmarkState = existing ? !existing.bookmarked : !card.bookmarked;

  const { error } = await supabase.from('vocabulary').upsert({
    user_id: userId,
    character: card.character,
    pinyin: card.pinyin,
    translation: card.translation,
    example_sentence: card.exampleSentence,
    example_pinyin: card.examplePinyin || '',
    example_translation: card.exampleTranslation,
    level,
    rating: existing?.rating,
    bookmarked: newBookmarkState,
    custom_image: existing?.custom_image || card.customImage,
    last_reviewed: Date.now(),
  }, { onConflict: 'user_id, character' });

  if (error) {
    if (isTableMissingError(error)) {
        logMissingTableWarning('vocabulary', 'Saving bookmark');
    } else {
        console.error('Error toggling bookmark:', error);
    }
    return !newBookmarkState; // Revert on error
  }
  return newBookmarkState;
};

export const getBookmarkedWords = async (level: HSKLevel): Promise<VocabCard[]> => {
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('vocabulary')
    .select('*')
    .eq('user_id', userId)
    .eq('bookmarked', true)
    .eq('level', level);

  if (error) {
    if (isTableMissingError(error)) {
        logMissingTableWarning('vocabulary', 'Fetching bookmarks');
        return [];
    }
    console.error('Error fetching bookmarks:', error);
    return [];
  }

  return data.map((v: any) => ({
    character: v.character,
    pinyin: v.pinyin,
    translation: v.translation,
    exampleSentence: v.example_sentence,
    examplePinyin: v.example_pinyin,
    exampleTranslation: v.example_translation,
    bookmarked: v.bookmarked,
    customImage: v.custom_image,
    level: v.level,
    rating: v.rating
  }));
};

export const getAllLearnedWords = async (): Promise<VocabCard[]> => {
  const userId = await getUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('vocabulary')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    if (isTableMissingError(error)) {
        logMissingTableWarning('vocabulary', 'Fetching learned words');
        return [];
    }
    console.error('Error fetching learned words:', error);
    return [];
  }

  return data.map((v: any) => ({
    character: v.character,
    pinyin: v.pinyin,
    translation: v.translation,
    exampleSentence: v.example_sentence,
    examplePinyin: v.example_pinyin,
    exampleTranslation: v.example_translation,
    bookmarked: v.bookmarked,
    customImage: v.custom_image,
    level: v.level,
    rating: v.rating
  }));
};

export const getVocabStats = async (level?: HSKLevel) => {
  try {
    const userId = await getUserId();
    if (!userId) return [];

    let query = supabase
      .from('vocabulary')
      .select('last_reviewed, level')
      .eq('user_id', userId);

    if (level) {
      query = query.eq('level', level);
    }

    const { data, error } = await query;

    if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('vocabulary', 'Fetching vocab stats');
          return [];
      }
      if (!isNetworkError(error)) {
          console.error('Error fetching vocab stats:', error);
      }
      return [];
    }

    const last7Days: Record<string, number> = {};
    const today = new Date();
    
    for(let i=6; i>=0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        last7Days[dayName] = 0;
    }

    data.forEach((v: any) => {
        if (!v.last_reviewed) return;
        const d = new Date(v.last_reviewed);
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        if (last7Days[dayName] !== undefined) {
            last7Days[dayName]++;
        }
    });

    return Object.keys(last7Days).map(key => ({
        name: key,
        words: last7Days[key]
    }));
  } catch (e) {
    if (!isNetworkError(e)) {
       console.error("Network/Unexpected error in getVocabStats:", e);
    }
    return [];
  }
};

export const getUserStats = async () => {
  const userId = await getUserId();
  if (!userId) return { totalWords: 0, quizAverage: 0, examsTaken: 0 };

  try {
    // Parallel fetch
    const [vocabRes, resultsRes] = await Promise.all([
      supabase.from('vocabulary').select('id', { count: 'exact' }).eq('user_id', userId),
      supabase.from('results').select('score, total, type').eq('user_id', userId)
    ]);

    // Handle missing tables gracefully
    if (vocabRes.error && isTableMissingError(vocabRes.error)) {
        logMissingTableWarning('vocabulary', 'Fetching user stats');
    }
    if (resultsRes.error && isTableMissingError(resultsRes.error)) {
        logMissingTableWarning('results', 'Fetching user stats');
    }

    const totalWords = vocabRes.count || 0;
    
    let quizAverage = 0;
    let examsTaken = 0;

    if (resultsRes.data) {
      const quizzes = resultsRes.data.filter((r: any) => r.type === 'quiz');
      const exams = resultsRes.data.filter((r: any) => r.type === 'exam');
      
      examsTaken = exams.length;
      
      if (quizzes.length > 0) {
          const totalPct = quizzes.reduce((acc: number, curr: any) => acc + ((curr.score / curr.total) * 100), 0);
          quizAverage = Math.round(totalPct / quizzes.length);
      }
    }

    return { totalWords, quizAverage, examsTaken };
  } catch (e) {
    console.error("Error getting user stats:", e);
    return { totalWords: 0, quizAverage: 0, examsTaken: 0 };
  }
};

export const getGoalAdvice = async (level: HSKLevel, language: AppLanguage = AppLanguage.EN): Promise<string> => {
    return "Keep practicing with the AI Tutor to improve your grammar and natural phrasing!";
};

// --- Global Audio Cache API ---

export const getCachedAudio = async (text: string): Promise<string | null> => {
  // 1. Check Local IndexedDB first for speed
  try {
    const localDb = await initDB();
    const cached = await localDb.get('global_audio', text);
    if (cached) {
      return cached.audio;
    }
  } catch (e) {
    console.warn("Local audio cache fetch failed", e);
  }

  // 2. Check Supabase
  const { data, error } = await supabase
    .from('global_audio_cache')
    .select('audio')
    .eq('text', text)
    .limit(1)
    .single();

  if (error && isTableMissingError(error)) {
      logMissingTableWarning('global_audio_cache', 'Fetching audio cache');
      return null;
  }

  if (data) {
    // Cache locally
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

  // 2. Save to Supabase
  const userId = await getUserId();
  if (userId) {
    const { error } = await supabase.from('global_audio_cache').insert({
      text,
      audio: audioBase64,
      timestamp: Date.now(),
      contributor: userId
    });
    if (error) {
        if (isTableMissingError(error)) {
            logMissingTableWarning('global_audio_cache', 'Saving audio cache');
        } else {
            console.warn('Global audio save failed:', error);
        }
    }
  }
};


// --- Chat History API ---

export const saveChatMessage = async (msg: ChatMessage) => {
  try {
    const userId = await getUserId();
    if (!userId) return;

    const { error } = await supabase.from('chat_history').insert({
      id: msg.id,
      user_id: userId,
      role: msg.role,
      text: msg.text,
      image: msg.image,
      audio: msg.audio,
      grounding_urls: msg.groundingUrls,
      timestamp: Date.now()
    });

    if (error) {
        if (isTableMissingError(error)) {
            logMissingTableWarning('chat_history', 'Saving chat message');
        } else {
            console.error('Error saving chat message:', error);
        }
    }
  } catch (e) {
    console.error("Network/Unexpected error in saveChatMessage:", e);
  }
};

export const updateMessageAudio = async (msgId: string, audioBase64: string) => {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('chat_history')
    .update({ audio: audioBase64 })
    .eq('id', msgId)
    .eq('user_id', userId);

  if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('chat_history', 'Updating message audio');
      } else {
          console.error('Error updating message audio:', error);
      }
  }
};

export const getChatHistory = async (): Promise<ChatMessage[]> => {
  try {
    const userId = await getUserId();
    if (!userId) return [];
    
    const { data, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: true })
      .limit(50);

    if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('chat_history', 'Fetching chat history');
          return [];
      }
      console.error('Error fetching chat history:', error);
      return [];
    }

    return data.map((d: any) => ({
      id: d.id,
      role: d.role,
      text: d.text,
      image: d.image,
      audio: d.audio,
      groundingUrls: d.grounding_urls
    }));
  } catch (e) {
    console.error("Network/Unexpected error in getChatHistory:", e);
    return [];
  }
};

export const clearChatHistory = async () => {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase
    .from('chat_history')
    .delete()
    .eq('user_id', userId);

  if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('chat_history', 'Clearing chat history');
      } else {
          console.error('Error clearing chat history:', error);
      }
  }
};

// --- Pronunciation History ---

export const savePronunciationAttempt = async (attempt: PronunciationAttempt) => {
  const userId = await getUserId();
  if (!userId) return;

  const id = `${attempt.word}_${attempt.timestamp}`;

  const { error } = await supabase.from('pronunciation_history').insert({
    id,
    user_id: userId,
    word: attempt.word,
    heard: attempt.heard,
    pinyin: attempt.pinyin,
    score: attempt.score,
    feedback: attempt.feedback,
    audio: attempt.audio,
    timestamp: attempt.timestamp
  });

  if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('pronunciation_history', 'Saving pronunciation');
      } else {
          console.error('Error saving pronunciation:', error);
      }
  }
};

export const getPronunciationHistory = async (word: string): Promise<PronunciationAttempt[]> => {
  try {
    const userId = await getUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('pronunciation_history')
      .select('*')
      .eq('user_id', userId)
      .eq('word', word)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('pronunciation_history', 'Fetching pronunciation history');
          return [];
      }
      console.error('Error fetching pronunciation history:', error);
      return [];
    }

    return data.map((d: any) => ({
      word: d.word,
      heard: d.heard,
      pinyin: d.pinyin,
      score: d.score,
      feedback: d.feedback,
      audio: d.audio,
      timestamp: d.timestamp
    }));
  } catch (e) {
    console.error("Network/Unexpected error in getPronunciationHistory:", e);
    return [];
  }
};

// --- Goals & Daily Progress ---

export const saveUserGoals = async (goals: UserGoals) => {
  const userId = await getUserId();
  if (!userId) return;

  const { error } = await supabase.from('user_goals').upsert({
    user_id: userId,
    daily_words: goals.dailyWords,
    daily_minutes: goals.dailyMinutes,
    daily_speaking_minutes: goals.dailySpeakingMinutes,
    daily_pronunciation: goals.dailyPronunciation,
    updated_at: new Date().toISOString()
  });

  if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('user_goals', 'Saving goals');
      } else {
          console.error('Error saving goals:', error);
      }
  }
};

export const getUserGoals = async (): Promise<UserGoals> => {
  const defaultGoals: UserGoals = { 
    dailyWords: 10, 
    dailyMinutes: 15,
    dailySpeakingMinutes: 5,
    dailyPronunciation: 10
  };

  try {
    const userId = await getUserId();
    if (!userId) return defaultGoals;

    const { data, error } = await supabase
      .from('user_goals')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
        if (isTableMissingError(error)) {
            logMissingTableWarning('user_goals', 'Fetching goals');
            return defaultGoals;
        }
        // PGRST116 is "The result contains 0 rows", which is fine, return defaults
        if (error.code !== 'PGRST116' && !isNetworkError(error)) {
            console.error('Error fetching goals:', error);
        }
        return defaultGoals;
    }
    
    if (!data) return defaultGoals;

    return {
      dailyWords: data.daily_words,
      dailyMinutes: data.daily_minutes,
      dailySpeakingMinutes: data.daily_speaking_minutes,
      dailyPronunciation: data.daily_pronunciation
    };
  } catch (e) {
    if (!isNetworkError(e)) {
        console.error("Network/Unexpected error in getUserGoals:", e);
    }
    return defaultGoals;
  }
};

export const updateStudyTime = async (minutes: number) => {
  const userId = await getUserId();
  if (!userId) return;

  const dateKey = new Date().toISOString().split('T')[0];

  // Fetch current stats for today
  const { data: current, error: fetchError } = await supabase
    .from('daily_stats')
    .select('minutes_spent')
    .eq('user_id', userId)
    .eq('date', dateKey)
    .single();

  if (fetchError && !isTableMissingError(fetchError) && fetchError.code !== 'PGRST116') {
      if (!isNetworkError(fetchError)) {
          console.warn("Error fetching daily stats:", fetchError);
      }
  }

  const currentMinutes = current?.minutes_spent || 0;

  const { error } = await supabase.from('daily_stats').upsert({
    user_id: userId,
    date: dateKey,
    minutes_spent: currentMinutes + minutes
  }, { onConflict: 'user_id, date' });

  if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('daily_stats', 'Updating study time');
      } else {
          console.error('Error updating study time:', error);
      }
  }
};

export const updateSpeakingTime = async (minutes: number) => {
  const userId = await getUserId();
  if (!userId) return;

  const dateKey = new Date().toISOString().split('T')[0];

  const { data: current, error: fetchError } = await supabase
    .from('daily_stats')
    .select('speaking_minutes') 
    .eq('user_id', userId)
    .eq('date', dateKey)
    .single();

  if (fetchError && !isTableMissingError(fetchError) && fetchError.code !== 'PGRST116') {
      if (!isNetworkError(fetchError)) {
          console.warn("Error fetching daily stats:", fetchError);
      }
  }

  const currentSpeaking = current?.speaking_minutes || 0;

  const { error } = await supabase.from('daily_stats').upsert({
    user_id: userId,
    date: dateKey,
    speaking_minutes: currentSpeaking + minutes
  }, { onConflict: 'user_id, date' });

  if (error) {
      if (isTableMissingError(error)) {
          logMissingTableWarning('daily_stats', 'Updating speaking time');
      } else {
          console.error('Error updating speaking time:', error);
      }
  }
};

export const getDailyProgress = async (): Promise<DailyProgress> => {
  const defaultProgress = { minutesSpent: 0, wordsReviewed: 0, speakingMinutes: 0, pronunciationCount: 0 };
  try {
    const userId = await getUserId();
    if (!userId) return defaultProgress;

    const dateKey = new Date().toISOString().split('T')[0];
    const startOfDay = new Date(dateKey).getTime();

    // 1. Get Time Stats
    const { data: stats, error: statsError } = await supabase
      .from('daily_stats')
      .select('minutes_spent, words_reviewed, speaking_minutes')
      .eq('user_id', userId)
      .eq('date', dateKey)
      .single();

    if (statsError && !isTableMissingError(statsError) && statsError.code !== 'PGRST116') {
        if (!isNetworkError(statsError)) {
           console.warn("Error fetching daily stats:", statsError);
        }
    }

    // 2. Get Pronunciation Count (count rows today)
    const { count: pronCount, error: pronError } = await supabase
      .from('pronunciation_history')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('timestamp', startOfDay);

    if (pronError && !isTableMissingError(pronError)) {
        if (!isNetworkError(pronError)) {
           console.warn("Error fetching pronunciation count:", pronError);
        }
    }

    return {
      minutesSpent: stats?.minutes_spent || 0,
      wordsReviewed: stats?.words_reviewed || 0,
      speakingMinutes: stats?.speaking_minutes || 0,
      pronunciationCount: pronCount || 0
    };
  } catch (e) {
    if (!isNetworkError(e)) {
        console.error("Network/Unexpected error in getDailyProgress:", e);
    }
    return defaultProgress;
  }
};

// --- Offline Batches API (Local Only) ---

export const saveOfflineBatch = async (type: 'vocab' | 'quiz' | 'exam', level: HSKLevel, title: string, content: any) => {
  const id = `${type}_${level}_${Date.now()}`;
  const data = {
    id,
    type,
    level,
    title,
    content,
    timestamp: Date.now(),
  };

  try {
    const localDb = await initDB();
    await localDb.put('offline_batches', data);
    return id;
  } catch (e) {
    console.error("Failed to save offline batch:", e);
    throw e;
  }
};

export const getOfflineBatches = async (type?: 'vocab' | 'quiz' | 'exam', level?: HSKLevel) => {
  try {
    const localDb = await initDB();
    const all = await localDb.getAll('offline_batches');
    
    return all.filter(batch => {
      if (type && batch.type !== type) return false;
      if (level && batch.level !== level) return false;
      return true;
    }).sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    console.error("Failed to fetch offline batches:", e);
    return [];
  }
};

export const deleteOfflineBatch = async (id: string) => {
  try {
    const localDb = await initDB();
    await localDb.delete('offline_batches', id);
  } catch (e) {
    console.error("Failed to delete offline batch:", e);
  }
};

export const getOfflineBatchById = async (id: string) => {
  try {
    const localDb = await initDB();
    return await localDb.get('offline_batches', id);
  } catch (e) {
    console.error("Failed to get offline batch:", e);
    return null;
  }
};
