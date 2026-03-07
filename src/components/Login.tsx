import React, { useState, useEffect, useRef } from 'react';
import { signInWithGoogle } from '../services/firebase';
import { User, Globe } from 'lucide-react';
import { AppLanguage } from '../types';
import { translations } from '../utils/translations';

interface Props {
  onGuestLogin?: () => void;
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
}

const Login: React.FC<Props> = ({ onGuestLogin, language, setLanguage }) => {
  const t = translations[language].login;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Track mount status to prevent state updates after successful login (component unmount)
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleGoogleLogin = async () => {
    if (loading) return; // Prevent double clicks
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // Firebase handles the redirect/popup automatically
    } catch (err: any) {
      if (!isMounted.current) return;
      console.error("Google login error:", err);
      const message = err.message || t.googleFailed;
      setError(message);
      setLoading(false);
    }
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
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-md">
            中
          </div>
          <h2 className="text-3xl font-bold text-gray-800">HSK Tutor</h2>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-100 mb-6">
              <p>{error}</p>
            </div>
        )}

        <div className="space-y-3">
            <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className={`w-full bg-white text-gray-700 font-bold py-3.5 rounded-xl border border-gray-200 transition-colors flex items-center justify-center ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
            >
                {loading ? (
                    <div className="w-5 h-5 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mr-3"></div>
                ) : (
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
                )}
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
    </div>
  );
};

export default Login;
