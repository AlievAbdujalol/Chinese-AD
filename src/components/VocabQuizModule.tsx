
import React, { useState } from 'react';
import { AppLanguage, HSKLevel } from '../types';
import VocabReview from './VocabReview';
import QuizMode from './QuizMode';
import { BookOpen, GraduationCap, ArrowLeft, ArrowRight } from 'lucide-react';
import { translations } from '../utils/translations';
import { getLevelTheme } from '../utils/theme';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

const VocabQuizModule: React.FC<Props> = ({ language }) => {
  const level = HSKLevel.HSK1;
  const [subMode, setSubMode] = useState<'selection' | 'flashcards' | 'quiz'>('selection');
  
  const t = translations[language].vocab;
  const qt = translations[language].quiz;
  const nt = translations[language].nav;
  const theme = getLevelTheme(level);

  if (subMode === 'flashcards') {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 bg-white border-b border-gray-100 flex items-center">
          <button 
            onClick={() => setSubMode('selection')}
            className="p-2 hover:bg-gray-100 rounded-full mr-2 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-bold text-gray-800">{t.title}</h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <VocabReview language={language} level={level} />
        </div>
      </div>
    );
  }

  if (subMode === 'quiz') {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 bg-white border-b border-gray-100 flex items-center">
          <button 
            onClick={() => setSubMode('selection')}
            className="p-2 hover:bg-gray-100 rounded-full mr-2 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-bold text-gray-800">{qt.genTitle}</h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <QuizMode language={language} level={level} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="max-w-2xl w-full text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">{nt.vocabQuiz}</h1>
        <p className="text-lg text-gray-600">Master HSK 1 vocabulary through interactive flashcards and challenging quizzes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
        {/* Flashcards Option */}
        <button 
          onClick={() => setSubMode('flashcards')}
          className="group bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-red-200 transition-all text-left flex flex-col h-full"
        >
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mb-6 group-hover:scale-110 transition-transform">
            <BookOpen size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">{t.title}</h2>
          <p className="text-gray-600 flex-1">{t.desc}</p>
          <div className="mt-6 flex items-center text-red-600 font-bold">
            {t.startReview} <ArrowRight className="ml-2" size={18} />
          </div>
        </button>

        {/* Quiz Option */}
        <button 
          onClick={() => setSubMode('quiz')}
          className="group bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all text-left flex flex-col h-full"
        >
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform">
            <GraduationCap size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">{qt.genTitle}</h2>
          <p className="text-gray-600 flex-1">{qt.genDesc}</p>
          <div className="mt-6 flex items-center text-blue-600 font-bold">
            {qt.takeQuiz} <ArrowRight className="ml-2" size={18} />
          </div>
        </button>
      </div>
    </div>
  );
};

export default VocabQuizModule;
