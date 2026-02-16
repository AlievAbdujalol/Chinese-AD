import React, { useState, useRef, useEffect, useContext, createContext, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Image as ImageIcon, Volume2, Search, BrainCircuit, Mic, Ear, RefreshCw, AlertCircle, Trash2, StopCircle, X, History, TrendingUp, Calendar } from 'lucide-react';
import { generateTutorResponse, playRawAudio, generateSpeech, transcribeAudio, evaluatePronunciation, getFriendlyErrorMessage, arrayBufferToBase64, base64ToUint8Array, stopTtsAudio, speakBrowser } from '../services/gemini';
import { saveChatMessage, getChatHistory, clearChatHistory, updateMessageAudio, savePronunciationAttempt, getPronunciationHistory } from '../services/db';
import { ChatMessage, AppLanguage, HSKLevel, PronunciationAttempt } from '../types';
import { translations } from '../utils/translations';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
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

const TextTutor: React.FC<Props> = ({ language, level }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [useSearch, setUseSearch] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  
  // Recording State
  const [recordingMode, setRecordingMode] = useState<'none' | 'transcribe' | 'evaluate'>('none');
  const [activeWordRecording, setActiveWordRecording] = useState<string | null>(null);
  const recordingTargetRef = useRef<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<{text: string, feedback: string} | null>(null);
  
  // History Modal State
  const [historyWord, setHistoryWord] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<PronunciationAttempt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const showGeneralError = (error: any) => {
    const msg = typeof error === 'string' ? error : getFriendlyErrorMessage(error);
    setGeneralError(msg);
    setTimeout(() => setGeneralError(null), 4000);
  };

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

          responseText = response.text || "No response generated.";
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
    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: getFriendlyErrorMessage(error)
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
                  
                  // Save attempt history
                  await savePronunciationAttempt({
                     word: recordingTargetRef.current,
                     heard: heardMatch ? heardMatch[1].trim() : "",
                     pinyin: pinyinMatch ? pinyinMatch[1].trim() : "",
                     score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
                     feedback: feedback,
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

  const playWordAudio = async (text: string) => {
    try {
      if (audioCache.current[text]) {
        try {
            await playRawAudio(audioCache.current[text]);
            return;
        } catch (e) {
            console.warn("Cached word audio corrupted, regenerating...");
            delete audioCache.current[text];
        }
      }
      try {
        const buffer = await generateSpeech(text);
        audioCache.current[text] = buffer;
        await playRawAudio(buffer);
      } catch (geminiError) {
        console.warn("Gemini TTS failed, using browser fallback", geminiError);
        speakBrowser(text);
      }
    } catch (err) {
      console.error("Word TTS Error:", err);
      speakBrowser(text);
    }
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
             
             // Backfill DB if needed
             if (!currentMsg?.audio) {
                 const base64 = arrayBufferToBase64(audioCache.current[text]);
                 setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audio: base64 } : m));
                 updateMessageAudio(msgId, base64).catch(e => {});
             }
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

      // 3. Generate New Audio
      try {
         const buffer = await generateSpeech(text);
         audioCache.current[text] = buffer;
         await playRawAudio(buffer);
         
         // Persist
         const base64 = arrayBufferToBase64(buffer);
         setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audio: base64 } : m));
         updateMessageAudio(msgId, base64).catch(e => console.error("Audio save failed", e));
      } catch (geminiError) {
         console.warn("Gemini TTS failed, using browser fallback", geminiError);
         speakBrowser(text);
      }
    } catch (e: any) {
      console.error("Playback failed completely", e);
      speakBrowser(text);
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
                      <button onClick={() => setHistoryWord(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
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

      <div className="bg-white p-4 border-t border-gray-200 relative">
        {generalError && (
           <div className="absolute bottom-full left-0 w-full p-2 bg-transparent pointer-events-none flex justify-center">
              <div className="bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg flex items-center animate-fade-in text-sm pointer-events-auto">
                 <AlertCircle size={16} className="mr-2 text-red-400" />
                 {generalError}
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
    </TutorContext.Provider>
  );
};

export default TextTutor;