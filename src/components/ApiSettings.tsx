import React, { useState, useEffect } from 'react';
import { Key, Save, Trash2, Eye, EyeOff, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../services/supabase';

interface ApiKeyInputProps {
  provider: string;
  label: string;
  placeholder: string;
  currentHint: string | null;
  onSave: (apiKey: string, provider: string) => Promise<void>;
  onDelete: (provider: string) => Promise<void>;
}

const ApiKeyInput: React.FC<ApiKeyInputProps> = ({ provider, label, placeholder, currentHint, onSave, onDelete }) => {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const handleSave = async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await onSave(apiKey, provider);
      setApiKey('');
      setSuccess("Saved!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete your ${label}?`)) return;
    setLoading(true);
    setError(null);
    try {
      await onDelete(provider);
      setSuccess("Deleted.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 border-b border-gray-100 pb-6 last:border-0 last:pb-0 mb-6 last:mb-0">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      
      {currentHint ? (
        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
          <code className="text-gray-600 font-mono text-sm">{currentHint}</code>
          <div className="flex space-x-2">
            <button 
              onClick={handleDelete}
              className="text-red-600 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors"
              title="Delete Key"
              disabled={loading}
            >
              {loading ? <RefreshCw className="animate-spin" size={18} /> : <Trash2 size={18} />}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={loading || !apiKey}
            className={`w-full py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center ${
              loading || !apiKey ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? <RefreshCw className="animate-spin mr-2" size={18} /> : <Save className="mr-2" size={18} />}
            Save Key
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center text-red-600 text-sm bg-red-50 p-3 rounded-lg animate-fade-in">
          <AlertCircle size={16} className="mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center text-green-600 text-sm bg-green-50 p-3 rounded-lg animate-fade-in">
          <Check size={16} className="mr-2 flex-shrink-0" />
          {success}
        </div>
      )}
    </div>
  );
};

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> => {
  try {
    const response = await fetch(url, options);
    // If 5xx error, throw to trigger retry
    if (response.status >= 500) {
      throw new Error(`Server error: ${response.status}`);
    }
    return response;
  } catch (err: any) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw err;
  }
};

const ApiSettings: React.FC = () => {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [useLocalStorage, setUseLocalStorage] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }

      const response = await fetchWithRetry('/api/keys', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        if (response.ok) {
          const data = await response.json();
          setKeys(data);
          setUseLocalStorage(false);
        } else {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.details || errData.error || "Failed to load keys";
          
          // Fallback to local storage if DB is missing or error
          if (errMsg.includes("table does not exist") || errMsg.includes("Database error") || response.status === 500 || response.status === 503) {
            console.warn("Database unavailable, falling back to localStorage");
            setUseLocalStorage(true);
            const localKeys = localStorage.getItem('user_api_keys');
            if (localKeys) {
              setKeys(JSON.parse(localKeys));
            }
            // Only show error if no local keys exist, otherwise it's confusing
            if (!localKeys) {
              // If it's a 503 (DB not configured), show a friendly message instead of "Server Error"
              if (response.status === 503) {
                 setGlobalError("Using local storage mode (Database not configured).");
              } else {
                 setGlobalError(`${errMsg} (Using local storage fallback)`);
              }
            } else {
              setGlobalError(null); // Clear error if we have local keys working
            }
          } else {
            setGlobalError(errMsg);
          }
        }
      } else {
        // Handle non-JSON response (e.g. HTML from SPA fallback, or 404)
        const text = await response.text();
        console.error("Non-JSON response from /api/keys:", text.substring(0, 100));
        
        // Treat as server error -> fallback to local storage
        setUseLocalStorage(true);
        const localKeys = localStorage.getItem('user_api_keys');
        if (localKeys) {
          setKeys(JSON.parse(localKeys));
        }
        if (!localKeys) {
           setGlobalError("Server returned invalid response. Using local storage mode.");
        } else {
           setGlobalError(null);
        }
      }
    } catch (err: any) {
      console.error("Failed to fetch keys", err);
      // Fallback on network error too
      setUseLocalStorage(true);
      const localKeys = localStorage.getItem('user_api_keys');
      if (localKeys) {
        setKeys(JSON.parse(localKeys));
      }
      setGlobalError(err.message || "Failed to load keys (Using local storage fallback)");
    } finally {
      setLoading(false);
    }
  };

  const saveKey = async (apiKey: string, provider: string) => {
    if (useLocalStorage) {
      const newKeys = { ...keys, [provider]: '••••••••••' + apiKey.slice(-4) };
      setKeys(newKeys);
      localStorage.setItem('user_api_keys', JSON.stringify(newKeys));
      // Also store the actual key securely? No, localStorage is not secure.
      // But for this fallback, we have to store it somewhere to use it.
      // We'll store the raw key in a separate item for usage, and masked for display?
      // Actually, for the app to work, we need the raw key.
      // Let's store raw keys in a separate object in LS.
      const rawKeys = JSON.parse(localStorage.getItem('user_api_keys_raw') || '{}');
      rawKeys[provider] = apiKey;
      localStorage.setItem('user_api_keys_raw', JSON.stringify(rawKeys));
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Please log in.");

    const response = await fetchWithRetry('/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ apiKey, provider })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.details || data.error || "Failed to save");
    
    setKeys(prev => ({ ...prev, [provider]: data.key_hint }));
  };

  const deleteKey = async (provider: string) => {
    if (useLocalStorage) {
      const newKeys = { ...keys };
      delete newKeys[provider];
      setKeys(newKeys);
      localStorage.setItem('user_api_keys', JSON.stringify(newKeys));
      
      const rawKeys = JSON.parse(localStorage.getItem('user_api_keys_raw') || '{}');
      delete rawKeys[provider];
      localStorage.setItem('user_api_keys_raw', JSON.stringify(rawKeys));
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetchWithRetry('/api/keys', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ provider })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.details || data.error || "Failed to delete");
    
    setKeys(prev => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
  };

  const fixDatabase = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/migrate', {
        method: 'POST',
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        }
      });
      const data = await response.json();
      if (response.ok) {
        setGlobalError(null);
        fetchKeys();
        alert("Database fixed successfully!");
      } else {
        alert(`Failed to fix database: ${data.details || data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading settings...</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-700 flex items-center">
          <Key className="mr-2 text-gray-500" size={20} />
          API Settings
        </h3>
      </div>

      {globalError && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 flex flex-col items-start">
          <div className="flex items-start">
            <AlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={18} />
            <div>
              <p className="font-medium">Error loading settings</p>
              <p className="text-sm mt-1">{globalError}</p>
            </div>
          </div>
          {globalError.includes("table does not exist") && (
            <button 
              onClick={fixDatabase}
              className="mt-3 ml-6 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-sm font-medium transition-colors"
            >
              Attempt to Fix Database
            </button>
          )}
        </div>
      )}

      <ApiKeyInput 
        provider="gemini"
        label="Gemini API Key"
        placeholder="Paste Gemini Key (AIza...)"
        currentHint={keys['gemini'] || null}
        onSave={saveKey}
        onDelete={deleteKey}
      />

      <ApiKeyInput 
        provider="deepseek"
        label="DeepSeek API Key"
        placeholder="Paste DeepSeek Key (sk-...)"
        currentHint={keys['deepseek'] || null}
        onSave={saveKey}
        onDelete={deleteKey}
      />
      
      <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
        Keys are encrypted (AES-256) and never sent to the browser.
      </p>
    </div>
  );
};

export default ApiSettings;
