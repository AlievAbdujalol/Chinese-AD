import React, { useState, useEffect, useRef } from 'react';
import { loginEmailPassword, registerEmailPassword, signInWithGoogle, supabase } from '../services/supabase';
import { LogIn, UserPlus, User, HelpCircle, Globe } from 'lucide-react';
import ConfigHelp from './ConfigHelp';
import { AppLanguage } from '../types';
import { translations } from '../utils/translations';

interface Props {
  onGuestLogin?: () => void;
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
}

const Login: React.FC<Props> = ({ onGuestLogin, language, setLanguage }) => {
  const t = translations[language].login;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  
  // Track mount status to prevent state updates after successful login (component unmount)
  const isMounted = useRef(true);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SUPABASE_AUTH_SUCCESS') {
        const { session } = event.data;
        supabase.auth.setSession(session);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      isMounted.current = false;
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        setError(t.enterBoth);
        return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      if (isSignUp) {
        await registerEmailPassword(email, password);
        setError(t.checkEmail);
      } else {
        await loginEmailPassword(email, password);
      }
      // Successful login will trigger unmount via App's auth listener
    } catch (err: any) {
      if (!isMounted.current) return;
      console.error(err);
      let message = err.message || t.authFailed;
      
      // Handle specific Supabase errors
      if (message.includes("Invalid login credentials") || message.includes("invalid_grant")) {
        message = t.invalidCreds;
      } else if (message.includes("User already registered")) {
        message = t.alreadyRegistered;
        setIsSignUp(false); // Auto-switch to Sign In
      } else if (message.includes("Email not confirmed")) {
        message = t.emailNotConfirmed;
      } else if (message.includes("Failed to fetch")) {
        message = t.networkError;
      }
      
      setFailedAttempts(prev => prev + 1);
      setError(message);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return; // Prevent double clicks
    setLoading(true);
    setError('');
    try {
      const data = await signInWithGoogle();
      if (data?.url) {
        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(data.url, 'google_login', `width=${width},height=${height},left=${left},top=${top}`);
      }
    } catch (err: any) {
      if (!isMounted.current) return;
      console.error("Google login error:", err);
      const message = err.message || t.googleFailed;
      setError(message);
      setLoading(false);
      
      // Auto-show help if it's a configuration error
      if (message.includes("invalid_client") || message.includes("401")) {
        setShowHelp(true);
      }
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setEmail('');
    setPassword('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 font-sans text-gray-900 relative">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-white rounded-full shadow-sm border border-gray-200 p-1 flex items-center">
            <Globe size={16} className="text-gray-400 ml-2 mr-1" />
            <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value as AppLanguage)}
                className="bg-transparent border-none text-sm font-medium text-gray-600 focus:ring-0 cursor-pointer py-1 pr-2"
            >
                <option value={AppLanguage.EN}>English</option>
                <option value={AppLanguage.RU}>Русский</option>
                <option value={AppLanguage.TJ}>Тоҷикӣ</option>
            </select>
        </div>
      </div>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8 relative">
          <button 
            onClick={() => setShowHelp(true)}
            className="absolute top-0 left-0 text-gray-400 hover:text-blue-500 transition-colors"
            title="Configuration Help"
          >
            <HelpCircle size={20} />
          </button>
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-md">
            中
          </div>
          <h2 className="text-3xl font-bold text-gray-800">HSK Tutor</h2>
        </div>

        <div className="flex border-b border-gray-200 mb-6">
          <button
            type="button"
            className={`flex-1 pb-2 text-sm font-bold transition-colors ${!isSignUp ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => { setIsSignUp(false); setError(''); }}
          >
            {t.signIn}
          </button>
          <button
            type="button"
            className={`flex-1 pb-2 text-sm font-bold transition-colors ${isSignUp ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => { setIsSignUp(true); setError(''); }}
          >
            {t.signUp}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-100 flex flex-col items-center justify-center">
              <p className="mb-2">{error}</p>
              {error.includes("Login failed") && !isSignUp && (
                <div className="flex flex-col space-y-2 mt-2 w-full">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(true); setError(''); }}
                    className="text-xs font-bold bg-white border border-red-200 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors w-full animate-pulse"
                  >
                    {t.switchToSignUp}
                  </button>
                  {onGuestLogin && (
                    <button
                      type="button"
                      onClick={onGuestLogin}
                      className="text-xs font-bold bg-gray-100 border border-gray-300 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors w-full flex items-center justify-center"
                    >
                      <User size={14} className="mr-1" /> {t.continueGuest}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">{t.email}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400"
              placeholder="name@example.com"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700 ml-1">{t.password}</label>
              {!isSignUp && (
                <button 
                  type="button"
                  onClick={() => setError(t.contactSupport)}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  {t.forgotPassword}
                </button>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all bg-gray-50 focus:bg-white text-gray-900 placeholder-gray-400"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-red-600 text-white font-bold py-3.5 rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 flex items-center justify-center ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
                <>
                    {isSignUp ? <UserPlus size={20} className="mr-2" /> : <LogIn size={20} className="mr-2" />}
                    {isSignUp ? t.signUp : t.signIn}
                </>
            )}
          </button>
        </form>

        <div className="my-6 flex items-center">
          <div className="flex-1 border-t border-gray-200"></div>
          <span className="px-4 text-xs text-gray-400 font-medium">OR</span>
          <div className="flex-1 border-t border-gray-200"></div>
        </div>

        <div className="space-y-3">
            <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className={`w-full bg-white text-gray-700 font-bold py-3.5 rounded-xl border border-gray-200 transition-colors flex items-center justify-center ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
            >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
                    />
                    <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                </svg>
                {t.continueGoogle}
            </button>

            {onGuestLogin && (
              <button
                  type="button"
                  onClick={onGuestLogin}
                  className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl border border-transparent transition-colors flex items-center justify-center hover:bg-gray-200"
              >
                  <User size={20} className="mr-2 text-gray-500" />
                  {t.continueGuest}
              </button>
            )}
        </div>
        
        <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-100 pt-4">
          {t.restrictedAccess}
        </div>
      </div>
      
      {showHelp && <ConfigHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
};

export default Login;
