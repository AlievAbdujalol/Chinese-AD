import { Type, HarmCategory, HarmBlockThreshold, Modality } from "@google/genai";
import { AppLanguage, HSKLevel, QuizQuestion, ExamData, VocabCard } from "../types";
import { supabase } from "./supabase";

// --- Proxy Helper ---

async function callGeminiProxy(model: string, contents: any, config: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Check for local storage key fallback
  const rawKeys = JSON.parse(localStorage.getItem('user_api_keys_raw') || '{}');
  if (rawKeys.gemini) {
    headers['x-api-key'] = rawKeys.gemini;
  }

  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, contents, config })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch (e) {}
    
    throw new Error(errorJson?.error || `Gemini API Error: ${response.statusText}`);
  }

  return response.json();
}

const LANG_NAMES = {
  [AppLanguage.RU]: 'Russian',
  [AppLanguage.TJ]: 'Tajik',
  [AppLanguage.EN]: 'English'
};

// --- Error Helper ---
export function getFriendlyErrorMessage(error: any): string {
  const msg = error?.message || error?.toString() || '';
  
  if (msg.includes('401') || msg.includes('Unauthorized')) return "Please log in to use AI features.";
  if (msg.includes('No API Key available')) return "System API Key missing. Please contact support or add your own key in Settings.";
  
  if (msg.includes('429') || msg.includes('Quota')) return "Daily AI quota exceeded. Please try again later.";
  if (msg.includes('503') || msg.includes('Overloaded')) return "AI service is currently busy. Please try again.";
  
  return msg || "An unexpected error occurred.";
}

// --- Helpers ---
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function connectLiveSession(language: AppLanguage, level: HSKLevel, callbacks: any): Promise<any> {
    throw new Error("Live API is not supported with secure key storage yet.");
}

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
      
      if (msg.includes('No API Key available') || msg.includes('Unauthorized')) throw error; // Don't retry auth errors

      const isTransient = msg.includes('503') || msg.includes('Overloaded') || msg.includes('429') || msg.includes('Failed to fetch') || msg.includes('NetworkError');
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

// --- Text & Vision ---

export async function generateTutorResponse(
  history: { role: string; parts: any[] }[],
  message: string,
  image: string | null,
  lang: AppLanguage,
  level: HSKLevel,
  useSearch: boolean,
  useThinking: boolean
) {
  const model = useThinking ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview';
  
  const systemInstruction = `You are an expert Chinese language tutor (HSK Focus). 
  Target Level: ${level}.
  User Language: ${LANG_NAMES[lang] || lang}.
  Your primary goal is to provide detailed feedback on the user's grammar and vocabulary usage to help them improve.
  For every user message:
  1. **Analysis & Correction**: 
     - Check for grammar errors, unnatural phrasing, or vocabulary that doesn't fit the context or HSK level.
     - If there are errors, explicitly provide the **Corrected Sentence** with Pinyin.
     - Explain **why** the correction is needed.
     - If correct but simple, suggest a more native alternative suitable for ${level}.
  2. **Conversation**:
     - Respond naturally to keep the conversation flowing.
  Format:
  - Use **bold** for corrections.
  - Use bullet points.
  - Always provide Pinyin and Character breakdowns.
  - Explain concepts clearly in ${LANG_NAMES[lang] || lang}.`;

  const tools = useSearch ? [{ googleSearch: {} }] : undefined;
  const thinkingConfig = useThinking ? { thinkingConfig: { thinkingBudget: 16000 } } : undefined;

  const currentParts: any[] = [{ text: message }];
  if (image) {
    currentParts.unshift({
      inlineData: {
        mimeType: 'image/jpeg',
        data: image.split(',')[1] 
      }
    });
  }

  const contents = [
    ...history,
    { role: 'user', parts: currentParts }
  ];

  return retryOperation(async () => {
    const response = await callGeminiProxy(model, contents, {
      systemInstruction,
      tools,
      ...thinkingConfig
    });
    
    return {
      text: response.text,
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    };
  });
}

export async function generateQuiz(topic: string, level: HSKLevel, lang: AppLanguage): Promise<QuizQuestion[]> {
  const model = 'gemini-3-flash-preview';
  const prompt = `Generate 5 multiple-choice questions for Chinese learning.
  Level: ${level}.
  Topic: ${topic || 'General HSK vocabulary/grammar'}.
  Language for questions/explanations: ${LANG_NAMES[lang] || lang}.
  Return strictly JSON.`;

  return retryOperation(async () => {
    const response = await callGeminiProxy(model, [{ parts: [{ text: prompt }] }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswerIndex: { type: Type.INTEGER },
            explanation: { type: Type.STRING }
          },
          required: ['question', 'options', 'correctAnswerIndex', 'explanation']
        }
      }
    });

    return JSON.parse(response.text || '[]');
  });
}

