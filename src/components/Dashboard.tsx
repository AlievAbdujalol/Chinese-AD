
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { HSKLevel, AppLanguage } from '../types';
import { translations } from '../utils/translations';
import { getRecentResults, getVocabStats, getGoalAdvice, getDailyProgress, getUserGoals } from '../services/db';
import { getLevelTheme } from '../utils/theme';
import { Target, Clock, BookOpen, Mic, MessageSquare } from 'lucide-react';

interface Props {
  level: HSKLevel;
  language: AppLanguage;
}

const Dashboard: React.FC<Props> = ({ level, language }) => {
  const t = translations[language].dashboard;
  const [vocabData, setVocabData] = useState<any[]>([]);
  const [quizData, setQuizData] = useState<any[]>([]);
  const [advice, setAdvice] = useState<string>('Loading...');
  const [progress, setProgress] = useState({ wordsReviewed: 0, minutesSpent: 0, speakingMinutes: 0, pronunciationCount: 0 });
  const [goals, setGoals] = useState({ dailyWords: 10, dailyMinutes: 15, dailySpeakingMinutes: 5, dailyPronunciation: 10 });
  
  const theme = getLevelTheme(level);

  useEffect(() => {
    const loadData = async () => {
      // Load Vocab Stats
      const vStats = await getVocabStats();
      setVocabData(vStats);

      // Load Results
      const results = await getRecentResults();
      // Format for line chart
      const formattedResults = results.map((r, i) => ({
        name: i + 1, // Just an index for simplicity
        score: Math.round((r.score / r.total) * 100),
        type: r.type,
        date: r.date
      }));
      setQuizData(formattedResults);

      // Load Advice
      const adv = await getGoalAdvice(level, language);
      setAdvice(adv);
      
      // Load Goals & Progress
      const g = await getUserGoals();
      setGoals(g);
      const p = await getDailyProgress();
      setProgress(p);
    };

    loadData();
  }, [level, language]);

  const calcPercentage = (current: number, target: number) => {
      if (target <= 0) return 100;
      return Math.min(100, Math.round((current / target) * 100));
  };

  return (
    <div className="p-8 h-full overflow-y-auto">
       <div className="mb-8">
         <h1 className="text-3xl font-bold text-gray-800">{t.welcome}</h1>
         <p className="text-gray-500">{t.goal} <span className={`font-bold ${theme.text}`}>{level}</span> {t.mastery}</p>
       </div>

       {/* Daily Progress Section */}
       <div className="mb-8">
         <h3 className="font-bold text-lg mb-4 text-gray-700 flex items-center">
            <Target className="mr-2 text-red-500" size={20} />
            {t.dailyProgress}
         </h3>
         <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            
            {/* Words */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-32">
                <div className="flex justify-between items-start">
                   <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                      <BookOpen size={20} />
                   </div>
                   <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">{t.wordsGoal}</span>
                </div>
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-2xl font-bold text-gray-900">{progress.wordsReviewed}</span>
                        <span className="text-sm text-gray-400 font-medium">/ {goals.dailyWords}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-blue-500 h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${calcPercentage(progress.wordsReviewed, goals.dailyWords)}%` }}
                        ></div>
                    </div>
                </div>
            </div>
            
            {/* Time */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-32">
                <div className="flex justify-between items-start">
                   <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-500">
                      <Clock size={20} />
                   </div>
                   <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">{t.timeGoal}</span>
                </div>
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-2xl font-bold text-gray-900">{progress.minutesSpent}</span>
                        <span className="text-sm text-gray-400 font-medium">/ {goals.dailyMinutes}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-orange-500 h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${calcPercentage(progress.minutesSpent, goals.dailyMinutes)}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Speaking Time */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-32">
                <div className="flex justify-between items-start">
                   <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-500">
                      <Mic size={20} />
                   </div>
                   <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">{t.speakingGoal}</span>
                </div>
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-2xl font-bold text-gray-900">{progress.speakingMinutes}</span>
                        <span className="text-sm text-gray-400 font-medium">/ {goals.dailySpeakingMinutes}m</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-purple-500 h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${calcPercentage(progress.speakingMinutes, goals.dailySpeakingMinutes)}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Pronunciation */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-32">
                <div className="flex justify-between items-start">
                   <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-500">
                      <MessageSquare size={20} />
                   </div>
                   <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">{t.pronunciationGoal}</span>
                </div>
                <div>
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-2xl font-bold text-gray-900">{progress.pronunciationCount}</span>
                        <span className="text-sm text-gray-400 font-medium">/ {goals.dailyPronunciation}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-green-500 h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${calcPercentage(progress.pronunciationCount, goals.dailyPronunciation)}%` }}
                        ></div>
                    </div>
                </div>
            </div>

         </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-w-0 flex flex-col">
             <h3 className="font-bold text-lg mb-4 text-gray-700">{t.vocab} (Last 7 Days)</h3>
             {/* Robust container for Recharts to calculate dimensions correctly */}
             <div className="w-full h-[300px] min-w-0 relative">
               {vocabData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                   <BarChart data={vocabData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{fill: '#9ca3af', fontSize: 12}} />
                      <Tooltip 
                        cursor={{fill: '#fef2f2'}} 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                      />
                      <Bar dataKey="words" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={32} />
                   </BarChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="flex items-center justify-center h-full text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    No vocabulary data yet
                 </div>
               )}
             </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 min-w-0 flex flex-col">
             <h3 className="font-bold text-lg mb-4 text-gray-700">{t.quizPerf} (Recent)</h3>
             {/* Robust container for Recharts to calculate dimensions correctly */}
             <div className="w-full h-[300px] min-w-0 relative">
               {quizData.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                   <LineChart data={quizData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 12}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tick={{fill: '#9ca3af', fontSize: 12}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        labelFormatter={() => ''}
                        formatter={(value: any, name: any, props: any) => [`${value}%`, props.payload.type === 'exam' ? 'Exam' : 'Quiz']} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="score" 
                        stroke="#dc2626" 
                        strokeWidth={3} 
                        dot={{r: 4, strokeWidth: 2, fill: '#fff', stroke: '#dc2626'}} 
                        activeDot={{r: 6, strokeWidth: 0, fill: '#dc2626'}}
                      />
                   </LineChart>
                 </ResponsiveContainer>
               ) : (
                 <div className="flex items-center justify-center h-full text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    No results yet
                 </div>
               )}
             </div>
          </div>
       </div>

       <div className="bg-gradient-to-r from-red-600 to-red-500 rounded-2xl p-8 text-white shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-center">
             <div>
               <h3 className="text-2xl font-bold mb-2">HSK {level.split(' ')[1]} {t.examPrep}</h3>
               <p className="opacity-90 max-w-lg">{advice}</p>
             </div>
             <button className="mt-4 md:mt-0 bg-white text-red-600 font-bold py-3 px-6 rounded-lg hover:bg-gray-100 transition-colors opacity-0 cursor-default">
                {t.startPractice}
             </button>
          </div>
       </div>
    </div>
  );
};

export default Dashboard;
