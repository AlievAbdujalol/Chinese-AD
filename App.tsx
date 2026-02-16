
import React, { useState, useEffect, useRef } from 'react';
import Navigation from './components/Navigation';
import TextTutor from './components/TextTutor';
import LiveTutor from './components/LiveTutor';
import QuizMode from './components/QuizMode';
import Dashboard from './components/Dashboard';
import ExamMode from './components/ExamMode';
import VocabReview from './components/VocabReview';
import VocabBookmarks from './components/VocabBookmarks';
import Profile from './components/Profile';
import Login from './components/Login';
import { AppMode, AppLanguage, HSKLevel } from './types';
import { Menu, Globe, Settings } from 'lucide-react';
import { auth } from './services/firebase';
import firebase from 'firebase/compat/app';
import { getLevelTheme } from './utils/theme';
import { updateStudyTime } from './services/db';

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  [AppLanguage.RU]: 'Русский',
  [AppLanguage.TJ]: 'Тоҷикӣ',
  [AppLanguage.EN]: 'English'
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [language, setLanguage] = useState<AppLanguage>(AppLanguage.EN);
  const [level, setLevel] = useState<HSKLevel>(HSKLevel.HSK1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<firebase.User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    // Auth Listener
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) setIsGuest(false);
    });

    // Safety timeout: If Firebase takes too long (e.g. network blocked), stop loading
    const safetyTimer = setTimeout(() => {
        setAuthLoading((prev) => {
            if (prev) {
                console.warn("Auth state change timed out. Falling back to login screen.");
                return false;
            }
            return prev;
        });
    }, 5000);

    return () => {
        unsubscribe();
        clearTimeout(safetyTimer);
    };
  }, []);

  // Study Timer Logic
  useEffect(() => {
    if ((!user && !isGuest) || document.hidden) return;

    const timer = setInterval(() => {
      if (!document.hidden) {
        updateStudyTime(1);
      }
    }, 60000); // Every 1 minute

    return () => clearInterval(timer);
  }, [user, isGuest]);

  const theme = getLevelTheme(level);

  // Construct guest user object if needed
  const guestUser = {
      uid: 'guest',
      displayName: 'Guest User',
      email: 'local-session',
      photoURL: null,
      providerData: []
  } as unknown as firebase.User;

  const activeUser = user || (isGuest ? guestUser : null);

  // Render active component
  const renderContent = () => {
    // We pass user or key props to force re-render when user logs in/out
    const commonProps = { level, language, key: activeUser ? activeUser.uid : 'guest' };

    switch (mode) {
      case AppMode.DASHBOARD:
        return <Dashboard {...commonProps} />;
      case AppMode.TUTOR:
        return <TextTutor {...commonProps} />;
      case AppMode.LIVE:
        return <LiveTutor {...commonProps} />;
      case AppMode.QUIZ:
        return <QuizMode {...commonProps} />;
      case AppMode.EXAM:
        return <ExamMode {...commonProps} />;
      case AppMode.VOCAB:
        return <VocabReview {...commonProps} />;
      case AppMode.BOOKMARKS:
        return <VocabBookmarks {...commonProps} />;
      case AppMode.PROFILE:
        return (
          <Profile 
             user={activeUser!} 
             language={language} 
             level={level} 
             setLanguage={setLanguage} 
             setLevel={setLevel} 
          />
        );
      default:
        return <Dashboard {...commonProps} />;
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!activeUser) {
    return <Login onGuestLogin={() => setIsGuest(true)} />;
  }

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans overflow-hidden">
      {/* Sidebar - Desktop */}
      <div className="hidden md:block h-full shadow-xl z-20">
        <Navigation 
          currentMode={mode} 
          setMode={setMode} 
          isMobile={false} 
          language={language}
          user={activeUser} 
        />
      </div>

      {/* Sidebar - Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="bg-white w-64 h-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <Navigation 
              currentMode={mode} 
              setMode={(m) => { setMode(m); setSidebarOpen(false); }} 
              isMobile={false} 
              language={language}
              user={activeUser}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 md:px-8 z-10 shrink-0">
           <div className="flex items-center">
             <button className="md:hidden mr-4 p-2 text-gray-600" onClick={() => setSidebarOpen(true)}>
               <Menu size={24} />
             </button>
             <h1 className="text-xl font-bold text-gray-800 md:hidden">HSK Tutor</h1>
           </div>

           <div className="flex items-center space-x-4">
              {/* Level Selector */}
              <div className={`hidden md:flex items-center rounded-lg px-2 py-1 border transition-colors ${theme.bg} ${theme.border}`}>
                 <Settings size={14} className={`${theme.text} mr-2`} />
                 <select 
                   value={level} 
                   onChange={(e) => setLevel(e.target.value as HSKLevel)}
                   className={`bg-transparent border-none text-sm font-bold focus:outline-none cursor-pointer ${theme.text}`}
                 >
                   {Object.values(HSKLevel).map((l) => <option key={l} value={l}>{l}</option>)}
                 </select>
              </div>

              {/* Language Selector */}
              <div className="flex items-center bg-gray-50 rounded-lg px-2 py-1 border border-gray-200">
                 <Globe size={14} className="text-gray-500 mr-2" />
                 <select 
                   value={language} 
                   onChange={(e) => setLanguage(e.target.value as AppLanguage)}
                   className="bg-transparent border-none text-sm font-medium text-gray-700 focus:outline-none cursor-pointer"
                 >
                   {Object.values(AppLanguage).map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
                 </select>
              </div>
           </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-hidden relative bg-gray-50">
           {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;