export async function generateMockExam(level: HSKLevel, lang: AppLanguage): Promise<ExamData> {
  const model = 'gemini-3-flash-preview';
  const prompt = `Generate a mini mock HSK exam for ${level}. 
  Language: ${LANG_NAMES[lang] || lang}.
  Structure:
  1. Listening: 3 questions. Provide the 'script' (spoken Chinese text) and the question/options.
  2. Reading: 3 questions.
  3. Grammar: 4 questions.
  Return strictly JSON.`;

  const questionSchema = {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      type: { type: Type.STRING },
      content: { type: Type.STRING },
      script: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      correctIndex: { type: Type.INTEGER },
      explanation: { type: Type.STRING }
    },
    required: ['id', 'type', 'content', 'options', 'correctIndex', 'explanation']
  };

  return retryOperation(async () => {
    const response = await callGeminiProxy(model, [{ parts: [{ text: prompt }] }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          listening: { type: Type.ARRAY, items: questionSchema },
          reading: { type: Type.ARRAY, items: questionSchema },
          grammar: { type: Type.ARRAY, items: questionSchema }
        },
        required: ['listening', 'reading', 'grammar']
      }
    });

    return JSON.parse(response.text || '{}');
  });
}

export async function generateVocabularyBatch(level: HSKLevel, lang: AppLanguage): Promise<VocabCard[]> {
  const model = 'gemini-3-flash-preview';
  const prompt = `Generate a list of 10 essential vocabulary words for ${level}.
  Translate definitions to ${LANG_NAMES[lang] || lang}.
  Include Pinyin with accurate tone marks.
  Return strictly JSON.`;

  return retryOperation(async () => {
    const response = await callGeminiProxy(model, [{ parts: [{ text: prompt }] }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            character: { type: Type.STRING },
            pinyin: { type: Type.STRING },
            translation: { type: Type.STRING },
            exampleSentence: { type: Type.STRING },
            examplePinyin: { type: Type.STRING },
            exampleTranslation: { type: Type.STRING }
          },
          required: ['character', 'pinyin', 'translation', 'exampleSentence', 'examplePinyin', 'exampleTranslation']
        }
      }
    });

    return JSON.parse(response.text || '[]');
  });
}

export async function generatePracticeSentence(level: HSKLevel, lang: AppLanguage): Promise<{character: string, pinyin: string, translation: string}> {
  const model = 'gemini-3-flash-preview';
  const prompt = `Generate one simple, natural Chinese sentence (5-10 chars) for HSK level ${level}.
  Include Pinyin and translation in ${LANG_NAMES[lang] || lang}.
  Return strictly JSON: { "character": "...", "pinyin": "...", "translation": "..." }`;

  return retryOperation(async () => {
    const response = await callGeminiProxy(model, [{ parts: [{ text: prompt }] }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          character: { type: Type.STRING },
          pinyin: { type: Type.STRING },
          translation: { type: Type.STRING }
        },
        required: ['character', 'pinyin', 'translation']
      }
    });

    return JSON.parse(response.text || '{}');
  });
}

// --- TTS ---

let ttsAudioContext: AudioContext | null = null;
let currentTtsSource: AudioBufferSourceNode | null = null;

