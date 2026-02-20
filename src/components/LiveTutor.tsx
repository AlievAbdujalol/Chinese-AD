
import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Activity, AlertCircle, AlertTriangle, WifiOff } from 'lucide-react';
import { connectLiveSession, base64ToUint8Array, uint8ArrayToBase64, getFriendlyErrorMessage } from '../services/gemini';
import { updateSpeakingTime, updateStudyTime } from '../services/db';
import { AppLanguage, HSKLevel } from '../types';
import { translations } from '../utils/translations';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

const LiveTutor: React.FC<Props> = ({ language, level }) => {
  const [isConnected, setIsConnected] = useState(false);
  
  const t = translations[language].live;
  const [status, setStatus] = useState(t.ready);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [playbackWarning, setPlaybackWarning] = useState<string | null>(null);
  
  // Update status when language changes if not connected
  useEffect(() => {
    if (!isConnected) {
      setStatus(t.ready);
      setErrorDetails(null);
    }
  }, [language, isConnected]);

  // Speaking Time Tracker
  useEffect(() => {
    let interval: any;
    if (isConnected) {
      interval = setInterval(() => {
        // Increment speaking minutes and general study minutes
        updateSpeakingTime(1);
        updateStudyTime(1); 
      }, 60000); // Every minute
    }
    return () => clearInterval(interval);
  }, [isConnected]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Audio Contexts
  const inputAudioContext = useRef<AudioContext | null>(null);
  const outputAudioContext = useRef<AudioContext | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Session handling
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  const startSession = async () => {
    try {
      setStatus(t.init);
      setErrorDetails(null);
      setPlaybackWarning(null);
      
      // Setup Audio Contexts
      try {
        inputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      } catch (audioCtxErr) {
        console.error("AudioContext creation failed", audioCtxErr);
        setStatus(t.error);
        setErrorDetails(getFriendlyErrorMessage(audioCtxErr));
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Connect to Gemini
      const sessionPromise = connectLiveSession(language, level, {
        onOpen: () => {
          setStatus(t.connected);
          setIsConnected(true);
          setErrorDetails(null);
          
          if (!inputAudioContext.current) return;

          // Streaming Logic
          try {
            const source = inputAudioContext.current.createMediaStreamSource(stream);
            const processor = inputAudioContext.current.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // PCM 16 LE Encoding
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmData = new Uint8Array(int16.buffer);
              const base64Data = uint8ArrayToBase64(pcmData);

              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  media: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64Data
                  }
                });
              });
            };

            source.connect(processor);
            processor.connect(inputAudioContext.current.destination);
          } catch (streamErr) {
             console.error("Audio streaming setup failed", streamErr);
             setErrorDetails(getFriendlyErrorMessage(streamErr));
          }
        },
        onMessage: async (message) => {
          // Handle incoming audio
          try {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (base64Audio && outputAudioContext.current) {
               const ctx = outputAudioContext.current;
               const audioBytes = base64ToUint8Array(base64Audio);
               
               // Decode PCM 24kHz (Model output)
               // Simple raw PCM decoding
               const dataInt16 = new Int16Array(audioBytes.buffer);
               const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
               const channelData = buffer.getChannelData(0);
               for(let i=0; i<dataInt16.length; i++) {
                 channelData[i] = dataInt16[i] / 32768.0;
               }

               // Schedule playback
               const source = ctx.createBufferSource();
               source.buffer = buffer;
               source.connect(ctx.destination);
               
               const currentTime = ctx.currentTime;
               if (nextStartTimeRef.current < currentTime) {
                  nextStartTimeRef.current = currentTime;
               }
               
               source.start(nextStartTimeRef.current);
               nextStartTimeRef.current += buffer.duration;
               
               sourcesRef.current.add(source);
               source.onended = () => sourcesRef.current.delete(source);
            }
          } catch (msgErr) {
            console.error("Error processing live message", msgErr);
            setPlaybackWarning(getFriendlyErrorMessage(msgErr));
            setTimeout(() => setPlaybackWarning(null), 2000);
          }
        },
        onClose: () => {
          setStatus(t.ready);
          setIsConnected(false);
        },
        onError: (err: any) => {
          console.error("Live API Error", err);
          setStatus(t.error);
          setIsConnected(false);
          setErrorDetails(getFriendlyErrorMessage(err));
        }
      });
      
      // Catch connection errors that might occur before the session is fully established
      sessionPromise.catch((err) => {
          console.error("Connection failed", err);
          setStatus(t.error);
          setIsConnected(false);
          setErrorDetails(getFriendlyErrorMessage(err));
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (e: any) {
      console.error(e);
      // Determine if it's a microphone error or something else
      if (e.name === 'NotAllowedError' || e.name === 'NotFoundError' || e.name === 'PermissionDeniedError') {
          setStatus(t.micError);
      } else {
          setStatus(t.error);
      }
      setErrorDetails(getFriendlyErrorMessage(e));
    }
  };

  const stopSession = () => {
    // Close Audio Contexts
    try {
      inputAudioContext.current?.close();
      outputAudioContext.current?.close();
    } catch (e) { /* ignore */ }
    
    // Stop all playing sources
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    
    setIsConnected(false);
    setStatus(t.ready);
    setErrorDetails(null);
    setPlaybackWarning(null);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-red-50 to-white p-6">
      <div className="bg-white p-8 rounded-3xl shadow-xl flex flex-col items-center max-w-md w-full text-center border border-red-100">
        <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 transition-all duration-500 ${isConnected ? 'bg-red-100 ring-4 ring-red-200' : 'bg-gray-100'}`}>
          {isConnected ? (
             <Activity className="text-red-600 animate-pulse" size={64} />
          ) : (
             <Mic className="text-gray-400" size={64} />
          )}
        </div>

        <h2 className="text-2xl font-bold text-gray-800 mb-2">{t.title}</h2>
        <p className="text-gray-500 mb-4">{status}</p>
        
        {errorDetails && (
          <div className="mb-6 bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm flex items-center animate-fade-in">
            {errorDetails.includes('Network') ? <WifiOff size={16} className="mr-2 flex-shrink-0" /> : <AlertCircle size={16} className="mr-2 flex-shrink-0" />}
            {errorDetails}
          </div>
        )}

        {playbackWarning && isConnected && (
          <div className="mb-6 bg-orange-50 text-orange-600 px-4 py-2 rounded-lg text-sm flex items-center animate-fade-in">
            <AlertTriangle size={16} className="mr-2 flex-shrink-0" />
            {playbackWarning}
          </div>
        )}

        <div className="space-y-4 w-full">
           {!isConnected ? (
             <button 
               onClick={startSession}
               className="w-full bg-red-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
             >
               <Mic size={24} />
               {t.start}
             </button>
           ) : (
             <button 
               onClick={stopSession}
               className="w-full bg-white border-2 border-red-600 text-red-600 font-bold py-4 px-6 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
             >
               <MicOff size={24} />
               {t.end}
             </button>
           )}
        </div>
        
        <div className="mt-6 text-xs text-gray-400">
          Powered by Gemini Live API (Native Audio)
        </div>
      </div>
    </div>
  );
};

export default LiveTutor;
