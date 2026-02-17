
import { GoogleGenAI, Type, LiveServerMessage, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { AppLanguage, HSKLevel, QuizQuestion, ExamData, VocabCard } from "../types";

// Helper to get fresh instance (handling dynamic keys)
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const LANG_NAMES = {
  [AppLanguage.RU]: 'Russian',
  [AppLanguage.TJ]: 'Tajik',
  [AppLanguage.EN]: 'English'
};

// --- Error Helper ---

export function getFriendlyErrorMessage(error: any): string {
  const msg = error?.message || error?.toString() || '';
  const name = error?.name || '';
  
  // Microphone / Device Permissions (Check this first)
  if (name === 'NotAllowedError' || 
      name === 'PermissionDeniedError' || 
      msg.toLowerCase().includes('microphone') || 
      msg.includes('getUserMedia') ||
      msg.trim() === 'Permission denied') {
      return "Microphone access denied. Please allow microphone permissions in your browser settings.";
  }

  // Quota & Service
  if (msg.includes('429') || msg.includes('Quota')) return "Daily AI quota exceeded. Please try again later.";
  if (msg.includes('503') || msg.includes('Overloaded') || msg.includes('unavailable')) return "AI service is currently busy/unavailable. Please try again in a moment.";
  
  // Auth & Permissions (API Key)
  if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || (msg.includes('Permission') && msg.includes('API key'))) {
     if (msg.includes('Live') || msg.includes('audio')) return "Access denied. Live API requires a valid API key with billing enabled.";
     return "Access denied. Please check your API key settings or billing.";
  }
  
  // Request Issues
  if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
      if (msg.includes('symbol') || msg.includes('supported')) return "Text contains only symbols or unsupported characters.";
      if (msg.includes('text') && msg.includes('TTS')) return "TTS Generation failed. Switching to browser voice.";
      if (msg.includes('Model tried to generate text')) return "TTS Model Error. Switching to browser voice.";
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
      
      // Stop retrying if the model explicitly says it tried to generate text (Hallucination/Misuse error)
      if ((msg.includes('Model tried to generate text') && msg.includes('TTS')) || msg.includes('INVALID_ARGUMENT')) {
         console.debug("TTS Model Hallucination/Invalid Arg (Non-retriable):", msg);
         throw error;
      }
      
      // Stop retrying on Safety blocks
      if (msg.includes('safety') || msg.includes('blocked')) {
         throw error;
      }

      // Retry on 503 (Unavailable), 429 (Too Many Requests)
      const isTransient = status === 503 || msg.includes('503') || msg.includes('Overloaded') || status === 429 || msg.includes('Quota');

      if (isTransient) {
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

// ... existing base64/buffer helpers ...
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
  lang: AppLanguage,
  level: HSKLevel,
  useSearch: boolean,
  useThinking: boolean
) {
  const ai = getAI();
  const model = useThinking ? 'gemini-3-pro-preview' : (useSearch ? 'gemini-3-flash-preview' : 'gemini-3-flash-preview');
  
  const systemInstruction = `You are an expert Chinese language tutor (HSK Focus). 
  Target Level: ${level}.
  User Language: ${LANG_NAMES[lang] || lang}.
  
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
  - Explain concepts clearly in ${LANG_NAMES[lang] || lang}.
  
  If the user asks for cultural info, provide accurate details.`;

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
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          systemInstruction,
          tools,
          ...thinkingConfig
        }
      });
      
      return {
        text: response.text,
        groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
      };
    } catch (error) {
      console.error("GenAI Error:", error);
      throw error;
    }
  });
}

// ... generateQuiz, generateMockExam, generateVocabularyBatch (Unchanged)
export async function generateQuiz(topic: string, level: HSKLevel, lang: AppLanguage): Promise<QuizQuestion[]> {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';
  const prompt = `Generate 5 multiple-choice questions for Chinese learning.
  Level: ${level}.
  Topic: ${topic || 'General HSK vocabulary/grammar'}.
  Language for questions/explanations: ${LANG_NAMES[lang] || lang}.
  Return strictly JSON.`;

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
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
      }
    });

    return JSON.parse(response.text || '[]');
  });
}

