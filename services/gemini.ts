import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerateContentResult } from "@google/generative-ai";

// Helper to get fresh instance (handling dynamic keys)
const getAI = () => new GoogleGenerativeAI(process.env.API_KEY || "");

const LANG_NAMES = {
  ru: 'Russian',
  tj: 'Tajik',
  en: 'English'
};

// --- Error Helper ---

export function getFriendlyErrorMessage(error: any): string {
  const msg = error?.message || error?.toString() || '';
  
  // Quota & Service
  if (msg.includes('429') || msg.includes('Quota')) return "Daily AI quota exceeded. Please try again later.";
  if (msg.includes('503') || msg.includes('Overloaded') || msg.includes('unavailable')) return "AI service is currently busy/unavailable. Please try again in a moment.";
  
  // Auth & Permissions
  if (msg.includes('403') || msg.includes('Permission') || msg.includes('PERMISSION_DENIED')) return "Access denied. Please check your API key settings.";
  
  // Request Issues
  if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
      if (msg.includes('symbol') || msg.includes('supported')) return "Text contains only symbols or unsupported characters.";
      if (msg.includes('text') && msg.includes('TTS')) return "TTS Generation failed. Switching to browser voice.";
      return "The request was invalid. Please try a different prompt.";
  }
  
  // Network
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) return "Network connection error. Please check your internet.";
  
  // Content Safety
  if (msg.includes('safety') || msg.includes('blocked')) return "Response blocked due to safety filters. Try a different topic.";
  
  // Audio / TTS Specifics
  if (msg.includes('AudioContext') || msg.includes('device') || msg.includes('decode')) return "Audio device error. Please check your speakers/permissions.";
  if (msg.includes('empty') && msg.includes('Text')) return "Text is empty, nothing to speak.";
  if (msg.includes('No audio data') || msg.includes('TTS')) return "Could not generate audio. Please try again.";
  if (msg.includes('not found') && msg.includes('model')) return "The AI model is currently unavailable or deprecated.";

  return "An unexpected error occurred. Please try again.";
}

// --- Helpers ---

// Retry Logic
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
      const status = error?.status;
      
      // Retry on 503 (Unavailable), 429 (Too Many Requests), or specific 400 TTS hallucination
      const isTransient = status === 503 || msg.includes('503') || msg.includes('Overloaded') || status === 429 || msg.includes('Quota');
      const isTTSHallucination = msg.includes('Model tried to generate text') && msg.includes('TTS');

      if (isTransient || isTTSHallucination) {
        const delay = INITIAL_DELAY * Math.pow(2, i);
        console.warn(`Attempt ${i + 1} failed with ${status || 'error'}. Retrying in ${delay}ms...`);
        await wait(delay);
        continue;
      }
      
      throw error;
    }
  }
  throw lastError;
}

// Helper to encode/decode audio for Live API
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

// --- Text & Vision ---

export async function generateTutorResponse(
  history: { role: string; parts: any[] }[],
  message: string,
  image: string | null,
  lang: string,
  level: string,
  useSearch: boolean,
  useThinking: boolean
) {
  const ai = getAI();
  const model = ai.getGenerativeModel({ 
    model: useThinking ? 'gemini-3-pro-preview' : (useSearch ? 'gemini-3-flash-preview' : 'gemini-3-flash-preview'),
    generationConfig: {
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ]
    }
  });
  
  const systemInstruction = `You are an expert Chinese language tutor (HSK Focus). 
  Target Level: ${level}.
  User Language: ${LANG_NAMES[lang as keyof typeof LANG_NAMES] || lang}.
  
  Your primary goal is to provide detailed feedback on the user's grammar and vocabulary usage to help them improve.

  For every user message:
  1. **Analysis & Correction**: 
     - Check for grammar errors, unnatural phrasing, or vocabulary that doesn't fit the context or HSK level.
     - If there are errors, explicitly provide the **Corrected Sentence** with Pinyin.
     - Explain **why** the correction is needed (e.g., specific grammar rule, tone modification, or word choice nuances).
     - If the user's sentence is correct but simple, suggest a more native or advanced alternative suitable for ${level}.
  
  2. **Conversation**:
     - After providing feedback, respond naturally to the content of the user's message to keep the conversation flowing.
  
  Format:
  - Use **bold** for corrections or key terms.
  - Use bullet points for multiple feedback items.
  - Always provide Pinyin and Character breakdowns for Chinese examples.
  - Explain concepts clearly in ${LANG_NAMES[lang as keyof typeof LANG_NAMES] || lang}.
  
  If the user asks for cultural info, provide accurate details.`;

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
    try {
      const result = await model.generateContent({
        contents: contents,
        systemInstruction: systemInstruction,
      });
      
      return {
        text: result.response.text(),
        groundingChunks: undefined // Grounding chunks are not available in this version
      };
    } catch (error) {
      console.error("GenAI Error:", error);
      throw error;
    }
  });
}

// --- Quiz Generation ---

export async function generateQuiz(topic: string, level: string, lang: string): Promise<any[]> {
  const ai = getAI();
  const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  const prompt = `Generate 5 multiple-choice questions for Chinese learning.
  Level: ${level}.
  Topic: ${topic || 'General HSK vocabulary/grammar'}.
  Language for questions/explanations: ${LANG_NAMES[lang as keyof typeof LANG_NAMES] || lang}.
  Return strictly JSON.`;

  return retryOperation(async () => {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse quiz response:", responseText);
      throw e;
    }
  });
}

