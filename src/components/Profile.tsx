
import React, { useEffect, useState } from 'react';
import { AppLanguage, HSKLevel } from '../types';
import firebase from 'firebase/compat/app';
import { translations } from '../utils/translations';
import { logout } from '../services/firebase';
import { getUserStats, getUserGoals, saveUserGoals } from '../services/db';
import { LogOut, User as UserIcon, Settings, BookOpen, Award, FileText, Globe, Target } from 'lucide-react';
import { getLevelTheme } from '../utils/theme';

interface Props {
  user: firebase.User;
  language: AppLanguage;
  level: HSKLevel;
  setLanguage: (lang: AppLanguage) => void;
  setLevel: (lvl: HSKLevel) => void;
}

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  [AppLanguage.RU]: 'Русский',
  [AppLanguage.TJ]: 'Тоҷикӣ',
  [AppLanguage.EN]: 'English'
};

const Profile: React.FC<Props> = ({ user, language, level, setLanguage, setLevel }) => {
  const t = translations[language].profile;
  const [stats, setStats] = useState({ totalWords: 0, quizAverage: 0, examsTaken: 0 });
  const [goals, setGoals] = useState({ dailyWords: 10, dailyMinutes: 15, dailySpeakingMinutes: 5, dailyPronunciation: 10 });
  const [goalsSaved, setGoalsSaved] = useState(false);
  
  const theme = getLevelTheme(level);

  useEffect(() => {
    const loadData = async () => {
      const s = await getUserStats();
      setStats(s);
      const g = await getUserGoals();
      setGoals(g);
    };
    loadData();
  }, [user]);

  const handleGoalSave = async () => {
    await saveUserGoals(goals);
    setGoalsSaved(true);
    setTimeout(() => setGoalsSaved(false), 2000);
  };

  const getAccountType = () => {
    if (user.uid === 'guest') return 'Guest Session';
    if (user.providerData[0]?.providerId === 'google.com') return 'Google Account';
    return 'Email Account';
  };

  return (
    <div className="h-full bg-gray-50 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
           <h1 className="text-3xl font-bold text-gray-800">{t.title}</h1>
        </div>

        {/* User Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
           <div className="w-24 h-24 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-3xl font-bold border-4 border-white shadow-md">
              {user.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-full h-full rounded-full object-cover" />
              ) : (
                user.email?.[0]?.toUpperCase() || <UserIcon size={40} />
              )}
           </div>
           <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-bold text-gray-900">{user.displayName || "Learner"}</h2>
              <p className="text-gray-500 mb-2">{user.email || 'No email linked'}</p>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
                {getAccountType()}
              </div>
           </div>
        </div>

        {/* Stats Grid */}
        <div>
          <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center">
             <Award className="mr-2 text-red-500" size={20} />
             {t.stats}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                   <BookOpen size={24} />
                </div>
                <div className="text-3xl font-bold text-gray-900">{stats.totalWords}</div>
                <div className="text-sm text-gray-500">{t.wordsLearned}</div>
             </div>
             
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
                <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                   <Award size={24} />
                </div>
                <div className="text-3xl font-bold text-gray-900">{stats.quizAverage}%</div>
                <div className="text-sm text-gray-500">{t.quizAvg}</div>
             </div>

             <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
                <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mx-auto mb-3">
                   <FileText size={24} />
                </div>
                <div className="text-3xl font-bold text-gray-900">{stats.examsTaken}</div>
                <div className="text-sm text-gray-500">{t.examsTaken}</div>
             </div>
          </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* App Settings */}
            <div>
               <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center">
                 <Settings className="mr-2 text-gray-500" size={20} />
                 {t.settings}
               </h3>
               <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6 h-full">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t.level}</label>
                    <select 
                      value={level} 
                      onChange={(e) => setLevel(e.target.value as HSKLevel)}
                      className={`w-full px-4 py-3 rounded-xl border ${theme.border} ${theme.bg} focus:bg-white focus:ring-2 ${theme.ring} outline-none transition-colors ${theme.text}`}
                    >
                       {Object.values(HSKLevel).map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t.language}</label>
                    <div className="relative">
                      <select 
                        value={language} 
                        onChange={(e) => setLanguage(e.target.value as AppLanguage)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500 outline-none transition-colors appearance-none"
                      >
                         {Object.values(AppLanguage).map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
                      </select>
                      <Globe className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={18} />
                    </div>
                  </div>
               </div>
            </div>

            {/* Daily Goals */}
            <div>
               <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center">
                 <Target className="mr-2 text-red-500" size={20} />
                 {t.goals}
               </h3>
               <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6 h-full">
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.goalWords}</label>
                        <input 
                          type="number" 
                          min="1"
                          value={goals.dailyWords}
                          onChange={(e) => setGoals({...goals, dailyWords: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 outline-none transition-colors"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.goalTime}</label>
                        <input 
                          type="number" 
                          min="1"
                          value={goals.dailyMinutes}
                          onChange={(e) => setGoals({...goals, dailyMinutes: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 outline-none transition-colors"
                        />
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.goalSpeaking}</label>
                        <input 
                          type="number" 
                          min="1"
                          value={goals.dailySpeakingMinutes}
                          onChange={(e) => setGoals({...goals, dailySpeakingMinutes: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 outline-none transition-colors"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.goalPronunciation}</label>
                        <input 
                          type="number" 
                          min="1"
                          value={goals.dailyPronunciation}
                          onChange={(e) => setGoals({...goals, dailyPronunciation: parseInt(e.target.value) || 0})}
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 outline-none transition-colors"
                        />
                      </div>
                  </div>

                  <button 
                    onClick={handleGoalSave}
                    className={`w-full py-3 rounded-xl font-bold text-white transition-all ${goalsSaved ? 'bg-green-500' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {goalsSaved ? 'Saved!' : t.saveGoals}
                  </button>
               </div>
            </div>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-gray-200">
           <button 
             onClick={() => {
                 if (user.uid === 'guest') window.location.reload(); // Simple reload for guest logout
                 else logout();
             }}
             className="flex items-center text-red-600 hover:text-red-700 font-bold px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
           >
              <LogOut size={20} className="mr-2" />
              {t.signOut}
           </button>
        </div>

      </div>
    </div>
  );
};

export default Profile;
