import React, { useState, useEffect, useRef } from 'react';
import { loginEmailPassword, registerEmailPassword, signInWithGoogle } from '../services/firebase';
import { LogIn, UserPlus, User } from 'lucide-react';

interface Props {
  onGuestLogin?: () => void;
}

const Login: React.FC<Props> = ({ onGuestLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Track mount status to prevent state updates after successful login (component unmount)
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        setError("Please enter both email and password.");
        return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      if (isSignUp) {
        await registerEmailPassword(email, password);
      } else {
        await loginEmailPassword(email, password);
      }
      // Successful login will trigger unmount via App's auth listener
    } catch (err: any) {
      if (!isMounted.current) return;

      // Only log unexpected errors to keep console clean
      if (err.code !== 'auth/invalid-credential' && err.code !== 'auth/email-already-in-use') {
         console.error(err);
      }

      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError("Invalid email or password.");
      } else if (err.code === 'auth/email-already-in-use') {
        setError("Email already in use. Please sign in.");
      } else if (err.code === 'auth/weak-password') {
        setError("Password should be at least 6 characters.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Authentication failed. Please check your connection.");
      }
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
      await signInWithGoogle();
      // Successful login will trigger unmount via App's auth listener
    } catch (err: any) {
      if (!isMounted.current) return;

      // Handle known errors gracefully without cluttering console
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('Sign in cancelled.');
        return; 
      }
      
      console.error("Google login error:", err);
      
      if (err.code === 'auth/unauthorized-domain') {
        const currentDomain = window.location.hostname;
        setError(`Domain "${currentDomain}" is not authorized. Go to Firebase Console > Authentication > Settings > Authorized Domains and add it.`);
      } else if (err.code === 'auth/popup-blocked') {
        setError('Popup blocked. Please allow popups for this site.');
      } else {
        setError("Google sign in failed. Please try again.");
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 font-sans text-gray-900">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-md">
            中
          </div>
          <h2 className="text-3xl font-bold text-gray-800">HSK Tutor</h2>
          <p className="text-gray-500 mt-2">
            {isSignUp ? 'Create an account to start' : 'Sign in to continue learning'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-100 flex items-center justify-center">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">Email</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">Password</label>
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
                    {isSignUp ? 'Sign Up' : 'Sign In'}
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
                Continue with Google
            </button>

            {onGuestLogin && (
              <button
                  type="button"
                  onClick={onGuestLogin}
                  className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl border border-transparent transition-colors flex items-center justify-center hover:bg-gray-200"
              >
                  <User size={20} className="mr-2 text-gray-500" />
                  Continue as Guest
              </button>
            )}
        </div>
        
        <div className="mt-6 text-center">
          <button 
            onClick={toggleMode}
            className="text-sm text-gray-500 hover:text-red-600 font-medium transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </div>

        <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-100 pt-4">
          Restricted Access • HSK Tutor AI
        </div>
      </div>
    </div>
  );
};

export default Login;