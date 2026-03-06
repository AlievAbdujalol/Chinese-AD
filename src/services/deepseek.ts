import { AppLanguage, HSKLevel, QuizQuestion, ExamData, VocabCard } from "../types";
import { supabase } from "./supabase";

const API_URL = "/api/deepseek";

const LANG_NAMES = {
  [AppLanguage.RU]: 'Russian',
  [AppLanguage.TJ]: 'Tajik',
  [AppLanguage.EN]: 'English'
};

const MAX_RETRIES = 3;
const INITIAL_DELAY = 1000;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: any;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      
      if (msg.includes('Unauthorized') || msg.includes('401')) throw error;

      const isTransient = msg.includes('503') || msg.includes('429') || msg.includes('Failed to fetch') || msg.includes('NetworkError');
      if (isTransient) {
        const delay = INITIAL_DELAY * Math.pow(2, i);
        await wait(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function callDeepSeek(messages: any[], jsonMode: boolean = false) {
  return retryOperation(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        response_format: jsonMode ? { type: "json_object" } : undefined,
        temperature: 1.3
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DeepSeek API Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  });
}

export async function generateTutorResponseDS(
  history: { role: string; parts: any[] }[],
  message: string,
  lang: AppLanguage,
  level: HSKLevel
) {
  const systemInstruction = `You are an expert Chinese language tutor (HSK Focus). 
  Target Level: ${level}.
  User Language: ${LANG_NAMES[lang] || lang}.
  
  Your primary goal is to provide detailed feedback on the user's grammar and vocabulary usage to help them improve.

  For every user message:
  1. **Analysis & Correction**: 
     - Check for grammar errors, unnatural phrasing, or vocabulary that doesn't fit the context or HSK level.
     - If there are errors, explicitly provide the **Corrected Sentence** with Pinyin.
     - Explain **why** the correction is needed.
     - If the user's sentence is correct but simple, suggest a more native or advanced alternative suitable for ${level}.
  
  2. **Conversation**:
     - After providing feedback, respond naturally to the content of the user's message to keep the conversation flowing.
  
  Format:
  - Use **bold** for corrections or key terms.
  - Use bullet points for multiple feedback items.
  - Always provide Pinyin and Character breakdowns for Chinese examples.
  - Explain concepts clearly in ${LANG_NAMES[lang] || lang}.
  
  If the user asks for cultural info, provide accurate details.`;

  // Convert history to DeepSeek format
  const messages = [
    { role: "system", content: systemInstruction },
    ...history.map(h => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts.map(p => p.text).join('\n') // DeepSeek doesn't support images in this simple implementation yet
    })),
    { role: "user", content: message }
  ];

  const text = await callDeepSeek(messages);
  return { text, groundingChunks: [] };
}

export async function generateQuizDS(topic: string, level: HSKLevel, lang: AppLanguage): Promise<QuizQuestion[]> {
  const prompt = `Generate 5 multiple-choice questions for Chinese learning.
  Level: ${level}.
  Topic: ${topic || 'General HSK vocabulary/grammar'}.
  Language for questions/explanations: ${LANG_NAMES[lang] || lang}.
  Return strictly JSON in this format:
  {
    "questions": [
      {
        "question": "...",
        "options": ["A", "B", "C", "D"],
        "correctAnswerIndex": 0,
        "explanation": "..."
      }
    ]
  }`;

  const text = await callDeepSeek([{ role: "user", content: prompt }], true);
  const json = JSON.parse(text);
  return json.questions || json;
}

export async function generateMockExamDS(level: HSKLevel, lang: AppLanguage): Promise<ExamData> {
  const prompt = `Generate a mini mock HSK exam for ${level}. 
  Language: ${LANG_NAMES[lang] || lang}.
  
  Structure:
  1. Listening: 3 questions. Provide the 'script' (spoken Chinese text) and the question/options.
  2. Reading: 3 questions. Provide a short passage and question.
  3. Grammar: 4 questions. Fill-in-the-blank or structure.

  Return strictly JSON with keys: listening, reading, grammar.`;

  const text = await callDeepSeek([{ role: "user", content: prompt }], true);
  return JSON.parse(text);
}

export async function generateVocabularyBatchDS(level: HSKLevel, lang: AppLanguage): Promise<VocabCard[]> {
  const prompt = `Generate a list of 10 essential vocabulary words for ${level}.
  Translate definitions to ${LANG_NAMES[lang] || lang}.
  Include Pinyin with accurate tone marks for every word and example sentence.
  Return strictly JSON array of objects with keys: character, pinyin, translation, exampleSentence, examplePinyin, exampleTranslation.`;

  const text = await callDeepSeek([{ role: "user", content: prompt }], true);
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : json.words || [];
}

export async function generatePracticeSentenceDS(level: HSKLevel, lang: AppLanguage): Promise<{character: string, pinyin: string, translation: string}> {
  const prompt = `Generate one simple, natural Chinese sentence (5-10 chars) for HSK level ${level}.
  Include Pinyin and translation in ${LANG_NAMES[lang] || lang}.
  Return strictly JSON: { "character": "...", "pinyin": "...", "translation": "..." }`;

  const text = await callDeepSeek([{ role: "user", content: prompt }], true);
  return JSON.parse(text);
}
