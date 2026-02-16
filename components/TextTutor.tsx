
import React, { useState, useRef, useEffect, useContext, createContext, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Image as ImageIcon, Volume2, Search, BrainCircuit, Mic, RefreshCw, AlertCircle, Trash2, StopCircle, X, History, Calendar } from 'lucide-react';
import { generateTutorResponse, playTextToSpeech, evaluatePronunciation, getFriendlyErrorMessage, stopTtsAudio } from '../services/gemini';
import { saveChatMessage, getChatHistory, clearChatHistory, savePronunciationAttempt, getPronunciationHistory } from '../services/db';
import { ChatMessage, AppLanguage, HSKLevel, PronunciationAttempt } from '../types';
import { translations } from '../utils/translations';
import { pinyin } from 'pinyin-pro';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

// --- Context for Deep Components ---

interface TutorContextType {
  activeWordRecording: string | null;
  handleWordRecord: (text: string) => void;
  playAudio: (text: string) => Promise<void>;
  evaluationResult: { text: string; feedback: string } | null;
  setEvaluationResult: (res: { text: string; feedback: string } | null) => void;
  showWordHistory: (text: string) => void;
  activeWordId: string | null;
  setActiveWordId: (id: string | null) => void;
}

const TutorContext = createContext<TutorContextType>({
  activeWordRecording: null,
  handleWordRecord: () => {},
  playAudio: async () => {},
  evaluationResult: null,
  setEvaluationResult: () => {},
  showWordHistory: () => {},
  activeWordId: null,
  setActiveWordId: () => {}
});

// Helper component for individual Chinese words (inline in markdown)
const ChineseWord: React.FC<{ text: string }> = ({ text }) => {
  const { activeWordRecording, handleWordRecord, playAudio, evaluationResult, setEvaluationResult, showWordHistory, activeWordId, setActiveWordId } = useContext(TutorContext);
  const [loadingAudio, setLoadingAudio] = useState(false);
  
  // Create a stable unique ID for this instance
  const id = useMemo(() => Math.random().toString(36).substr(2, 9), []);
  
  const isActive = activeWordId === id;
  const isRecording = activeWordRecording === text;
  const hasFeedback = evaluationResult?.text === text;
  
  const py = useMemo(() => {
      try {
          return pinyin(text);
      } catch (e) {
          return '';
      }
  }, [text]);

  const score = useMemo(() => {
    if (hasFeedback && evaluationResult?.feedback) {
        const match = evaluationResult.feedback.match(/\*\*Score\*\*:\s*(\d+)/i);
        return match ? parseInt(match[1]) : null;
    }
    return null;
  }, [hasFeedback, evaluationResult]);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActive) {
        setActiveWordId(null);
    } else {
        setActiveWordId(id);
    }
  };

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
    <span className="relative inline-block mx-1 align-middle">
      <span 
        onClick={toggleMenu}
        className={`cursor-pointer rounded px-1.5 py-0.5 transition-all flex flex-col items-center leading-none group border ${isActive ? 'bg-red-50 border-red-200 shadow-sm' : 'border-transparent hover:bg-gray-100'}`}
        title="Click for actions"
      >
        <span className="text-lg text-gray-800 font-medium">{text}</span>
        <span className="text-[10px] text-gray-500 font-light mt-0.5">{py}</span>
      </span>
      
      {/* Floating Action Menu */}
      {isActive && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 flex items-center space-x-1 bg-white shadow-xl border border-gray-100 rounded-full p-1 animate-fade-in whitespace-nowrap">
              <button 
                onClick={play}
                className={`p-2 rounded-full hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors ${loadingAudio ? 'opacity-50' : ''}`}
                title="Listen"
              >
                {loadingAudio ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Volume2 size={14} />
                )}
              </button>
              <div className="w-px h-4 bg-gray-200"></div>
              <button 
                onClick={toggleRecord}
                className={`p-2 rounded-full transition-colors ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-red-50 text-gray-600 hover:text-red-600'}`}
                title="Practice"
              >
                {isRecording ? (
                   <StopCircle size={14} fill="currentColor" />
                ) : (
                   <Mic size={14} />
                )}
              </button>
              <div className="w-px h-4 bg-gray-200"></div>
              <button 
                onClick={openHistory}
                className="p-2 rounded-full hover:bg-blue-50 text-gray-600 hover:text-blue-600 transition-colors"
                title="History"
              >
                 <History size={14} />
              </button>
              
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-b border-r border-gray-100 rotate-45 -mt-1"></div>
          </div>
      )}

      {/* Evaluation Feedback Popover */}
      {hasFeedback && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-72 z-[60] animate-fade-in">
            <div className={`bg-white rounded-xl shadow-2xl border p-4 relative text-left ${
                score !== null && score >= 8 ? 'border-green-200' :
                score !== null && score >= 5 ? 'border-yellow-200' :
                'border-red-200'
            }`}>
                <button 
                    onClick={(e) => { e.stopPropagation(); setEvaluationResult(null); }}
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-1"
                >
                    <X size={14} />
                </button>

                {score !== null && (
                    <div className="flex justify-center mb-3">
                         <div className={`px-4 py-1.5 rounded-full text-sm font-bold shadow-sm flex items-center ${
                            score >= 8 ? 'bg-green-100 text-green-700' :
                            score >= 5 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                        }`}>
                            Score: {score}/10
                        </div>
                    </div>
                )}

                <div className="prose prose-sm text-gray-800 text-xs max-h-60 overflow-y-auto custom-scrollbar">
                    <ReactMarkdown>{evaluationResult.feedback}</ReactMarkdown>
                </div>
                
                <div className={`absolute bottom-full left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-t border-l rotate-45 -mb-1.5 ${
                     score !== null && score >= 8 ? 'border-green-200' :
                     score !== null && score >= 5 ? 'border-yellow-200' :
                     'border-red-200'
                }`}></div>
            </div>
        </div>
      )}
    </span>
  );
};

