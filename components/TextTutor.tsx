
import React, { useState, useRef, useEffect, useContext, createContext, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Image as ImageIcon, Volume2, Search, BrainCircuit, Mic, Ear, RefreshCw, AlertCircle, Trash2, StopCircle, X, History, TrendingUp, Calendar, BookOpen, RotateCw, ThumbsUp, Smile, Star, Eye, EyeOff, Check, Play, Pause } from 'lucide-react';
import { generateTutorResponse, playRawAudio, generateSpeech, transcribeAudio, evaluatePronunciation, getFriendlyErrorMessage, arrayBufferToBase64, base64ToUint8Array, stopTtsAudio, speakBrowser, generateVocabularyBatch, playTextToSpeech, generatePracticeSentence } from '../services/gemini';
import { saveChatMessage, getChatHistory, clearChatHistory, updateMessageAudio, savePronunciationAttempt, getPronunciationHistory, getCachedAudio, saveCachedAudio, saveVocabProgress, toggleVocabBookmark } from '../services/db';
import { ChatMessage, AppLanguage, HSKLevel, PronunciationAttempt, VocabCard } from '../types';
import { translations } from '../utils/translations';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
  initialTutorMode?: 'chat' | 'review';
  onTutorModeChange?: (mode: 'chat' | 'review') => void;
}

// --- Context for Deep Components ---

interface TutorContextType {
  activeWordRecording: string | null;
  handleWordRecord: (text: string) => void;
  audioCache: Record<string, ArrayBuffer>;
  playAudio: (text: string) => Promise<void>;
  evaluationResult: { text: string; feedback: string } | null;
  setEvaluationResult: (res: { text: string; feedback: string } | null) => void;
  showWordHistory: (text: string) => void;
}

const TutorContext = createContext<TutorContextType>({
  activeWordRecording: null,
  handleWordRecord: () => {},
  audioCache: {},
  playAudio: async () => {},
  evaluationResult: null,
  setEvaluationResult: () => {},
  showWordHistory: () => {}
});

// Helper component for individual Chinese words
const ChineseWord: React.FC<{ text: string }> = ({ text }) => {
  const { activeWordRecording, handleWordRecord, playAudio, evaluationResult, setEvaluationResult, showWordHistory } = useContext(TutorContext);
  const [loadingAudio, setLoadingAudio] = useState(false);
  
  const isRecording = activeWordRecording === text;
  const hasFeedback = evaluationResult?.text === text;

  const play = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loadingAudio) return;
    setLoadingAudio(true);
    await playAudio(text);
    setLoadingAudio(false);
  };

  const toggleRecord = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasFeedback) {
        setEvaluationResult(null);
    }
    handleWordRecord(text);
  };

  const openHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    showWordHistory(text);
  };

  return (
    <span className="relative inline-flex items-center mx-0.5 group whitespace-nowrap bg-gray-50 rounded px-1 border border-gray-100">
      <span 
        className="cursor-pointer hover:underline decoration-dotted decoration-2 underline-offset-4 transition-all text-gray-800 font-medium" 
        onClick={play}
        title="Click to pronounce"
      >
        {text}
      </span>
      <div className="flex items-center ml-1 space-x-0.5">
          <button 
            onClick={play}
            className={`p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors ${loadingAudio ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
            title="Listen"
          >
            {loadingAudio ? (
              <RefreshCw size={10} className="animate-spin" />
            ) : (
              <Volume2 size={12} fill="currentColor" />
            )}
          </button>
          <button 
            onClick={toggleRecord}
            className={`p-1 rounded-full transition-colors ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-gray-200 text-gray-400 hover:text-red-500 opacity-40 group-hover:opacity-100'}`}
            title="Practice Pronunciation"
          >
            {isRecording ? (
               <StopCircle size={12} fill="currentColor" />
            ) : (
               <Mic size={12} />
            )}
          </button>
          <button 
            onClick={openHistory}
            className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-blue-500 opacity-40 group-hover:opacity-100 transition-colors"
            title="View History"
          >
             <History size={12} />
          </button>
      </div>

      {hasFeedback && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 z-[60] animate-fade-in pointer-events-auto">
            <div className="bg-white rounded-xl shadow-2xl border border-blue-100 p-4 relative">
                <button 
                    onClick={(e) => { e.stopPropagation(); setEvaluationResult(null); }}
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                >
                    <X size={14} />
                </button>
                <div className="prose prose-sm text-gray-800">
                    <ReactMarkdown>{evaluationResult.feedback}</ReactMarkdown>
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-blue-100 rotate-45 -mt-1.5"></div>
            </div>
        </div>
      )}
    </span>
  );
};

