import React, { useState } from 'react';
import { generateQuiz, getFriendlyErrorMessage } from '../services/gemini';
import { saveResult } from '../services/db';
import { AppLanguage, HSKLevel, QuizQuestion } from '../types';
import { CheckCircle, XCircle, RefreshCw, ChevronRight, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { translations } from '../utils/translations';
import { getLevelTheme } from '../utils/theme';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

const QuizMode: React.FC<Props> = ({ language, level }) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const t = translations[language].quiz;
  const theme = getLevelTheme(level);

  const startQuiz = async () => {
    setLoading(true);
    setQuestions([]);
    setScore(0);
    setCurrentIndex(0);
    setShowExplanation(false);
    setSelectedOption(null);
    setSaved(false);
    setError(null);

    try {
      const qs = await generateQuiz(topic, level, language);
      setQuestions(qs);
    } catch (e) {
      console.error(e);
      setError(getFriendlyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    setShowExplanation(true);
    if (idx === questions[currentIndex].correctAnswerIndex) {
      setScore(s => s + 1);
    }
  };

  const nextQuestion = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(c => c + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    } else {
      // End screen - Save result immediately
      if (!saved) {
        await saveResult('quiz', score + (selectedOption === questions[currentIndex].correctAnswerIndex ? 0 : 0), questions.length, level);
        setSaved(true);
      }
      setCurrentIndex(c => c + 1);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <RefreshCw className="animate-spin text-red-600 mb-4" size={40} />
        <p className="text-gray-600">{t.generating}</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100 text-center">
           <h2 className="text-2xl font-bold text-gray-800 mb-4">{t.genTitle}</h2>
           <p className="text-gray-600 mb-6">{t.genDesc}</p>
           
           {error && (
             <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start text-left text-sm">
                <AlertCircle className="mr-2 flex-shrink-0 mt-0.5" size={16} />
                <span>{error}</span>
             </div>
           )}
           
           <input
             type="text"
             value={topic}
             onChange={(e) => setTopic(e.target.value)}
             placeholder={t.topicPlace}
             className="w-full border border-gray-300 rounded-lg p-3 mb-6 focus:outline-none focus:ring-2 focus:ring-red-500"
           />

           <button 
             onClick={startQuiz}
             className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors"
           >
             {t.generate}
           </button>
        </div>
      </div>
    );
  }

  if (currentIndex >= questions.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-sm w-full">
           <h2 className="text-3xl font-bold text-gray-800 mb-2">{t.complete}</h2>
           <p className="text-xl mb-6">{t.score} <span className="text-red-600 font-bold">{score} / {questions.length}</span></p>
           <button 
             onClick={() => setQuestions([])}
             className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-colors"
           >
             {t.tryAgain}
           </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="flex flex-col h-full p-4 md:p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <span className="text-gray-500 font-medium">{t.question} {currentIndex + 1} / {questions.length}</span>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${theme.badge}`}>{level}</span>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">{currentQ.question}</h3>
          
          <div className="space-y-3">
            {currentQ.options.map((option, idx) => {
              let btnClass = "w-full text-left p-4 rounded-xl border-2 transition-all ";
              if (selectedOption === null) {
                btnClass += "border-gray-200 hover:border-red-300 hover:bg-red-50 cursor-pointer";
              } else {
                if (idx === currentQ.correctAnswerIndex) {
                  btnClass += "border-green-500 bg-green-50 text-green-700";
                } else if (idx === selectedOption) {
                   btnClass += "border-red-500 bg-red-50 text-red-700";
                } else {
                   btnClass += "border-gray-100 opacity-50";
                }
              }

              return (
                <button 
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  className={btnClass}
                  disabled={selectedOption !== null}
                >
                  <div className="flex items-center justify-between">
                    <span>{option}</span>
                    {selectedOption !== null && idx === currentQ.correctAnswerIndex && <CheckCircle size={20} className="text-green-600" />}
                    {selectedOption !== null && idx === selectedOption && idx !== currentQ.correctAnswerIndex && <XCircle size={20} className="text-red-600" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {showExplanation && (
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl mb-20 animate-fade-in">
            <h4 className="font-bold text-blue-800 mb-2">{t.explanation}</h4>
            <div className="text-blue-900">
              <ReactMarkdown>{currentQ.explanation}</ReactMarkdown>
            </div>
            <div className="mt-4 flex justify-end">
              <button 
                onClick={nextQuestion}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center"
              >
                {t.next} <ChevronRight size={16} className="ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuizMode;