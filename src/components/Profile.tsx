
import React, { useEffect, useState } from 'react';
import { AppLanguage, HSKLevel } from '../types';
import { User } from 'firebase/auth';
import { translations } from '../utils/translations';
import { logout } from '../services/firebase';
import { getUserStats, getUserGoals, saveUserGoals } from '../services/db';
import { getAvailableModels } from '../services/gemini';
import { LogOut, User as UserIcon, Settings, Target } from 'lucide-react';
import { getLevelTheme } from '../utils/theme';
import LearnedWordsList from './LearnedWordsList';
import ApiSettings from './ApiSettings';

interface Props {
  user: User;
  language: AppLanguage;
  level: HSKLevel;
  setLanguage: (lang: AppLanguage) => void;
  setLevel: (lvl: HSKLevel) => void;
}

const Profile: React.FC<Props> = ({ user, language, level, setLanguage, setLevel }) => {
  const t = translations[language].profile;
  const [stats, setStats] = useState({ totalWords: 0, quizAverage: 0, examsTaken: 0 });
  const [goals, setGoals] = useState({ dailyWords: 10, dailyMinutes: 15, dailySpeakingMinutes: 5, dailyPronunciation: 10 });
  const [goalsSaved, setGoalsSaved] = useState(false);
  const [showLearnedWords, setShowLearnedWords] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('hsk_selected_model') || 'gemini-3-flash-preview');
  
  const theme = getLevelTheme(level);

  useEffect(() => {
    const loadData = async () => {
      const s = await getUserStats();
      setStats(s);
      const g = await getUserGoals();
      setGoals(g);
      try {
        const availableModels = await getAvailableModels();
        // Filter out models that are not suitable for general text generation if needed
        // For now, just set them all or filter by name containing 'gemini'
        setModels(availableModels.filter(m => m.name.includes('gemini')));
      } catch (e) {
        console.error("Failed to load models", e);
      }
    };
    loadData();
  }, [user]);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    localStorage.setItem('hsk_selected_model', newModel);
  };

  const handleGoalSave = async () => {
    await saveUserGoals(goals);
    setGoalsSaved(true);
    setTimeout(() => setGoalsSaved(false), 2000);
  };

  const userAvatar = user.photoURL;
  const userName = user.displayName || user.email?.split('@')[0] || "Learner";
  const userInitial = user.email?.[0]?.toUpperCase();

  return (
    <div className="h-full bg-gray-50 overflow-y-auto p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
           <h1 className="text-3xl font-bold text-gray-800">{t.title}</h1>
        </div>

        {/* User Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden relative">
           {/* Banner */}
           <div className="h-32 bg-gradient-to-r from-red-500 to-orange-400 w-full relative">
              <div className="absolute inset-0 bg-black/10"></div>
           </div>
           
           <div className="px-6 sm:px-10 pb-8 relative">
              {/* Avatar */}
              <div className="flex flex-col sm:flex-row items-center sm:items-end sm:space-x-6 -mt-16 sm:-mt-12 mb-4">
                 <div className="w-32 h-32 rounded-full bg-white p-1.5 shadow-lg relative z-10 shrink-0">
                    <div className="w-full h-full rounded-full bg-red-50 flex items-center justify-center text-red-600 text-4xl font-bold overflow-hidden">
                      {userAvatar ? (
                        <img src={userAvatar} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        userInitial || <UserIcon size={48} />
                      )}
                    </div>
                 </div>
                 
                 <div className="mt-4 sm:mt-0 text-center sm:text-left flex-1 pb-2">
                    <h2 className="text-3xl font-bold text-gray-900 tracking-tight">{userName}</h2>
                    <p className="text-gray-500 font-medium mt-1">{user.email || t.noEmail}</p>
                 </div>
                 
                 <div className="mt-4 sm:mt-0 pb-2">
                    <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-bold border ${theme.bg} ${theme.text} ${theme.border}`}>
                       {level} Scholar
                    </span>
                 </div>
              </div>
              
              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-gray-100 mt-2">
                 <div className="text-center sm:text-left">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Words Learned</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalWords}</p>
                 </div>
                 <div className="text-center sm:text-left border-l border-gray-100 pl-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Quiz Avg</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.quizAverage}%</p>
                 </div>
                 <div className="text-center sm:text-left border-l border-gray-100 pl-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Exams Taken</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.examsTaken}</p>
                 </div>
              </div>
           </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* App Settings */}
            <div className="flex flex-col">
               <div className="flex items-center justify-between mb-4">
                 <h3 className="text-lg font-bold text-gray-700 flex items-center">
                   <Settings className="mr-2 text-gray-500" size={20} />
                   {t.settings}
                 </h3>
               </div>
               <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6 flex-1">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t.level}</label>
                    <select 
                      value={level} 
                      onChange={(e) => setLevel(e.target.value as HSKLevel)}
                      className={`w-full px-4 py-3 rounded-xl border ${theme.border} ${theme.bg} focus:bg-white focus:ring-2 ${theme.ring} outline-none transition-colors ${theme.text} font-medium`}
                    >
                       {Object.values(HSKLevel).map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">AI Model (Gemini)</label>
                    <select 
                      value={selectedModel} 
                      onChange={handleModelChange}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors font-medium text-gray-800"
                    >
                       {models.length > 0 ? (
                         models.map((m) => {
                           const modelName = m.name.replace('models/', '');
                           return <option key={modelName} value={modelName}>{m.displayName || modelName}</option>;
                         })
                       ) : (
                         <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                       )}
                    </select>
                    <p className="text-xs text-gray-400 mt-2">Select the AI model used for generating content and chat responses.</p>
                  </div>
               </div>
            </div>

            {/* Daily Goals */}
            <div className="flex flex-col">
               <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center">
                 <Target className="mr-2 text-red-500" size={20} />
                 {t.goals}
               </h3>
               <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6 flex-1 flex flex-col justify-between">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.goalSpeaking}</label>
                        <div className="relative">
                           <input 
                             type="number" 
                             min="1"
                             value={goals.dailySpeakingMinutes}
                             onChange={(e) => setGoals({...goals, dailySpeakingMinutes: parseInt(e.target.value) || 0})}
                             className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500 outline-none transition-colors font-medium"
                           />
                           <span className="absolute right-4 top-3.5 text-sm text-gray-400 font-medium">min</span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.goalPronunciation}</label>
                        <div className="relative">
                           <input 
                             type="number" 
                             min="1"
                             value={goals.dailyPronunciation}
                             onChange={(e) => setGoals({...goals, dailyPronunciation: parseInt(e.target.value) || 0})}
                             className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500 outline-none transition-colors font-medium"
                           />
                           <span className="absolute right-4 top-3.5 text-sm text-gray-400 font-medium">min</span>
                        </div>
                      </div>
                  </div>

                  <button 
                    onClick={handleGoalSave}
                    className={`w-full py-3.5 mt-6 rounded-xl font-bold text-white transition-all shadow-sm ${goalsSaved ? 'bg-emerald-500 shadow-emerald-200' : 'bg-gray-900 hover:bg-gray-800 shadow-gray-200'}`}
                  >
                    {goalsSaved ? t.saved : t.saveGoals}
                  </button>
               </div>
            </div>
        </div>

        {/* API Settings - Full Width */}
        <div className="mt-8">
           <ApiSettings />
        </div>

        {/* Actions */}
        <div className="pt-8 pb-12 flex flex-col md:flex-row justify-center items-center">
           <button 
             onClick={() => {
                 if (user.id === 'guest') window.location.reload(); // Simple reload for guest logout
                 else logout();
             }}
             className="flex items-center text-red-600 hover:text-red-700 font-bold px-6 py-3 rounded-2xl border border-red-100 hover:bg-red-50 transition-colors w-full md:w-auto justify-center shadow-sm"
           >
              <LogOut size={20} className="mr-2" />
              {t.signOut}
           </button>
        </div>

      </div>
      
      {showLearnedWords && <LearnedWordsList onClose={() => setShowLearnedWords(false)} language={language} />}
    </div>
  );
};

export default Profile;