const processChildren = (children: React.ReactNode): React.ReactNode => {
  return React.Children.map(children, child => {
      if (typeof child === 'string') {
          // Improved regex to capture continuous Chinese segments better
          const parts = child.split(/([\u4e00-\u9fa5]+)/g);
          return parts.map((part, i) => {
              if (/([\u4e00-\u9fa5]+)/.test(part)) {
                  return <ChineseWord key={`${i}-${part}`} text={part} />;
              }
              return part;
          });
      }
      if (React.isValidElement(child)) {
           // Explicitly cast to access props
           const element = child as React.ReactElement<{ children?: React.ReactNode }>;
           if (element.props && element.props.children) {
               return React.cloneElement(element, { ...element.props, children: processChildren(element.props.children) });
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
  
  const [recordingMode, setRecordingMode] = useState<'none' | 'transcribe' | 'evaluate'>('none');
  const [activeWordRecording, setActiveWordRecording] = useState<string | null>(null);
  const recordingTargetRef = useRef<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<{text: string, feedback: string} | null>(null);
  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  
  const [historyWord, setHistoryWord] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<PronunciationAttempt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  const [generalError, setGeneralError] = useState<string | null>(null);
  
  // Persistent Session-based Text Cache
  const [textCache, setTextCache] = useState<Record<string, { text: string; groundingChunks: any[] }>>(() => {
    try {
      const saved = sessionStorage.getItem('hsk_tutor_text_cache');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    sessionStorage.setItem('hsk_tutor_text_cache', JSON.stringify(textCache));
  }, [textCache]);

  const t = translations[language].tutor;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Close active word menu when clicking anywhere else
  useEffect(() => {
    const handleClickOutside = () => setActiveWordId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const markdownComponents = useMemo(() => ({
      p: ({ children }: any) => <p className="mb-6 last:mb-0 leading-[2.5]">{processChildren(children)}</p>, // Increased leading for pinyin space
      li: ({ children }: any) => <li className="mb-3 leading-[2.5]">{processChildren(children)}</li>,
      strong: ({ children }: any) => <strong className="font-bold text-gray-900">{processChildren(children)}</strong>,
      em: ({ children }: any) => <em className="italic">{processChildren(children)}</em>,
      h1: ({ children }: any) => <h1 className="text-xl font-bold mb-4 mt-2">{processChildren(children)}</h1>,
      h2: ({ children }: any) => <h2 className="text-lg font-bold mb-3 mt-2">{processChildren(children)}</h2>,
      h3: ({ children }: any) => <h3 className="text-md font-bold mb-2">{processChildren(children)}</h3>,
      blockquote: ({ children }: any) => <blockquote className="border-l-4 border-red-200 pl-4 italic my-4 bg-gray-50 p-2 rounded-r">{processChildren(children)}</blockquote>,
  }), []);

  useEffect(() => {
    const loadHistory = async () => {
      const history = await getChatHistory();
      if (history.length > 0) setMessages(history);
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

  const handleClearHistory = async () => {
    if (window.confirm("Are you sure you want to clear your chat history?")) {
      try {
        await clearChatHistory();
        setMessages([]);
        setTextCache({});
      } catch (e) {
        showGeneralError(e);
      }
    }
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if ((!trimmedInput && !selectedImage) || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: trimmedInput,
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, userMsg]);
    saveChatMessage(userMsg); 

    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    const lastModelMsg = messages.filter(m => m.role === 'model').pop();
    const normalizedInput = trimmedInput.toLowerCase();
    const cacheKey = `${lastModelMsg?.id || 'root'}:${normalizedInput}:${language}:${level}:${useSearch}:${useThinking}`;

    try {
      let responseText = "";
      let groundingChunks = undefined;

      // 1. Check Text Cache for similar questions in the same session context
      if (!userMsg.image && textCache[cacheKey]) {
          const cached = textCache[cacheKey];
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

          // 2. Update Text Cache
          if (!userMsg.image) {
              setTextCache(prev => ({
                ...prev,
                [cacheKey]: { text: responseText, groundingChunks }
              }));
          }
      }

      const modelMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'model',
        text: responseText,
        groundingUrls: groundingChunks?.map((c: any) => ({
          title: c.web?.title || 'Source',
          uri: c.web?.uri || ''
        }))
      };

      setMessages(prev => [...prev, modelMsg]);
      saveChatMessage(modelMsg);

    } catch (e) {
      console.error(e);
      showGeneralError(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Implement Word Recording Logic
  const handleWordRecord = async (text: string) => {
    if (activeWordRecording === text) {
        // Stop recording
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setRecordingMode('none');
        setActiveWordRecording(null);
    } else {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = (reader.result as string).split(',')[1];
                    setRecordingMode('evaluate');
                    try {
                        const feedback = await evaluatePronunciation(base64Audio, 'audio/wav', text, language);
                        setEvaluationResult({ text, feedback });
                        // Save attempt
                        const scoreMatch = feedback.match(/\*\*Score\*\*:\s*(\d+)/i);
                        const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
                        await savePronunciationAttempt({
                            word: text,
                            heard: '...',
                            pinyin: '',
                            score: score,
                            feedback: feedback,
                            timestamp: Date.now()
                        });
                    } catch (e) {
                        showGeneralError(e);
                    }
                };
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setActiveWordRecording(text);
            recordingTargetRef.current = text;
        } catch (e) {
            showGeneralError("Microphone access denied");
        }
    }
  };

  const playAudio = async (text: string) => {
    try {
        // Use the centralized helper that handles fallback and caching
        await playTextToSpeech(text);
    } catch(e) {
        // If even the browser fallback fails
        showGeneralError(e);
    }
  };

  const showWordHistory = async (word: string) => {
      setHistoryWord(word);
      setHistoryLoading(true);
      const data = await getPronunciationHistory(word);
      setHistoryData(data);
      setHistoryLoading(false);
  };

  return (
    <TutorContext.Provider value={{
        activeWordRecording,
        handleWordRecord,
        playAudio,
        evaluationResult,
        setEvaluationResult,
        showWordHistory,
        activeWordId,
        setActiveWordId
    }}>
      <div className="flex flex-col h-full relative bg-gray-50">
        
        {/* Error Banner */}
        {generalError && (
            <div className="absolute top-4 left-4 right-4 z-50 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between animate-fade-in">
                <span className="flex items-center"><AlertCircle className="mr-2" size={18} /> {generalError}</span>
                <button onClick={() => setGeneralError(null)}><X size={18} /></button>
            </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm">
                        <BrainCircuit size={32} className="text-gray-300" />
                    </div>
                    <p className="text-center max-w-xs">{t.start}</p>
                </div>
            )}

            {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] md:max-w-[80%] rounded-2xl p-5 shadow-sm relative ${
                        msg.role === 'user' 
                        ? 'bg-gray-900 text-white rounded-tr-none' 
                        : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                    }`}>
                        {msg.image && (
                            <img src={msg.image} alt="User upload" className="max-w-full h-auto rounded-lg mb-3" />
                        )}
                        
                        {msg.role === 'user' ? (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                        ) : (
                            <div className="prose prose-red max-w-none">
                                <ReactMarkdown components={markdownComponents}>
                                    {msg.text}
                                </ReactMarkdown>
                                {msg.groundingUrls && msg.groundingUrls.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-gray-100 text-xs">
                                        <p className="font-bold text-gray-500 mb-2">{t.sources}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {msg.groundingUrls.map((url, i) => (
                                                <a 
                                                    key={i} 
                                                    href={url.uri} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="bg-gray-50 text-blue-600 px-2 py-1 rounded border border-gray-200 hover:bg-blue-50 truncate max-w-[200px]"
                                                >
                                                    {url.title}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            ))}
            
            {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-white rounded-2xl p-4 border border-gray-100 rounded-tl-none flex items-center space-x-2">
                        <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-200 shrink-0">
            <div className="max-w-4xl mx-auto">
                {selectedImage && (
                    <div className="mb-3 relative inline-block">
                        <img src={selectedImage} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-gray-200" />
                        <button 
                           onClick={() => setSelectedImage(null)}
                           className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                        >
                            <X size={12} />
                        </button>
                    </div>
                )}
                
                <div className="flex items-center space-x-2 mb-3 overflow-x-auto pb-1">
                     <button
                        onClick={() => setUseSearch(!useSearch)}
                        className={`flex items-center px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${useSearch ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                     >
                        <Search size={12} className="mr-1.5" />
                        {t.search}
                     </button>
                     <button
                        onClick={() => setUseThinking(!useThinking)}
                        className={`flex items-center px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${useThinking ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                     >
                        <BrainCircuit size={12} className="mr-1.5" />
                        {t.thinking}
                     </button>
                     <div className="w-px h-4 bg-gray-300 mx-2"></div>
                     <button 
                        onClick={handleClearHistory}
                        className="text-gray-400 hover:text-red-500 text-xs font-bold flex items-center"
                     >
                        <Trash2 size={12} className="mr-1" />
                        {t.clearChat}
                     </button>
                </div>

                <div className="flex items-end space-x-2">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        <ImageIcon size={20} />
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleImageSelect}
                    />
                    
                    <div className="flex-1 relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder={t.placeholder}
                            rows={1}
                            className="w-full bg-gray-100 text-gray-900 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all resize-none max-h-32"
                            style={{ minHeight: '48px' }}
                        />
                    </div>

                    <button 
                        onClick={handleSend}
                        disabled={(!input.trim() && !selectedImage) || isLoading}
                        className={`p-3 rounded-xl font-bold transition-all shadow-md ${
                            (!input.trim() && !selectedImage) || isLoading 
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                            : 'bg-red-600 text-white hover:bg-red-700 active:scale-95'
                        }`}
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>

        {/* History Modal */}
        {historyWord && (
            <div className="fixed inset-0 z-[70] bg-black bg-opacity-50 flex items-center justify-center p-4" onClick={() => setHistoryWord(null)}>
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-bold text-lg">History: {historyWord}</h3>
                        <button onClick={() => setHistoryWord(null)} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                    </div>
                    <div className="p-4 overflow-y-auto flex-1">
                        {historyLoading ? (
                            <div className="flex justify-center p-4"><RefreshCw className="animate-spin text-gray-400" /></div>
                        ) : historyData.length === 0 ? (
                            <p className="text-center text-gray-500 py-4">No practice history yet.</p>
                        ) : (
                            <div className="space-y-3">
                                {historyData.map((attempt, i) => (
                                    <div key={i} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className={`font-bold ${attempt.score >= 8 ? 'text-green-600' : attempt.score >= 5 ? 'text-orange-500' : 'text-red-500'}`}>
                                                Score: {attempt.score}/10
                                            </span>
                                            <span className="text-xs text-gray-400 flex items-center">
                                                <Calendar size={10} className="mr-1" />
                                                {new Date(attempt.timestamp).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-600 mt-2 line-clamp-3">
                                            {attempt.feedback}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </TutorContext.Provider>
  );
};

export default TextTutor;
