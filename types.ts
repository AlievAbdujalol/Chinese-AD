
export enum AppMode {
  DASHBOARD = 'dashboard',
  TUTOR = 'tutor', // Chat & Text
  LIVE = 'live', // Live API Voice
  QUIZ = 'quiz',
  EXAM = 'exam',
  VOCAB = 'vocab',
  BOOKMARKS = 'bookmarks',
  PROGRESS = 'progress',
  PROFILE = 'profile'
}

export enum HSKLevel {
  HSK1 = 'HSK 1',
  HSK2 = 'HSK 2',
  HSK3 = 'HSK 3',
  HSK4 = 'HSK 4'
}

export enum AppLanguage {
  RU = 'ru',
  TJ = 'tj',
  EN = 'en'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // base64
  audio?: string; // base64 for TTS playback
  isThinking?: boolean;
  groundingUrls?: Array<{title: string, uri: string}>;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface ExamQuestion {
  id: string;
  type: 'listening' | 'reading' | 'grammar';
  content: string; // The question text or reading passage
  script?: string; // For listening, the spoken text
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ExamData {
  listening: ExamQuestion[];
  reading: ExamQuestion[];
  grammar: ExamQuestion[];
}

export interface VocabCard {
  character: string;
  pinyin: string;
  translation: string;
  exampleSentence: string;
  exampleTranslation: string;
  bookmarked?: boolean;
}

export interface QuizResult {
  score: number;
  total: number;
  date: string;
}

export interface UserSettings {
  language: AppLanguage;
  level: HSKLevel;
}

export interface PronunciationAttempt {
  id?: string;
  word: string;
  heard: string;
  pinyin: string;
  score: number;
  feedback: string;
  timestamp: number;
}

export interface UserGoals {
  dailyWords: number;
  dailyMinutes: number;
  dailySpeakingMinutes: number;
  dailyPronunciation: number;
}

export interface DailyProgress {
  wordsReviewed: number;
  minutesSpent: number;
  speakingMinutes: number;
  pronunciationCount: number;
}