// Recursive helper to process markdown children and inject ChineseWord components
const processChildren = (children: React.ReactNode): React.ReactNode => {
  return React.Children.map(children, child => {
      if (typeof child === 'string') {
          // Regex to split by Chinese characters (ranges for standard CJK)
          const parts = child.split(/([\u4e00-\u9fa5]+)/g);
          return parts.map((part, i) => {
              if (/([\u4e00-\u9fa5]+)/.test(part)) {
                  return <ChineseWord key={`${i}-${part}`} text={part} />;
              }
              return part;
          });
      }
      if (React.isValidElement(child)) {
           // @ts-ignore
           if (child.props && child.props.children) {
               // @ts-ignore
               return React.cloneElement(child, { ...child.props, children: processChildren(child.props.children) });
           }
      }
      return child;
  });
};

const TextTutor: React.FC<Props> = ({ language, level, initialTutorMode, onTutorModeChange }) => {
  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [useSearch, setUseSearch] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  
  // Persisted or default mode
  const [tutorMode, setInternalTutorMode] = useState<'chat' | 'review'>(initialTutorMode || 'chat');
  
  const setTutorMode = (m: 'chat' | 'review') => {
      setInternalTutorMode(m);
      if (onTutorModeChange) onTutorModeChange(m);
  };
  
  // Review/Flashcard State
  const [reviewCards, setReviewCards] = useState<VocabCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [isReviewFlipped, setIsReviewFlipped] = useState(false);
  const [showReviewExample, setShowReviewExample] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewCompleted, setReviewCompleted] = useState(false);
  
  // Recording State
  const [recordingMode, setRecordingMode] = useState<'none' | 'transcribe' | 'evaluate'>('none');
  const [activeWordRecording, setActiveWordRecording] = useState<string | null>(null);
  const recordingTargetRef = useRef<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<{text: string, feedback: string} | null>(null);
  
  // History Modal State
  const [historyWord, setHistoryWord] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<PronunciationAttempt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeUserAudio, setActiveUserAudio] = useState<string | null>(null); // Index or ID of playing audio
  
  // TTS & Error State
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  
  // Audio Cache
  const audioCache = useRef<Record<string, ArrayBuffer>>({});
  
  // Text Response Cache
  const textCache = useRef<Record<string, { text: string; groundingChunks: any[] }>>({});

  const t = translations[language].tutor;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const userAudioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Memoize markdown components
  const markdownComponents = useMemo(() => ({
      p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed">{processChildren(children)}</p>,
      li: ({ children }: any) => <li className="mb-1">{processChildren(children)}</li>,
      strong: ({ children }: any) => <strong className="font-bold">{processChildren(children)}</strong>,
      em: ({ children }: any) => <em className="italic">{processChildren(children)}</em>,
      h1: ({ children }: any) => <h1 className="text-xl font-bold mb-2">{processChildren(children)}</h1>,
      h2: ({ children }: any) => <h2 className="text-lg font-bold mb-2">{processChildren(children)}</h2>,
      h3: ({ children }: any) => <h3 className="text-md font-bold mb-2">{processChildren(children)}</h3>,
      blockquote: ({ children }: any) => <blockquote className="border-l-4 border-gray-300 pl-4 italic my-2">{processChildren(children)}</blockquote>,
  }), []);

  // Load history
  useEffect(() => {
    const loadHistory = async () => {
      const history = await getChatHistory();
      if (history.length > 0) {
        setMessages(history);
      }
    };
    loadHistory();
  }, []); 

  const scrollToBottom = () => {
    if (tutorMode === 'chat') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(scrollToBottom, [messages, tutorMode]);

  const showGeneralError = (error: any) => {
    const msg = typeof error === 'string' ? error : getFriendlyErrorMessage(error);
    setGeneralError(msg);
    setTimeout(() => setGeneralError(null), 8000); // 8 seconds timeout
  };

  // --- Flashcard Logic ---
  const loadReviewCards = async () => {
    setReviewLoading(true);
    setReviewCompleted(false);
    setReviewIndex(0);
    setIsReviewFlipped(false);
    setShowReviewExample(false);
    try {
      const cards = await generateVocabularyBatch(level, language);
      setReviewCards(cards);
    } catch (e) {
      showGeneralError(e);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleReviewRate = async (rating: 'hard' | 'good' | 'easy') => {
      const card = reviewCards[reviewIndex];
      await saveVocabProgress(card, level, rating);
      
      if (reviewIndex < reviewCards.length - 1) {
          setIsReviewFlipped(false);
          setShowReviewExample(false);
          setTimeout(() => setReviewIndex(prev => prev + 1), 200);
      } else {
          setReviewCompleted(true);
      }
  };

  const toggleReviewBookmark = async (e: React.MouseEvent) => {
      e.stopPropagation();
      const currentCard = reviewCards[reviewIndex];
      try {
        const newState = await toggleVocabBookmark(currentCard, level);
        const updatedCards = [...reviewCards];
        updatedCards[reviewIndex] = { ...currentCard, bookmarked: newState };
        setReviewCards(updatedCards);
      } catch (e) {
        console.error("Failed to toggle bookmark", e);
      }
  };

  // --- Chat Logic ---

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    saveChatMessage(userMsg); 

    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    // Cache Key Logic
    const lastModelMsg = messages.filter(m => m.role === 'model').pop();
    const cacheKey = `${lastModelMsg?.id || 'root'}:${userMsg.text.trim()}:${language}:${level}`;

    try {
      let responseText = "";
      let groundingChunks = undefined;

      // Check Text Cache
      if (!userMsg.image && textCache.current[cacheKey]) {
          const cached = textCache.current[cacheKey];
          responseText = cached.text;
          groundingChunks = cached.groundingChunks;
      } else {
          const history = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
          }));

          const response = await generateTutorResponse(
            history, 
            userMsg.text, 
            userMsg.image || null, 
            language, 
            level,
            useSearch,
            useThinking
          );

          if (!response.text) {
             throw new Error("EMPTY_RESPONSE_FROM_AI");
          }

          responseText = response.text;
          groundingChunks = response.groundingChunks;

          // Save to Cache
          if (!userMsg.image) {
              textCache.current[cacheKey] = {
                  text: responseText,
                  groundingChunks
              };
          }
      }

      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        groundingUrls: groundingChunks?.map((c: any) => c.web ? c.web : c.maps)
                                                .filter((x: any) => x && x.uri)
      };

      setMessages(prev => [...prev, botMsg]);
      saveChatMessage(botMsg);
    } catch (error: any) {
      console.error("Tutor Error:", error);
      
      let errorTitle = "Communication Error";
      let errorBody = "I encountered an issue while processing your request.";
      let errorIcon = "⚠️";

      // Improved Error Mapping
      if (error.message === "EMPTY_RESPONSE_FROM_AI") {
         errorTitle = "Empty Response";
         errorBody = "I didn't know how to respond to that. Could you try rephrasing your question or asking about a specific HSK topic?";
         errorIcon = "😶";
      } else {
         const friendlyMsg = getFriendlyErrorMessage(error);
         
         if (friendlyMsg.includes("Quota")) {
            errorTitle = "Daily Limit Reached";
            errorBody = "I've used up my daily thinking capacity. Please try again later or check your plan.";
            errorIcon = "🛑";
         } else if (friendlyMsg.includes("busy") || friendlyMsg.includes("unavailable")) {
            errorTitle = "System Overloaded";
            errorBody = "The AI servers are currently experiencing high traffic. Please wait a few moments and try again.";
            errorIcon = "🔥";
         } else if (friendlyMsg.includes("network") || friendlyMsg.includes("connection") || friendlyMsg.includes("fetch")) {
            errorTitle = "Network Issue";
            errorBody = "I couldn't connect to the server. Please check your internet connection.";
            errorIcon = "📡";
         } else if (friendlyMsg.includes("safety") || friendlyMsg.includes("blocked")) {
             errorTitle = "Content Filter";
             errorBody = "I can't discuss that topic. As a language tutor, I focus on helping you learn Chinese safely.";
             errorIcon = "🛡️";
         } else if (friendlyMsg.includes("Access denied")) {
             errorTitle = "Access Denied";
             errorBody = "There seems to be an issue with the API key or permissions. Please verify the configuration.";
             errorIcon = "🔐";
         } else {
             errorBody = friendlyMsg || "An unexpected error occurred. Please try again.";
         }
      }

      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: `### ${errorIcon} ${errorTitle}\n\n${errorBody}`
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (confirm("Are you sure you want to clear the chat history?")) {
        setMessages([]);
        await clearChatHistory();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const startRecording = async (mode: 'transcribe' | 'evaluate', referenceText?: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingTargetRef.current = referenceText || null;
      
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setIsLoading(true);
          try {
            if (mode === 'transcribe') {
               const transcription = await transcribeAudio(base64, mimeType);
               setInput(prev => (prev ? prev + " " : "") + transcription);
            } else if (mode === 'evaluate') {
               const target = recordingTargetRef.current || input;
               
               if (!recordingTargetRef.current) {
                   const audioMsg: ChatMessage = {
                      id: Date.now().toString(),
                      role: 'user',
                      text: `🎤 *Pronunciation Check*${target ? ` for: "**${target}**"` : ""}`
                   };
                   setMessages(prev => [...prev, audioMsg]);
                   saveChatMessage(audioMsg);
               }
               
               const feedback = await evaluatePronunciation(base64, mimeType, target, language);
               
               // Parse the feedback to extract score and pinyin for saving history
               const scoreMatch = feedback.match(/\*\*Score\*\*:\s*(\d+)/);
               const heardMatch = feedback.match(/\*\*Heard\*\*:\s*(.*)/);
               const pinyinMatch = feedback.match(/\*\*Pinyin\*\*:\s*(.*)/);

               if (recordingTargetRef.current) {
                  setEvaluationResult({ text: recordingTargetRef.current, feedback });
                  
                  // Save attempt history including the audio data URI
                  await savePronunciationAttempt({
                     word: recordingTargetRef.current,
                     heard: heardMatch ? heardMatch[1].trim() : "",
                     pinyin: pinyinMatch ? pinyinMatch[1].trim() : "",
                     score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
                     feedback: feedback,
                     audio: `data:${mimeType};base64,${base64}`,
                     timestamp: Date.now()
                  });
               } else {
                  const feedbackMsg: ChatMessage = {
                      id: (Date.now() + 1).toString(),
                      role: 'model',
                      text: feedback
                   };
                   setMessages(prev => [...prev, feedbackMsg]);
                   saveChatMessage(feedbackMsg);
               }
            }
          } catch (e) {
            console.error(e);
            showGeneralError(e);
          } finally {
            setIsLoading(false);
            setRecordingMode('none');
            setActiveWordRecording(null);
            recordingTargetRef.current = null;
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setRecordingMode(mode);
    } catch (e: any) {
      console.error(e);
      showGeneralError(e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleWordRecord = (text: string) => {
    if (activeWordRecording === text) {
      stopRecording();
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording(); 
      }
      setActiveWordRecording(text);
      startRecording('evaluate', text);
    }
  };

  // Consolidated TTS handler with user feedback
  const playAudioWithFallback = async (text: string, cacheKey: string): Promise<ArrayBuffer | null> => {
    // 1. Check RAM Cache First
    if (audioCache.current[cacheKey]) {
      try {
        await playRawAudio(audioCache.current[cacheKey]);
        return audioCache.current[cacheKey];
      } catch (e) {
        delete audioCache.current[cacheKey]; // Invalid cache
      }
    }

    // 2. Check Global DB Cache (Cloud/Local Shared)
    try {
        const cachedBase64 = await getCachedAudio(text);
        if (cachedBase64) {
             const buffer = base64ToUint8Array(cachedBase64).buffer;
             audioCache.current[cacheKey] = buffer; // Update RAM cache
             await playRawAudio(buffer);
             return buffer;
        }
    } catch (e) {
        console.warn("Error fetching global cache", e);
    }

    // 3. Generate Fresh Audio
    try {
      const buffer = await generateSpeech(text);
      
      // Update caches
      audioCache.current[cacheKey] = buffer;
      const base64 = arrayBufferToBase64(buffer);
      
      // Fire and forget save to global DB
      saveCachedAudio(text, base64).catch(e => console.warn("Background audio save failed", e));
      
      await playRawAudio(buffer);
      return buffer;
    } catch (error) {
      console.warn("Gemini TTS failed, falling back to browser speech:", error);
      
      // Construct friendly message
      let errorMsg = getFriendlyErrorMessage(error);
      if (errorMsg.includes("Quota") || errorMsg.includes("unavailable")) {
         errorMsg = "AI Voice unavailable (Quota/Net), using system voice.";
      } else {
         errorMsg = "Using system voice fallback.";
      }
      
      showGeneralError(errorMsg);
      speakBrowser(text);
      return null;
    }
  };

  const playWordAudio = async (text: string) => {
    await playAudioWithFallback(text, text);
  };

  const handleAudioPlay = async (text: string, msgId: string) => {
    // If this specific message is already processing/playing, ignore click
    if (playingMsgId === msgId) return;
    
    // Stop any currently playing audio immediately
    stopTtsAudio();
    setPlayingMsgId(msgId);
    
    try {
      const currentMsg = messages.find(m => m.id === msgId);

      // 1. Check RAM Cache (Fastest)
      if (audioCache.current[text]) {
         try {
             await playRawAudio(audioCache.current[text]);
             return; 
         } catch (e) {
             delete audioCache.current[text];
         }
      }

      // 2. Check DB/State Message Audio (Base64)
      if (currentMsg?.audio) {
         try {
             const bytes = base64ToUint8Array(currentMsg.audio);
             audioCache.current[text] = bytes.buffer.slice(0); // Cache for next time
             await playRawAudio(bytes.buffer);
             return;
         } catch (e) {
             console.warn("DB Audio corrupted");
         }
      }

      // 3. Generate New Audio with fallback (checks Global Cache internally)
      const buffer = await playAudioWithFallback(text, text);
      if (buffer) {
         // Persist success to message history specifically
         const base64 = arrayBufferToBase64(buffer);
         setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audio: base64 } : m));
         updateMessageAudio(msgId, base64).catch(e => console.error("Audio save failed", e));
      }
    } catch (e: any) {
      console.error("Playback failed completely", e);
      speakBrowser(text);
      showGeneralError("Audio playback failed.");
    } finally {
      // Only clear if we are still the active message
      setPlayingMsgId(prev => prev === msgId ? null : prev);
    }
  };

  const showWordHistory = async (word: string) => {
      setHistoryWord(word);
      setHistoryLoading(true);
      try {
          const data = await getPronunciationHistory(word);
          setHistoryData(data);
      } catch (e) {
          console.error(e);
          showGeneralError("Failed to fetch history");
      } finally {
          setHistoryLoading(false);
      }
  };

  // Helper to play user audio from history
  const playUserAudio = (dataUri: string, id: string) => {
    if (userAudioPlayerRef.current) {
        userAudioPlayerRef.current.pause();
        if (activeUserAudio === id) {
            setActiveUserAudio(null);
            return;
        }
    }
    
    const audio = new Audio(dataUri);
    userAudioPlayerRef.current = audio;
    setActiveUserAudio(id);
    
    audio.onended = () => setActiveUserAudio(null);
    audio.onerror = () => {
        showGeneralError("Failed to play recording.");
        setActiveUserAudio(null);
    };
    
    audio.play();
  };

  const contextValue: TutorContextType = {
      activeWordRecording,
      handleWordRecord,
      audioCache: audioCache.current,
      playAudio: playWordAudio,
      evaluationResult,
      setEvaluationResult,
      showWordHistory
  };

  return (
    <TutorContext.Provider value={contextValue}>
    <div className="flex flex-col h-full bg-gray-50 relative">
      
      {/* Prominent Top Alert for General Errors */}
      {generalError && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-2xl z-50 animate-fade-in">
            <div className="bg-red-50 border border-red-200 rounded-xl shadow-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={20} />
                <div className="flex-1">
                    <h3 className="text-sm font-bold text-red-800">Attention Needed</h3>
                    <p className="text-sm text-red-700 mt-1 leading-relaxed">{generalError}</p>
                </div>
                <button 
                    onClick={() => setGeneralError(null)} 
                    className="text-red-400 hover:text-red-700 transition-colors p-1"
                >
                    <X size={20} />
                </button>
            </div>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 z-10">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
              <button 
                onClick={() => setTutorMode('chat')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center ${tutorMode === 'chat' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Send size={14} className="mr-2" />
                Chat
              </button>
              <button 
                onClick={() => {
                   setTutorMode('review');
                   if (reviewCards.length === 0) loadReviewCards();
                }}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center ${tutorMode === 'review' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <BookOpen size={14} className="mr-2" />
                Flashcards
              </button>
          </div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:block">
              {tutorMode === 'chat' ? 'AI Tutor' : 'Vocab Review'}
          </div>
      </div>

      {/* --- CHAT VIEW --- */}
      <div className={`flex flex-col flex-1 overflow-hidden relative ${tutorMode === 'chat' ? 'block' : 'hidden'}`}>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
                <h2 className="text-2xl font-bold mb-2">{t.welcome}</h2>
                <p>{t.start}</p>
                <p className="text-sm mt-2">{t.desc}</p>
            </div>
            )}
            {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl ${
                msg.role === 'user' ? 'bg-red-600 text-white rounded-br-none' : 'bg-white shadow-sm rounded-bl-none border border-gray-100'
                }`}>
                {msg.image && (
                    <img src={msg.image} alt="User upload" className="max-w-full h-auto rounded mb-2 max-h-48 object-cover" />
                )}
                <div className={`prose ${msg.role === 'user' ? 'prose-invert' : 'text-gray-800'} max-w-none`}>
                    <ReactMarkdown components={markdownComponents}>
                    {msg.text}
                    </ReactMarkdown>
                </div>
                
                {msg.role === 'model' && (
                    <div className="flex items-center space-x-2 mt-2 flex-wrap">
                    <button 
                        onClick={() => handleAudioPlay(msg.text, msg.id)}
                        className={`p-1.5 rounded-full transition-colors flex items-center ${
                        playingMsgId === msg.id 
                            ? 'bg-red-100 text-red-600 cursor-wait' 
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                    >
                        {playingMsgId === msg.id ? (
                        <RefreshCw size={16} className="animate-spin" />
                        ) : (
                        <Volume2 size={16} />
                        )}
                    </button>
                    </div>
                )}
                </div>
            </div>
            ))}
            {isLoading && (
            <div className="flex justify-start">
                <div className="bg-white p-4 rounded-2xl rounded-bl-none shadow-sm flex items-center space-x-2">
                    <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-red-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
            </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="bg-white p-4 border-t border-gray-200 relative">
            {selectedImage && (
            <div className="flex items-center mb-3 animate-fade-in px-1">
                <div className="relative group">
                    <img src={selectedImage} alt="Upload preview" className="h-16 w-16 object-cover rounded-xl border border-gray-200 shadow-sm" />
                    <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                    >
                    <X size={12} />
                    </button>
                </div>
                <div className="ml-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-0.5">{t.imageAttached}</p>
                    <p className="text-xs text-gray-400">Will be sent with message</p>
                </div>
            </div>
            )}
            <div className="flex items-center space-x-2">
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                title="Upload Image"
            >
                <ImageIcon size={20} />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
            
            <button
                onMouseDown={() => startRecording('transcribe')}
                onMouseUp={stopRecording}
                className={`p-2 rounded-full ${recordingMode === 'transcribe' ? 'bg-red-100 text-red-600 animate-pulse' : 'text-gray-500 hover:bg-gray-100'}`}
            >
                <Mic size={20} />
            </button>

            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={t.placeholder}
                className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button 
                onClick={handleSend}
                disabled={(!input.trim() && !selectedImage) || isLoading}
                className={`p-2 rounded-full ${(!input.trim() && !selectedImage) || isLoading ? 'bg-gray-200 text-gray-400' : 'bg-red-600 text-white hover:bg-red-700'}`}
            >
                <Send size={20} />
            </button>
            </div>
        </div>
      </div>

      {/* --- FLASHCARD VIEW --- */}
      <div className={`flex flex-col flex-1 overflow-y-auto p-6 items-center ${tutorMode === 'review' ? 'block' : 'hidden'}`}>
         {reviewLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <RefreshCw className="animate-spin text-red-600 mb-4" size={40} />
                <p>Preparing vocabulary for {level}...</p>
            </div>
         ) : reviewCompleted ? (
            <div className="flex flex-col items-center justify-center h-full max-w-sm w-full text-center">
                <div className="bg-white p-8 rounded-3xl shadow-lg w-full">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Review Complete!</h2>
                    <p className="text-gray-500 mb-6">Great job practicing your vocabulary.</p>
                    <button 
                        onClick={loadReviewCards}
                        className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center"
                    >
                        <RefreshCw size={18} className="mr-2" /> Start New Batch
                    </button>
                    <button 
                        onClick={() => setTutorMode('chat')}
                        className="w-full mt-3 text-gray-500 hover:text-gray-700 font-medium transition-colors"
                    >
                        Back to Chat
                    </button>
                </div>
            </div>
         ) : reviewCards.length > 0 ? (
            <div className="w-full max-w-xl h-full flex flex-col items-center justify-center perspective-1000">
                <div className="w-full flex justify-between items-center mb-6 px-2">
                    <h3 className="text-xl font-bold text-gray-800">Card {reviewIndex + 1} / {reviewCards.length}</h3>
                    <div className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full">{level}</div>
                </div>

                <div 
                    onClick={() => setIsReviewFlipped(!isReviewFlipped)}
                    className="relative w-full aspect-[4/5] md:aspect-[3/2] cursor-pointer group perspective-1000 transition-transform duration-200 active:scale-[0.98]"
                >
                    <div className={`relative w-full h-full duration-500 preserve-3d transition-all transform ${isReviewFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: 'preserve-3d', transform: isReviewFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                        {/* Front */}
                        <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl border border-gray-200 flex flex-col items-center justify-center p-8 text-center" style={{ backfaceVisibility: 'hidden' }}>
                            <div className="absolute top-4 right-4 z-50">
                                <button 
                                    onClick={toggleReviewBookmark}
                                    className={`p-3 rounded-full transition-colors ${reviewCards[reviewIndex].bookmarked ? 'text-yellow-400 bg-yellow-50' : 'text-gray-300 hover:text-yellow-400'}`}
                                >
                                    <Star size={24} fill={reviewCards[reviewIndex].bookmarked ? "currentColor" : "none"} />
                                </button>
                            </div>
                            <span className="text-gray-400 text-sm uppercase tracking-widest mb-4">Character</span>
                            <h2 className="text-8xl font-bold text-gray-800 mb-8">{reviewCards[reviewIndex].character}</h2>
                            <div className="text-gray-400 text-sm mt-8 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                                <RotateCw size={14} className="mr-1" /> Tap to flip
                            </div>
                        </div>

                        {/* Back */}
                        <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl border-2 border-red-100 flex flex-col items-center justify-center p-6 text-center overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                            <div className="absolute top-4 right-4 z-50">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); playWordAudio(reviewCards[reviewIndex].character); }} 
                                    className="p-3 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors shadow-sm"
                                >
                                    <Volume2 size={24} />
                                </button>
                            </div>
                            
                            <h2 className="text-6xl font-bold text-gray-800 mb-1">{reviewCards[reviewIndex].character}</h2>
                            <h3 className="text-3xl font-bold text-red-600 mb-2">{reviewCards[reviewIndex].pinyin}</h3>
                            <p className="text-xl text-gray-800 font-medium mb-4">{reviewCards[reviewIndex].translation}</p>
                            
                            <div className="w-full transition-all duration-300">
                                {showReviewExample ? (
                                    <div className="w-full bg-gray-50 p-4 rounded-xl text-left animate-fade-in border border-gray-100">
                                    <p className="text-lg text-gray-800 mb-1 leading-tight">{reviewCards[reviewIndex].exampleSentence}</p>
                                    <p className="text-sm text-gray-500 italic leading-tight">{reviewCards[reviewIndex].exampleTranslation}</p>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setShowReviewExample(false); }}
                                        className="mt-2 text-xs text-gray-400 hover:text-red-500 flex items-center"
                                    >
                                        <EyeOff size={12} className="mr-1" /> Hide example
                                    </button>
                                    </div>
                                ) : (
                                    <button 
                                    onClick={(e) => { e.stopPropagation(); setShowReviewExample(true); }}
                                    className="py-2 px-4 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex items-center text-sm font-medium border border-gray-200"
                                    >
                                    <Eye size={16} className="mr-2 text-blue-500" />
                                    Show Example
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8 w-full h-20">
                    {!isReviewFlipped ? (
                        <button 
                            onClick={() => setIsReviewFlipped(true)}
                            className="w-full py-4 rounded-xl font-bold bg-gray-900 text-white hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all active:scale-[0.98] flex items-center justify-center"
                        >
                            <RotateCw size={20} className="mr-2" /> Flip Card
                        </button>
                    ) : (
                        <div className="grid grid-cols-3 gap-4 animate-fade-in">
                            <button 
                            onClick={() => handleReviewRate('hard')}
                            className="py-4 rounded-xl font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-all active:scale-[0.98] flex flex-col items-center justify-center shadow-sm"
                            >
                            <AlertCircle size={20} className="mb-1" />
                            Hard
                            </button>
                            <button 
                            onClick={() => handleReviewRate('good')}
                            className="py-4 rounded-xl font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all active:scale-[0.98] flex flex-col items-center justify-center shadow-sm"
                            >
                            <ThumbsUp size={20} className="mb-1" />
                            Good
                            </button>
                            <button 
                            onClick={() => handleReviewRate('easy')}
                            className="py-4 rounded-xl font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-all active:scale-[0.98] flex flex-col items-center justify-center shadow-sm"
                            >
                            <Smile size={20} className="mb-1" />
                            Easy
                            </button>
                        </div>
                    )}
                </div>
            </div>
         ) : (
             // Initial Empty State
             <div className="flex flex-col items-center justify-center h-full text-center max-w-sm">
                 <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                    <BookOpen size={32} className="text-gray-400" />
                 </div>
                 <h2 className="text-2xl font-bold text-gray-800 mb-2">Vocabulary Practice</h2>
                 <p className="text-gray-500 mb-8">Review common words for {level} directly in the tutor.</p>
                 <button 
                    onClick={loadReviewCards}
                    className="w-full bg-red-600 text-white py-4 rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200 flex items-center justify-center"
                 >
                    <RefreshCw size={20} className="mr-2" /> Load Words
                 </button>
             </div>
         )}
      </div>

      {/* History Modal */}
      {historyWord && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh] overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                      <div>
                          <h3 className="text-2xl font-bold text-gray-900 flex items-center">
                              <History className="mr-2 text-blue-500" size={24} />
                              {historyWord}
                          </h3>
                          <p className="text-sm text-gray-500">Pronunciation Improvement Tracking</p>
                      </div>
                      <button 
                        onClick={() => { 
                            setHistoryWord(null); 
                            if(userAudioPlayerRef.current) userAudioPlayerRef.current.pause(); 
                            setActiveUserAudio(null);
                        }} 
                        className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                      >
                          <X size={24} className="text-gray-400" />
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {historyLoading ? (
                          <div className="flex items-center justify-center py-12">
                              <RefreshCw className="animate-spin text-blue-500" size={32} />
                          </div>
                      ) : historyData.length === 0 ? (
                          <div className="text-center py-12 text-gray-400">
                              <Ear className="mx-auto mb-4 opacity-20" size={64} />
                              <p>No attempts recorded yet for this word.</p>
                          </div>
                      ) : (
                          historyData.map((attempt, i) => (
                              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                  <div className="flex justify-between items-start mb-3">
                                      <div className="flex items-center text-xs font-bold text-gray-400 uppercase tracking-wider">
                                          <Calendar size={14} className="mr-1" />
                                          {new Date(attempt.timestamp).toLocaleDateString()}
                                      </div>
                                      <div className={`px-2 py-1 rounded text-xs font-bold ${attempt.score >= 8 ? 'bg-green-100 text-green-700' : attempt.score >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                          Score: {attempt.score}/10
                                      </div>
                                  </div>
                                  <div className="flex items-baseline space-x-2 mb-2">
                                      <span className="text-lg font-bold text-gray-800">{attempt.heard}</span>
                                      <span className="text-sm text-blue-600 font-medium">{attempt.pinyin}</span>
                                  </div>

                                  {/* Playback Controls */}
                                  <div className="flex items-center space-x-3 mt-3 mb-3 bg-gray-50 p-2 rounded-xl">
                                      {attempt.audio && (
                                          <button 
                                            onClick={() => playUserAudio(attempt.audio!, `${i}`)}
                                            className={`flex-1 flex items-center justify-center py-2 rounded-lg text-sm font-bold transition-colors ${activeUserAudio === `${i}` ? 'bg-red-100 text-red-600' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'}`}
                                          >
                                            {activeUserAudio === `${i}` ? <Pause size={14} className="mr-2" /> : <Play size={14} className="mr-2" />}
                                            My Audio
                                          </button>
                                      )}
                                      <button 
                                        onClick={() => playWordAudio(attempt.word)}
                                        className="flex-1 flex items-center justify-center py-2 rounded-lg text-sm font-bold bg-white border border-gray-200 text-blue-600 hover:bg-blue-50 transition-colors"
                                      >
                                        <Volume2 size={14} className="mr-2" />
                                        Reference
                                      </button>
                                  </div>

                                  <div className="text-sm text-gray-600 border-t border-gray-50 pt-2 prose prose-sm max-w-none">
                                      <ReactMarkdown>{attempt.feedback}</ReactMarkdown>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
                  
                  <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
                      <button 
                        onClick={() => { setHistoryWord(null); handleWordRecord(historyWord); }}
                        className="bg-red-600 text-white font-bold px-6 py-2 rounded-xl hover:bg-red-700 transition-colors shadow-md flex items-center justify-center mx-auto"
                      >
                          <Mic size={18} className="mr-2" />
                          Practice Again
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
    </TutorContext.Provider>
  );
};

export default TextTutor;