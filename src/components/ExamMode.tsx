
import React, { useState, useEffect } from 'react';
import { generateMockExam, playTextToSpeech, getFriendlyErrorMessage } from '../services/gemini';
import { saveResult } from '../services/db';
import { AppLanguage, HSKLevel, ExamData } from '../types';
import { Clock, CheckCircle, AlertCircle, RefreshCw, Volume2, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { translations } from '../utils/translations';
import { getLevelTheme } from '../utils/theme';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

type Section = 'listening' | 'reading' | 'grammar';

const ExamMode: React.FC<Props> = ({ language, level }) => {
  const t = translations[language].exam;
  const theme = getLevelTheme(level);

  const [status, setStatus] = useState<'idle' | 'loading' | 'active' | 'review'>('idle');
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [currentSection, setCurrentSection] = useState<Section>('listening');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(20 * 60); // 20 minutes default
  const [audioLoading, setAudioLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Timer
  useEffect(() => {
    let interval: any;
    if (status === 'active' && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && status === 'active') {
      handleSubmit();
    }
    return () => clearInterval(interval);
  }, [status, timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const startExam = async () => {
    setStatus('loading');
    setAnswers({});
    setTimeLeft(20 * 60);
    setCurrentSection('listening');
    setSaved(false);
    setError(null);
    try {
      const data = await generateMockExam(level, language);
      setExamData(data);
      setStatus('active');
    } catch (e) {
      console.error(e);
      setError(getFriendlyErrorMessage(e));
      setStatus('idle');
    }
  };

  const handleSubmit = async () => {
      // Move status change first to ensure UI feedback immediately
      setStatus('review');
      
      if (!examData || saved) return;
      
      let correct = 0;
      let total = 0;
      const allQuestions = [...examData.listening, ...examData.reading, ...examData.grammar];
      allQuestions.forEach(q => {
        if (answers[q.id] === q.correctIndex) correct++;
        total++;
      });
      
      try {
        await saveResult('exam', correct, total, level);
        setSaved(true);
      } catch (e) {
        console.error("Failed to save exam result:", e);
        // We still keep the user in review mode
      }
  };

  const playAudio = async (text: string) => {
    if (audioLoading) return;
    setAudioLoading(true);
    setAudioError(null);
    try {
      await playTextToSpeech(text);
    } catch (e) {
      console.error(e);
      setAudioError(getFriendlyErrorMessage(e));
      // Auto clear after 4s
      setTimeout(() => setAudioError(null), 4000);
    } finally {
      setAudioLoading(false);
    }
  };

  const handleAnswer = (questionId: string, optionIndex: number) => {
    if (status !== 'active') return;
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  };

  const getQuestions = () => {
    if (!examData) return [];
    return examData[currentSection];
  };

  const calculateScore = () => {
    if (!examData) return 0;
    let correct = 0;
    let total = 0;
    const allQuestions = [...examData.listening, ...examData.reading, ...examData.grammar];
    allQuestions.forEach(q => {
      if (answers[q.id] === q.correctIndex) correct++;
      total++;
    });
    return Math.round((correct / total) * 100);
  };

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <RefreshCw className="animate-spin text-red-600 mb-4" size={40} />
        <p className="text-gray-600">{t.generating}</p>
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
         <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100 text-center">
            <div className="mb-6 flex justify-center">
               <FileText size={64} className="text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{t.title}</h2>
            <p className="text-gray-600 mb-6">{t.desc}</p>
            
            {error && (
             <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start text-left text-sm">
                <AlertCircle className="mr-2 flex-shrink-0 mt-0.5" size={16} />
                <span>{error}</span>
             </div>
            )}
            
            <div className={`${theme.badge} rounded-lg p-4 mb-6 text-sm font-medium`}>
               <p className="font-bold mb-1 text-lg">{level}</p>
               <p>20 Minutes • Listening, Reading, Grammar</p>
            </div>
            <button 
              onClick={startExam}
              className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors"
            >
              {t.start}
            </button>
         </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center shrink-0">
         <div className="flex items-center space-x-2 md:space-x-4 overflow-x-auto">
            <button 
              onClick={() => setCurrentSection('listening')} 
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${currentSection === 'listening' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.listening}
            </button>
            <button 
              onClick={() => setCurrentSection('reading')} 
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${currentSection === 'reading' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.reading}
            </button>
            <button 
              onClick={() => setCurrentSection('grammar')} 
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${currentSection === 'grammar' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t.grammar}
            </button>
         </div>
         <div className="flex items-center text-red-600 font-mono font-bold text-lg whitespace-nowrap ml-2">
            <Clock size={20} className="mr-2" />
            {formatTime(timeLeft)}
         </div>
      </div>
      
      {/* Audio Error Banner */}
      {audioError && (
          <div className="bg-red-50 border-b border-red-100 text-red-700 px-6 py-2 text-sm flex items-center justify-center animate-fade-in">
             <AlertCircle size={16} className="mr-2" />
             {audioError}
          </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
           {status === 'review' && (
             <div className="mb-8 animate-fade-in">
                <p className="text-blue-500 text-center mb-4 font-medium">{t.reviewTip}</p>
                <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 text-center max-w-md mx-auto">
                  <h3 className="text-2xl font-bold text-gray-800 mb-2">{t.results}</h3>
                  <div className="text-5xl font-extrabold text-red-600 mb-4">{calculateScore()}%</div>
                  <button onClick={() => setStatus('idle')} className="text-gray-500 underline hover:text-red-600 transition-colors font-medium">
                    {t.retake}
                  </button>
                </div>
             </div>
           )}

           {getQuestions().map((q, idx) => (
             <div key={q.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
               <div className="flex justify-between mb-4">
                  <span className="font-bold text-gray-500">Q{idx + 1}</span>
                  {status === 'review' && (
                     answers[q.id] === q.correctIndex 
                       ? <span className="text-green-600 flex items-center"><CheckCircle size={16} className="mr-1"/> Correct</span> 
                       : <span className="text-red-600 flex items-center"><AlertCircle size={16} className="mr-1"/> Incorrect</span>
                  )}
               </div>

               {currentSection === 'listening' && q.script && (
                 <div className="mb-4">
                    <button 
                      onClick={() => playAudio(q.script!)}
                      className="flex items-center bg-blue-50 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors focus:ring-2 focus:ring-blue-300 outline-none"
                    >
                       {audioLoading ? <RefreshCw className="animate-spin mr-2" size={18} /> : <Volume2 className="mr-2" size={18} />}
                       {t.playAudio}
                    </button>
                    {status === 'review' && <p className="mt-2 text-sm text-gray-500 italic border-l-2 border-gray-300 pl-2">{q.script}</p>}
                 </div>
               )}

               <p className="text-lg font-medium text-gray-800 mb-4 whitespace-pre-line">{q.content}</p>

               <div className="space-y-2">
                 {q.options.map((opt, oIdx) => {
                   let style = "w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors";
                   if (answers[q.id] === oIdx) style = "w-full text-left p-3 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-800 font-medium";
                   
                   if (status === 'review') {
                      if (oIdx === q.correctIndex) style = "w-full text-left p-3 rounded-lg border-2 border-green-500 bg-green-50 text-green-800";
                      else if (answers[q.id] === oIdx) style = "w-full text-left p-3 rounded-lg border-2 border-red-500 bg-red-50 text-red-800 opacity-60";
                      else style = "w-full text-left p-3 rounded-lg border border-gray-200 opacity-50";
                   }

                   return (
                     <button 
                       key={oIdx} 
                       onClick={() => handleAnswer(q.id, oIdx)}
                       disabled={status === 'review'}
                       className={style}
                     >
                       {opt}
                     </button>
                   );
                 })}
               </div>

               {status === 'review' && (
                 <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="font-bold text-gray-700 text-sm mb-1">{t.analysis}:</p>
                    <div className="text-sm text-gray-600">
                        <ReactMarkdown children={q.explanation} />
                    </div>
                 </div>
               )}
             </div>
           ))}
        </div>
      </div>

      {/* Footer Navigation */}
      {status === 'active' && (
         <div className="bg-white border-t border-gray-200 p-4 shrink-0">
           <div className="max-w-3xl mx-auto flex justify-end">
              {currentSection === 'listening' && (
                <button onClick={() => setCurrentSection('reading')} className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800">
                  {t.nextSection}
                </button>
              )}
              {currentSection === 'reading' && (
                <button onClick={() => setCurrentSection('grammar')} className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800">
                  {t.nextSection}
                </button>
              )}
              {currentSection === 'grammar' && (
                <button 
                  type="button"
                  onClick={handleSubmit} 
                  className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-red-700"
                >
                  {t.submit}
                </button>
              )}
           </div>
         </div>
      )}
    </div>
  );
};

export default ExamMode;
    