export function stopTtsAudio() {
  if (currentTtsSource) {
    try { currentTtsSource.stop(); } catch(e) {}
    currentTtsSource = null;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export async function generateSpeech(text: string): Promise<ArrayBuffer> {
  const model = 'gemini-2.5-flash-preview-tts';
  
  if (!text || !text.trim()) throw new Error("Text is empty");

  const cleanText = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_`#\[\]]/g, '')
      .replace(/[^\w\s\u4e00-\u9fa5\u0400-\u04FF\u00C0-\u024F.,?!:;'"()—\-]/g, '') 
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 4000);

  const finalCleanText = cleanText.match(/[.?!。？！]$/) ? cleanText : `${cleanText}.`;

  if (!finalCleanText || finalCleanText === '.') throw new Error("Text invalid for TTS.");

  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  const generateWithConfig = async (voiceName: string) => {
    return retryOperation(async () => {
      return await callGeminiProxy(model, [{ parts: [{ text: finalCleanText }] }], {
        responseModalities: [Modality.AUDIO],
        speechConfig: { 
          voiceConfig: { 
            prebuiltVoiceConfig: { voiceName } 
          } 
        },
        safetySettings,
      });
    });
  };

  try {
    let response;
    try {
        response = await generateWithConfig('Kore');
    } catch (err: any) {
        console.warn("TTS Primary Voice Error, retrying with fallback:", err);
        response = await generateWithConfig('Puck');
    }

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No candidates returned from TTS model.");
    
    const audioData = candidate.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error("Model returned no audio data.");
    
    const binaryString = atob(audioData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error: any) {
    console.error("TTS Execution Error:", error);
    throw error;
  }
}

export async function playRawAudio(buffer: ArrayBuffer): Promise<void> {
  stopTtsAudio();

  if (!ttsAudioContext || ttsAudioContext.state === 'closed') {
      ttsAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
  }
  const ctx = ttsAudioContext;
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const dataInt16 = new Int16Array(buffer);
  const float32 = new Float32Array(dataInt16.length);
  for (let i = 0; i < dataInt16.length; i++) {
    float32[i] = dataInt16[i] / 32768.0;
  }
  
  const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
  audioBuffer.copyToChannel(float32, 0);
  
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  
  currentTtsSource = source;
  source.onended = () => {
    if (currentTtsSource === source) {
      currentTtsSource = null;
    }
  };

  source.start(0);
}

export function speakBrowser(text: string, lang: string = 'zh-CN') {
  stopTtsAudio();
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.speak(u);
  }
}

export async function playTextToSpeech(text: string): Promise<void> {
  if (!text.trim()) return;
  try {
    const pcmBuffer = await generateSpeech(text);
    await playRawAudio(pcmBuffer);
  } catch (e: any) {
    console.warn("Gemini TTS failed, falling back to browser TTS", e);
    speakBrowser(text);
  }
}

export async function generateVisualAid(prompt: string, aspectRatio: string = "1:1", referenceImageBase64?: string): Promise<string | null> {
  const model = 'gemini-2.5-flash-image';
  
  const parts: any[] = [{ text: prompt }];
  if (referenceImageBase64) {
      parts.unshift({
          inlineData: {
              data: referenceImageBase64,
              mimeType: 'image/jpeg'
          }
      });
  }

  return retryOperation(async () => {
    const response = await callGeminiProxy(model, { parts }, {
      imageConfig: {
        aspectRatio: aspectRatio as any
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  });
}

export async function transformImageToBeijing(imageBase64: string): Promise<string> {
  const model = 'gemini-2.5-flash-image';
  const prompt = `Generate a realistic photo of this person visiting a famous landmark in Beijing, China. Ensure high quality.`;

  return retryOperation(async () => {
    const response = await callGeminiProxy(model, {
      parts: [
        { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } },
        { text: prompt }
      ]
    }, {
      imageConfig: { aspectRatio: "1:1" }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  });
}

export async function transcribeAudio(audioBase64: string, mimeType: string = 'audio/wav'): Promise<string> {
  const model = 'gemini-3-flash-preview';
  
  return retryOperation(async () => {
    const response = await callGeminiProxy(model, {
      parts: [
        { inlineData: { mimeType: mimeType, data: audioBase64 } },
        { text: "Transcribe exactly what is said in this audio." }
      ]
    }, {});
    return response.text || "";
  });
}

export async function evaluatePronunciation(audioBase64: string, mimeType: string, referenceText?: string, lang: AppLanguage = AppLanguage.EN): Promise<string> {
  const model = 'gemini-3-flash-preview';
  const prompt = `You are a strict Chinese Pronunciation Coach. 
  1. User Target: "${referenceText || 'Unknown (Transcribe only)'}".
  2. Task: Listen to the audio and compare it against the target.
  3. Analysis Requirements:
     - Identify the exact tones used.
     - Check for correct Initials and Finals.
  4. Output Format (Markdown):
     - **Heard**: [Chinese Characters]
     - **Pinyin**: [Pinyin with tone marks]
     - **Score**: [1-10]/10
     - **Feedback**: [Specific advice in ${LANG_NAMES[lang] || lang}]`;

  return retryOperation(async () => {
    const response = await callGeminiProxy(model, {
      parts: [
        { inlineData: { mimeType: mimeType, data: audioBase64 } },
        { text: prompt }
      ]
    }, {});
    return response.text || "";
  });
}
