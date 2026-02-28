import React, { useState, useRef, useEffect } from 'react';
import { AppLanguage, HSKLevel } from '../types';
import { Mic, Volume2, RefreshCw, Play, Square, AlertCircle, CheckCircle, XCircle, Award } from 'lucide-react';
import { generatePracticeSentence, evaluatePronunciation, playRawAudio, generateSpeech, stopTtsAudio } from '../services/gemini';
import { savePronunciationAttempt } from '../services/db';
import { translations } from '../utils/translations';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

const SpeakingPractice: React.FC<Props> = ({ language, level }) => {
  const [targetSentence, setTargetSentence] = useState<{character: string, pinyin: string, translation: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [feedback, setFeedback] = useState<{score: number, heard: string, pinyin: string, feedback: string} | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const t = translations[language].tutor; // Reuse tutor translations or add new ones

  const loadNewSentence = async () => {
    setLoading(true);
    setFeedback(null);
    setAudioBlob(null);
    setError(null);
    try {
      const sentence = await generatePracticeSentence(level, language);
      setTargetSentence(sentence);
    } catch (e) {
      console.error(e);
      setError("Failed to load sentence. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNewSentence();
  }, [level, language]);

  const playTargetAudio = async () => {
    if (!targetSentence) return;
    try {
      const buffer = await generateSpeech(targetSentence.character);
      await playRawAudio(buffer);
    } catch (e) {
      console.error(e);
      setError("Failed to play audio.");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setRecording(true);
      setFeedback(null);
      setError(null);
    } catch (e) {
      console.error(e);
      setError("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const submitRecording = async () => {
    if (!audioBlob || !targetSentence) return;
    
    setEvaluating(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const mimeType = audioBlob.type;
        
        const resultText = await evaluatePronunciation(base64, mimeType, targetSentence.character, language);
        
        // Parse the feedback
        const scoreMatch = resultText.match(/\*\*Score\*\*:\s*(\d+)/);
        const heardMatch = resultText.match(/\*\*Heard\*\*:\s*(.*)/);
        const pinyinMatch = resultText.match(/\*\*Pinyin\*\*:\s*(.*)/);
        const feedbackMatch = resultText.match(/\*\*Feedback\*\*:\s*(.*)/s); // s flag for multiline

        setFeedback({
            score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
            heard: heardMatch ? heardMatch[1].trim() : "Unknown",
            pinyin: pinyinMatch ? pinyinMatch[1].trim() : "",
            feedback: feedbackMatch ? feedbackMatch[1].trim() : resultText
        });

        // Save to Supabase
        await savePronunciationAttempt({
            word: targetSentence.character,
            heard: heardMatch ? heardMatch[1].trim() : "Unknown",
            pinyin: pinyinMatch ? pinyinMatch[1].trim() : "",
            score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
            feedback: feedbackMatch ? feedbackMatch[1].trim() : resultText,
            audio: `data:${mimeType};base64,${base64}`,
            timestamp: Date.now()
        });
      };
      reader.readAsDataURL(audioBlob);
    } catch (e) {
      console.error(e);
      setError("Evaluation failed.");
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 p-4 md:p-8 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Mic className="mr-2 text-red-600" />
            Speaking Practice
          </h2>
          <div className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full">
            {level}
          </div>
        </div>

        {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-start">
                <AlertCircle size={20} className="mr-2 mt-0.5 shrink-0" />
                <p>{error}</p>
            </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 text-center mb-6 relative overflow-hidden">
            {loading ? (
                <div className="py-12 flex flex-col items-center">
                    <RefreshCw className="animate-spin text-red-600 mb-4" size={32} />
                    <p className="text-gray-500">Generating sentence...</p>
                </div>
            ) : targetSentence ? (
                <>
                    <p className="text-sm text-gray-400 uppercase tracking-widest mb-4 font-bold">Read Aloud</p>
                    <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4 leading-tight">
                        {targetSentence.character}
                    </h1>
                    <p className="text-xl text-red-600 font-medium mb-2">{targetSentence.pinyin}</p>
                    <p className="text-gray-500 italic mb-8">{targetSentence.translation}</p>

                    <div className="flex justify-center space-x-4">
                        <button 
                            onClick={playTargetAudio}
                            className="p-4 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-red-600 transition-colors"
                            title="Listen to native pronunciation"
                        >
                            <Volume2 size={24} />
                        </button>
                        
                        {!recording ? (
                            <button 
                                onClick={startRecording}
                                className="p-6 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg hover:shadow-red-200 transition-all transform hover:scale-105"
                                title="Start Recording"
                            >
                                <Mic size={32} />
                            </button>
                        ) : (
                            <button 
                                onClick={stopRecording}
                                className="p-6 rounded-full bg-red-100 text-red-600 animate-pulse ring-4 ring-red-50"
                                title="Stop Recording"
                            >
                                <Square size={32} fill="currentColor" />
                            </button>
                        )}
                    </div>
                    
                    {recording && <p className="text-red-500 font-bold mt-4 animate-pulse">Recording...</p>}
                </>
            ) : (
                <div className="py-12">
                    <button onClick={loadNewSentence} className="text-red-600 font-bold hover:underline">
                        Load Sentence
                    </button>
                </div>
            )}
        </div>

        {audioBlob && !recording && !feedback && (
            <div className="flex justify-center mb-6 animate-fade-in">
                 <button 
                    onClick={submitRecording}
                    disabled={evaluating}
                    className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors flex items-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {evaluating ? (
                        <>
                            <RefreshCw size={18} className="mr-2 animate-spin" />
                            Analyzing...
                        </>
                    ) : (
                        <>
                            <Award size={18} className="mr-2" />
                            Check Pronunciation
                        </>
                    )}
                </button>
            </div>
        )}

        {feedback && (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 animate-fade-in">
                <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
                    <h3 className="text-lg font-bold text-gray-800">Feedback</h3>
                    <div className={`px-4 py-1 rounded-full text-sm font-bold flex items-center ${
                        feedback.score >= 8 ? 'bg-green-100 text-green-700' : 
                        feedback.score >= 5 ? 'bg-yellow-100 text-yellow-700' : 
                        'bg-red-100 text-red-700'
                    }`}>
                        {feedback.score >= 8 ? <CheckCircle size={16} className="mr-1" /> : <AlertCircle size={16} className="mr-1" />}
                        Score: {feedback.score}/10
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <p className="text-xs text-gray-400 uppercase font-bold mb-1">AI Heard</p>
                        <p className="text-xl font-bold text-gray-800">{feedback.heard}</p>
                        <p className="text-gray-500">{feedback.pinyin}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 uppercase font-bold mb-1">Analysis</p>
                        <p className="text-gray-700 leading-relaxed text-sm">{feedback.feedback}</p>
                    </div>
                </div>

                <button 
                    onClick={loadNewSentence}
                    className="w-full py-3 rounded-xl border-2 border-gray-100 text-gray-600 font-bold hover:border-red-100 hover:text-red-600 hover:bg-red-50 transition-all"
                >
                    Next Sentence
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default SpeakingPractice;