export async function generateMockExam(level: HSKLevel, lang: AppLanguage): Promise<ExamData> {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';
  const prompt = `Generate a mini mock HSK exam for ${level}. 
  Language: ${LANG_NAMES[lang] || lang}.
  
  Structure:
  1. Listening: 3 questions. Provide the 'script' (spoken Chinese text, using simplified characters) and the question/options.
  2. Reading: 3 questions. Provide a short passage and question.
  3. Grammar: 4 questions. Fill-in-the-blank or structure.

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
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
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
      }
    });

    return JSON.parse(response.text || '{}');
  });
}

export async function generateVocabularyBatch(level: HSKLevel, lang: AppLanguage): Promise<VocabCard[]> {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';
  
  const prompt = `Generate a list of 10 essential vocabulary words for ${level}.
  Translate definitions to ${LANG_NAMES[lang] || lang}.
  Include Pinyin with accurate tone marks for every word and example sentence.
  Return strictly JSON.`;

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              character: { type: Type.STRING, description: 'The Chinese characters' },
              pinyin: { type: Type.STRING, description: 'Pinyin with tone marks' },
              translation: { type: Type.STRING, description: `Meaning in ${LANG_NAMES[lang]}` },
              exampleSentence: { type: Type.STRING, description: 'Chinese example sentence' },
              examplePinyin: { type: Type.STRING, description: 'Pinyin for the example sentence with tone marks' },
              exampleTranslation: { type: Type.STRING, description: `Translation of example in ${LANG_NAMES[lang]}` }
            },
            required: ['character', 'pinyin', 'translation', 'exampleSentence', 'examplePinyin', 'exampleTranslation']
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  });
}

export async function generatePracticeSentence(level: HSKLevel, lang: AppLanguage): Promise<{character: string, pinyin: string, translation: string}> {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';
  const prompt = `Generate one simple, natural Chinese sentence (5-10 chars) for HSK level ${level}.
  Include Pinyin and translation in ${LANG_NAMES[lang] || lang}.
  Return strictly JSON: { "character": "...", "pinyin": "...", "translation": "..." }`;

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
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
  const ai = getAI();
  const model = 'gemini-2.5-flash-preview-tts';
  
  if (!text || !text.trim()) {
      throw new Error("Text is empty");
  }

  // Improved cleaning regex to preserve sentence structure
  // Preserves: CJK, Cyrillic, Latin Ext, Standard Punctuation, Parentheses, Dashes
  // Limit: 4000 chars for long tutor responses
  const cleanText = text
      .replace(/https?:\/\/\S+/g, '') // Remove URLs
      .replace(/[*_`#\[\]]/g, '')     // Remove Markdown chars (keep parens)
      .replace(/[^\w\s\u4e00-\u9fa5\u0400-\u04FF\u00C0-\u024F.,?!:;'"()—\-]/g, '') 
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 4000);

  // Ensure it ends with punctuation to hint it's a sentence to read, not a prompt
  const finalCleanText = cleanText.match(/[.?!。？！]$/) ? cleanText : `${cleanText}.`;

  if (!finalCleanText || finalCleanText === '.') {
     throw new Error("Text contains only symbols or unsupported characters, cannot generate speech.");
  }

  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  const generateWithConfig = async (voiceName: string) => {
    return retryOperation(async () => {
      return await ai.models.generateContent({
        model,
        contents: [{ parts: [{ text: finalCleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName } 
            } 
          },
          safetySettings,
        },
      });
    });
  };

  try {
    let response;
    try {
        response = await generateWithConfig('Kore');
    } catch (err: any) {
        if (err.message && (err.message.includes("Model tried to generate text") || err.message.includes("INVALID_ARGUMENT"))) {
           throw err;
        }
        console.warn("TTS Primary Voice Error, retrying with fallback:", err);
        response = await generateWithConfig('Puck');
    }

    const candidate = response.candidates?.[0];
    if (!candidate) {
         throw new Error("No candidates returned from TTS model.");
    }
    
    if (candidate.finishReason !== 'STOP' && candidate.finishReason !== undefined) { 
         if (candidate.finishReason === 'OTHER' || candidate.finishReason === 'SAFETY') {
             console.warn("TTS Blocked/Failed with reason:", candidate.finishReason);
             throw new Error("Speech generation blocked by safety or content filters.");
         }
    }

    const audioData = candidate.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
        throw new Error("Model returned no audio data.");
    }
    
    const binaryString = atob(audioData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error: any) {
    if (!error.message?.includes("Model tried to generate text")) {
        console.error("TTS Execution Error:", error);
    }
    throw error;
  }
}

// ... playRawAudio, speakBrowser, playTextToSpeech, generateVisualAid, transcribeAudio, evaluatePronunciation (Unchanged)
export async function playRawAudio(buffer: ArrayBuffer): Promise<void> {
  stopTtsAudio(); // Stop any currently playing TTS

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
  
  // Track current source
  currentTtsSource = source;
  source.onended = () => {
    if (currentTtsSource === source) {
      currentTtsSource = null;
    }
  };

  source.start(0);
}

export function speakBrowser(text: string, lang: string = 'zh-CN') {
  stopTtsAudio(); // Stop any currently playing TTS
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
    // Reduce noise: only warn if it's NOT the known model quirk
    if (!e.message?.includes("Model tried to generate text")) {
        console.warn("Gemini TTS failed, falling back to browser TTS", e);
    }
    speakBrowser(text);
  }
}

export async function generateVisualAid(prompt: string, aspectRatio: string = "1:1"): Promise<string | null> {
  const ai = getAI();
  const model = 'gemini-3-pro-image-preview';
  
  return retryOperation(async () => {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any, 
            imageSize: "1K"
          }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (e) {
      console.error("Image Gen Error", e);
      throw e; 
    }
  });
}

export async function transcribeAudio(audioBase64: string, mimeType: string = 'audio/wav'): Promise<string> {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';
  
  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          },
          { text: "Transcribe exactly what is said in this audio." }
        ]
      }
    });
    return response.text || "";
  });
}

export async function evaluatePronunciation(audioBase64: string, mimeType: string, referenceText?: string, lang: AppLanguage = AppLanguage.EN): Promise<string> {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';
  
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
     - **Feedback**: [Specific advice in ${LANG_NAMES[lang] || lang}. e.g., "You used the 2nd tone (rising) but it should be 4th tone (falling)."]
  `;

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          },
          { text: prompt }
        ]
      }
    });

    return response.text || "Could not evaluate pronunciation.";
  });
}

// --- Live API Connect ---

export function connectLiveSession(
  lang: AppLanguage,
  level: HSKLevel,
  callbacks: {
    onOpen: () => void;
    onMessage: (msg: LiveServerMessage) => void;
    onClose: () => void;
    onError: (err: any) => void;
  }
) {
  const ai = getAI();
  const systemInstruction = `You are a friendly verbal Chinese tutor.
  Level: ${level}.
  User Language: ${LANG_NAMES[lang] || lang}.
  Engage in a simple conversation suitable for the HSK level. 
  Correct pronunciation or grammar gently if needed, but prioritize flow.`;

  // Safety settings for Live API
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
      },
      systemInstruction,
    },
    callbacks: {
      onopen: callbacks.onOpen,
      onmessage: callbacks.onMessage,
      onclose: callbacks.onClose,
      onerror: callbacks.onError
    }
  });
}
