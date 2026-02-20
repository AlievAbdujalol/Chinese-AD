
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
import ImageGen from './components/ImageGen';
import Login from './components/Login';
import { AppMode, AppLanguage, HSKLevel } from './types';
import { Menu, Globe, Settings, Bell, X, ArrowRight } from 'lucide-react';
import { auth } from './services/firebase';
import firebase from 'firebase/compat/app';
import { getLevelTheme } from './utils/theme';
import { updateStudyTime, getUserGoals, getDailyProgress } from './services/db';

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  [AppLanguage.RU]: 'Русский',
  [AppLanguage.TJ]: 'Тоҷикӣ',
  [AppLanguage.EN]: 'English'
};

const App: React.FC = () => {
  console.log('App component rendering...');
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [language, setLanguage] = useState<AppLanguage>(AppLanguage.EN);
  const [level, setLevel] = useState<HSKLevel>(HSKLevel.HSK1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<firebase.User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  // Notification State
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');

  // Persist Tutor Mode (Chat vs Review)
  const [tutorSubMode, setTutorSubMode] = useState<'chat' | 'review'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hsk_tutor_submode');
      return (saved === 'chat' || saved === 'review') ? saved : 'chat';
    }
    return 'chat';
  });

  // Dummy state to force re-evaluation if needed, though simple polling is safer for this
  const [progressTrigger] = useState(0);

  const handleTutorModeChange = (m: 'chat' | 'review') => {
    setTutorSubMode(m);
    localStorage.setItem('hsk_tutor_submode', m);
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      // Reset guest mode if actual login occurs
      if (currentUser) setIsGuest(false);
    });
    return () => unsubscribe();
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

  // Daily Goal Reminder Logic
  useEffect(() => {
    if ((!user && !isGuest)) return;

    const checkGoals = async () => {
      const now = new Date();
      const hour = now.getHours();
      
      // Only check between 6 PM (18:00) and Midnight to avoid annoying morning users
      if (hour < 18) return;

      const todayStr = now.toDateString(); // "Mon Jan 01 2024"
      const dismissedDay = localStorage.getItem('hsk_daily_reminder_dismissed');

      // Check if already dismissed today
      if (dismissedDay === todayStr) return;

      try {
        const goals = await getUserGoals();
        const progress = await getDailyProgress();

        const wordsLeft = Math.max(0, goals.dailyWords - progress.wordsReviewed);
        const minsLeft = Math.max(0, goals.dailyMinutes - progress.minutesSpent);

        if (wordsLeft > 0 || minsLeft > 0) {
           let msg = "Keep going!";
           if (wordsLeft > 0 && minsLeft > 0) {
             msg = `You still have ${wordsLeft} words and ${minsLeft} mins left to reach your daily goal!`;
           } else if (wordsLeft > 0) {
             msg = `Only ${wordsLeft} more words to review today!`;
           } else {
             msg = `Just ${minsLeft} more minutes of practice needed!`;
           }
           setNotificationMsg(msg);
           setShowNotification(true);
        }
      } catch (e) {
        console.error("Goal check failed", e);
      }
    };

    // Check immediately on mount (if evening) and then every 10 minutes
    checkGoals();
    const reminderInterval = setInterval(checkGoals, 1000 * 60 * 10);

    return () => clearInterval(reminderInterval);
  }, [user, isGuest, progressTrigger]); // Dependent on user state

  const dismissNotification = () => {
    setShowNotification(false);
    localStorage.setItem('hsk_daily_reminder_dismissed', new Date().toDateString());
  };

  const handleNotificationAction = () => {
    setMode(AppMode.TUTOR);
    setTutorSubMode('review'); // Flashcards are best for quick goals
    setShowNotification(false);
  };

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
        return (
          <TextTutor 
            {...commonProps} 
            initialTutorMode={tutorSubMode}
            onTutorModeChange={handleTutorModeChange}
          />
        );
      case AppMode.LIVE:
        return <LiveTutor {...commonProps} />;
      case AppMode.QUIZ:
        return <QuizMode {...commonProps} />;
      case AppMode.EXAM:
        return <ExamMode {...commonProps} />;
      case AppMode.VOCAB:
        return <VocabReview {...commonProps} />;
      case AppMode.VISUALS:
        return <ImageGen language={language} />;
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
                   {Object.values(AppLanguage).map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l as AppLanguage]}</option>)}
                 </select>
              </div>
           </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-hidden relative bg-gray-50">
           {renderContent()}
        </main>

        {/* Notification Toast */}
        {showNotification && (
          <div className="absolute bottom-6 right-6 z-50 animate-fade-in max-w-sm w-full md:w-auto">
             <div className="bg-white rounded-2xl shadow-2xl border border-red-100 p-4 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                
                <div className="flex items-start justify-between mb-2 pl-3">
                   <div className="flex items-center text-red-600 font-bold text-sm uppercase tracking-wider">
                      <Bell size={14} className="mr-2 fill-current" />
                      Daily Reminder
                   </div>
                   <button 
                     onClick={dismissNotification}
                     className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                   >
                      <X size={16} />
                   </button>
                </div>
                
                <p className="text-gray-800 text-sm mb-4 pl-3 font-medium leading-relaxed">
                   {notificationMsg}
                </p>
                
                <div className="flex justify-end space-x-3 pl-3">
                   <button 
                     onClick={dismissNotification}
                     className="text-gray-500 text-xs font-bold hover:text-gray-700 px-2 py-1"
                   >
                     Later
                   </button>
                   <button 
                     onClick={handleNotificationAction}
                     className="bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center shadow-md shadow-red-100"
                   >
                     Practice Now <ArrowRight size={12} className="ml-1" />
                   </button>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
    