import React from 'react';
import { AppMode, AppLanguage } from '../types';
import { BarChart2, MessageCircle, Mic, GraduationCap, FileText, BookOpen, Star, LogOut, Cloud, User } from 'lucide-react';
import { translations } from '../utils/translations';
import { logout } from '../services/firebase';

interface Props {
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
  isMobile: boolean;
  language: AppLanguage;
  user: any | null; // Firebase user object
}

const Navigation: React.FC<Props> = ({ currentMode, setMode, isMobile, language, user }) => {
  const t = translations[language].nav;

  const navItems = [
    { mode: AppMode.DASHBOARD, icon: <BarChart2 size={20} />, label: t.dashboard },
    { mode: AppMode.PROFILE, icon: <User size={20} />, label: t.profile },
    { mode: AppMode.TUTOR, icon: <MessageCircle size={20} />, label: t.tutor },
    { mode: AppMode.LIVE, icon: <Mic size={20} />, label: t.live },
    { mode: AppMode.VOCAB, icon: <BookOpen size={20} />, label: t.vocab },
    { mode: AppMode.BOOKMARKS, icon: <Star size={20} />, label: t.bookmarks },
    { mode: AppMode.QUIZ, icon: <GraduationCap size={20} />, label: t.quiz },
    { mode: AppMode.EXAM, icon: <FileText size={20} />, label: t.exam },
  ];

  const baseClass = "flex items-center p-3 mb-2 rounded-lg cursor-pointer transition-colors";
  const activeClass = "bg-red-600 text-white shadow-md";
  const inactiveClass = "text-gray-600 hover:bg-red-50 hover:text-red-600";

  return (
    <div className={`flex flex-col h-full bg-white border-r border-gray-200 ${isMobile ? 'w-16' : 'w-64'} transition-all duration-300`}>
      <div className="p-4 flex items-center justify-center border-b border-gray-100 mb-2">
        <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white font-bold mr-2">
          中
        </div>
        {!isMobile && <span className="font-bold text-xl text-gray-800">HSK Tutor</span>}
      </div>
      
      <div className="flex-1 overflow-y-auto px-2">
        {navItems.map((item) => (
          <div
            key={item.mode}
            onClick={() => setMode(item.mode)}
            className={`${baseClass} ${currentMode === item.mode ? activeClass : inactiveClass}`}
            title={item.label}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!isMobile && <span className="ml-3 font-medium">{item.label}</span>}
          </div>
        ))}
      </div>

      {user && (
        <div className="p-4 border-t border-gray-200">
           <div className="flex flex-col">
              {!isMobile && (
                <div 
                  className="flex items-center mb-4 px-2 cursor-pointer hover:bg-gray-50 rounded-lg p-2 transition-colors"
                  onClick={() => setMode(AppMode.PROFILE)}
                >
                    {user.photoURL ? (
                        <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full mr-3 border border-gray-200" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold mr-3">
                            {user.email?.[0]?.toUpperCase()}
                        </div>
                    )}
                    <div className="overflow-hidden">
                        <p className="text-xs font-bold text-gray-800 truncate">{user.displayName}</p>
                        <div className="flex items-center text-xs text-green-600">
                            <Cloud size={10} className="mr-1" />
                            Cloud Sync
                        </div>
                    </div>
                </div>
              )}
              <button 
                onClick={logout}
                className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors text-gray-500 hover:bg-gray-100 w-full ${isMobile ? 'justify-center' : ''}`}
                title="Sign Out"
              >
                <LogOut size={20} />
                {!isMobile && <span className="ml-3 font-medium">Sign Out</span>}
              </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default Navigation;
