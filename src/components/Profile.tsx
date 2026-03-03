
import React, { useEffect, useState } from 'react';
import { AppLanguage, HSKLevel } from '../types';
import { User } from '@supabase/supabase-js';
import { translations } from '../utils/translations';
import { logout } from '../services/supabase';
import { getUserStats, getUserGoals, saveUserGoals } from '../services/db';
import { LogOut, User as UserIcon, Settings, BookOpen, Award, FileText, Globe, Target, Cloud } from 'lucide-react';
import { getLevelTheme } from '../utils/theme';
import LearnedWordsList from './LearnedWordsList';
import DeployGuide from './DeployGuide';

import { getAIProvider, setAIProvider, AIProvider } from '../services/gemini';

interface Props {
  user: User;
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
  const [showLearnedWords, setShowLearnedWords] = useState(false);
  const [showDeployGuide, setShowDeployGuide] = useState(false);
  
  // AI Settings
  const [aiProvider, setLocalAIProvider] = useState<AIProvider>(getAIProvider());
  const [deepseekKey, setDeepseekKey] = useState(localStorage.getItem('deepseek_api_key') || '');
  const [keySaved, setKeySaved] = useState(false);
  
  // Image Provider Settings
  const [imageProvider, setImageProvider] = useState<string>(localStorage.getItem('image_provider') || 'gemini');
  const [leonardoKey, setLeonardoKey] = useState(localStorage.getItem('leonardo_api_key') || '');
  const [leonardoKeySaved, setLeonardoKeySaved] = useState(false);

  const theme = getLevelTheme(level);

  const handleProviderChange = (p: AIProvider) => {
    setLocalAIProvider(p);
    setAIProvider(p);
  };

  const saveDeepseekKey = () => {
    localStorage.setItem('deepseek_api_key', deepseekKey);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const saveLeonardoKey = () => {
    localStorage.setItem('leonardo_api_key', leonardoKey);
    setLeonardoKeySaved(true);
    setTimeout(() => setLeonardoKeySaved(false), 2000);
  };

  const handleImageProviderChange = (provider: string) => {
      setImageProvider(provider);
      localStorage.setItem('image_provider', provider);
      window.location.reload();
  };

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
    if (user.id === 'guest') return t.guestSession;
    if (user.app_metadata?.provider === 'google') return t.googleAccount;
    return t.emailAccount;
  };

  const userAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || "Learner";
  const userInitial = user.email?.[0]?.toUpperCase();

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
              {userAvatar ? (
                <img src={userAvatar} alt="User" className="w-full h-full rounded-full object-cover" />
              ) : (
                userInitial || <UserIcon size={40} />
              )}
           </div>
           <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-bold text-gray-900">{userName}</h2>
              <p className="text-gray-500 mb-2">{user.email || t.noEmail}</p>
              <div className="inline-flex items-center px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
                {getAccountType()}
              </div>
           </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* App Settings */}
            <div>
               <div className="flex items-center justify-between mb-4">
                 <h3 className="text-lg font-bold text-gray-700 flex items-center">
                   <Settings className="mr-2 text-gray-500" size={20} />
                   {t.settings}
                 </h3>
                 <button 
                   onClick={() => (window as any).aistudio?.openSelectKey?.()}
                   className="text-blue-500 hover:text-blue-600 text-sm font-medium hover:underline"
                 >
                   {t.addApiKey}
                 </button>
               </div>
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

                  {/* AI Provider Settings */}
                  <div className="pt-4 border-t border-gray-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t.textProvider}</label>
                    <div className="flex space-x-2 mb-3">
                      <button 
                        onClick={() => handleProviderChange('gemini')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${aiProvider === 'gemini' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                      >
                        Gemini
                      </button>
                      <button 
                        onClick={() => handleProviderChange('deepseek')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${aiProvider === 'deepseek' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                      >
                        DeepSeek
                      </button>
                    </div>
                    
                    {aiProvider === 'deepseek' && (
                      <div className="animate-fade-in mb-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t.deepseekKey}</label>
                        <div className="flex space-x-2">
                          <input 
                            type="password" 
                            value={deepseekKey}
                            onChange={(e) => setDeepseekKey(e.target.value)}
                            placeholder="sk-..."
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <button 
                            onClick={saveDeepseekKey}
                            className={`px-3 py-2 rounded-lg text-sm font-bold text-white transition-colors ${keySaved ? 'bg-green-500' : 'bg-gray-900 hover:bg-gray-800'}`}
                          >
                            {keySaved ? t.saved : t.save}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{t.getKey} platform.deepseek.com</p>
                      </div>
                    )}

                    {/* Image Provider Settings */}
                    <div className="pt-4 border-t border-gray-100">
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.imageProvider}</label>
                        <div className="flex space-x-2 mb-3">
                            <button 
                                onClick={() => handleImageProviderChange('gemini')}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${imageProvider !== 'leonardo' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                            >
                                {t.geminiDefault}
                            </button>
                            <button 
                                onClick={() => handleImageProviderChange('leonardo')}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${imageProvider === 'leonardo' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'}`}
                            >
                                {t.leonardoAi}
                            </button>
                        </div>

                        {imageProvider === 'leonardo' && (
                            <div className="animate-fade-in">
                                <label className="block text-xs font-medium text-gray-500 mb-1">{t.leonardoKey}</label>
                                <div className="flex space-x-2">
                                    <input 
                                        type="password" 
                                        value={leonardoKey}
                                        onChange={(e) => setLeonardoKey(e.target.value)}
                                        placeholder={t.pasteKey}
                                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                    <button 
                                        onClick={saveLeonardoKey}
                                        className={`px-3 py-2 rounded-lg text-sm font-bold text-white transition-colors ${leonardoKeySaved ? 'bg-green-500' : 'bg-gray-900 hover:bg-gray-800'}`}
                                    >
                                        {leonardoKeySaved ? t.saved : t.save}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{t.getKey} app.leonardo.ai</p>
                            </div>
                        )}
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
                    {goalsSaved ? t.saved : t.saveGoals}
                  </button>
               </div>
            </div>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
           <button 
             onClick={() => {
                 if (user.id === 'guest') window.location.reload(); // Simple reload for guest logout
                 else logout();
             }}
             className="flex items-center text-red-600 hover:text-red-700 font-bold px-4 py-2 rounded-lg hover:bg-red-50 transition-colors w-full md:w-auto justify-center"
           >
              <LogOut size={20} className="mr-2" />
              {t.signOut}
           </button>

           <button 
             onClick={() => setShowDeployGuide(true)}
             className="flex items-center text-gray-500 hover:text-blue-600 font-medium px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors text-sm w-full md:w-auto justify-center"
           >
              <Cloud size={18} className="mr-2" />
              {t.deployGuide}
           </button>
        </div>

      </div>
      
      {showLearnedWords && <LearnedWordsList onClose={() => setShowLearnedWords(false)} language={language} />}
      {showDeployGuide && <DeployGuide onClose={() => setShowDeployGuide(false)} />}
    </div>
  );
};

export default Profile;