// --- Exam Generation ---

export async function generateMockExam(level: string, lang: string): Promise<any> {
  const ai = getAI();
  const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  const prompt = `Generate a mini mock HSK exam for ${level}. 
  Language: ${LANG_NAMES[lang as keyof typeof LANG_NAMES] || lang}.
  
  Structure:
  1. Listening: 3 questions. Provide the 'script' (spoken Chinese text, using simplified characters) and the question/options.
  2. Reading: 3 questions. Provide a short passage and question.
  3. Grammar: 4 questions. Fill-in-the-blank or structure.

  Return strictly JSON.`;

  return retryOperation(async () => {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse exam response:", responseText);
      throw e;
    }
  });
}

// --- Vocabulary Generation ---

export async function generateVocabularyBatch(level: string, lang: string): Promise<any[]> {
  const ai = getAI();
  const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  
  const prompt = `Generate a list of 10 essential vocabulary words for ${level}.
  Translate definitions to ${LANG_NAMES[lang as keyof typeof LANG_NAMES] || lang}.
  Include a simple example sentence using the word.
  Return strictly JSON.`;

  return retryOperation(async () => {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse vocab response:", responseText);
      throw e;
    }
  });
}

// --- TTS ---

let ttsAudioContext: AudioContext | null = null;
let currentTtsSource: AudioBufferSourceNode | null = null;
// Module-level cache for generated audio to save bandwidth/quota across components
const globalAudioCache = new Map<string, ArrayBuffer>();

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
  // Fallback to browser TTS as Gemini TTS is not available in this version
  throw new Error("TTS functionality not available in this version");
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
  source.start(0);

  // Return a promise that resolves when audio finishes
  return new Promise((resolve) => {
    source.onended = () => {
        if (currentTtsSource === source) {
            currentTtsSource = null;
        }
        resolve();
    };
  });
}

export async function speakBrowser(text: string, lang: string = 'zh-CN'): Promise<void> {
  return new Promise((resolve) => {
      stopTtsAudio();
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.onend = () => resolve();
        u.onerror = (e) => {
            console.warn("Browser TTS error", e);
            resolve();
        }
        window.speechSynthesis.speak(u);
      } else {
        resolve();
      }
  });
}

export async function playTextToSpeech(text: string): Promise<void> {
  if (!text.trim()) return;
  try {
    const pcmBuffer = await generateSpeech(text);
    await playRawAudio(pcmBuffer);
  } catch (e) {
    console.warn("Gemini TTS failed, falling back to browser TTS", e);
    await speakBrowser(text);
  }
}

// --- Image Generation ---

export async function generateVisualAid(prompt: string, aspectRatio: string = "1:1"): Promise<string | null> {
  const ai = getAI();
  const model = ai.getGenerativeModel({ model: 'gemini-3-pro-image-preview' });
  
  return retryOperation(async () => {
    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      
      // Extract image data from response
      for (const candidate of response.candidates || []) {
        for (const part of candidate.content.parts || []) {
          if ('inlineData' in part && part.inlineData?.mimeType?.startsWith('image')) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }
      return null;
    } catch (e) {
      console.error("Image Gen Error", e);
      throw e; 
    }
  });
}

// --- Audio Transcription & Evaluation ---

export async function transcribeAudio(audioBase64: string, mimeType: string = 'audio/wav'): Promise<string> {
  const ai = getAI();
  const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  
  return retryOperation(async () => {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: audioBase64
        }
      },
      { text: "Transcribe exactly what is said in this audio." }
    ]);
    return result.response.text() || "";
  });
}

export async function evaluatePronunciation(audioBase64: string, mimeType: string, referenceText?: string, lang: string = 'en'): Promise<string> {
  const ai = getAI();
  const model = ai.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  
  const prompt = `You are a strict Chinese Pronunciation Coach. 
  1. User Target: "${referenceText || 'Unknown (Transcribe only)'}".
  2. Task: Listen to the audio and compare it against the target.
  3. Analysis Requirements:
     - Identify the exact tones used by the user.
     - Check for correct Initials and Finals.
  4. Output Format (Markdown):
     - **Heard**: [Chinese Characters of what you actually heard]
     - **Pinyin**: [Pinyin with tone marks of what you heard]
     - **Score**: [1-10]/10
     - **Feedback**: [Specific advice in ${LANG_NAMES[lang as keyof typeof LANG_NAMES] || lang}. e.g., "You used the 2nd tone (rising) but it should be 4th tone (falling)."]
  `;

  return retryOperation(async () => {
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: audioBase64
        }
      },
      { text: prompt }
    ]);

    return result.response.text() || "Could not evaluate pronunciation.";
  });
}

// --- Live API Connect ---

// Note: Live API is not implemented in this version as it requires a different approach
export function connectLiveSession(
  lang: string,
  level: string,
  callbacks: {
    onOpen: () => void;
    onMessage: (msg: any) => void;
    onClose: () => void;
    onError: (err: any) => void;
  }
) {
  // Placeholder implementation - actual live session implementation would be more complex
  console.warn("Live API not implemented in this version");
  return null;
}