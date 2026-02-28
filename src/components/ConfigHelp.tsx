import React from 'react';
import { X, ExternalLink, AlertTriangle, CheckCircle } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const ConfigHelp: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-xl font-bold text-gray-900 flex items-center">
            <AlertTriangle className="mr-2 text-yellow-500" size={24} />
            Google Login Setup
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={24} className="text-gray-400" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-gray-700">
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-800">
            <strong>Error 401: invalid_client?</strong><br/>
            This means the <strong>Client ID</strong> in Supabase is incorrect. It looks like you might have entered the "App Name" instead of the actual Client ID.
          </div>

          <section>
            <h4 className="font-bold text-gray-900 mb-2 flex items-center">
              <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs mr-2">1</span>
              Get Credentials from Google
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
              <li>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center">Google Cloud Console <ExternalLink size={10} className="ml-1"/></a>.</li>
              <li>Create a new <strong>OAuth 2.0 Client ID</strong> (Web application).</li>
              <li>Add this <strong>Authorized redirect URI</strong>:
                <code className="block bg-gray-100 p-2 rounded mt-1 select-all font-mono text-xs border border-gray-200">
                  https://nahcbarqraonfygqelmg.supabase.co/auth/v1/callback
                </code>
              </li>
              <li>Copy the <strong>Client ID</strong> (ends in <code>.apps.googleusercontent.com</code>) and <strong>Client Secret</strong>.</li>
            </ol>
          </section>

          <section>
            <h4 className="font-bold text-gray-900 mb-2 flex items-center">
              <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs mr-2">2</span>
              Configure Supabase
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
              <li>Go to your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center">Supabase Dashboard <ExternalLink size={10} className="ml-1"/></a>.</li>
              <li>Navigate to <strong>Authentication</strong> &rarr; <strong>Providers</strong> &rarr; <strong>Google</strong>.</li>
              <li><strong>Enable</strong> Google provider.</li>
              <li>Paste the <strong>Client ID</strong> and <strong>Client Secret</strong> from step 1.</li>
              <li>Click <strong>Save</strong>.</li>
            </ol>
          </section>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            <strong>Tip:</strong> The Client ID should look like: 
            <code className="block mt-1 font-mono text-xs">123456789-abcdefghijkl.apps.googleusercontent.com</code>
            If yours looks like <code>Chinese.AD</code>, it is incorrect.
          </div>

          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-sm text-yellow-800 mt-4">
            <strong>Error: "localhost refused to connect"?</strong><br/>
            This means Supabase is redirecting to the wrong URL.
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Go to <strong>Authentication</strong> &rarr; <strong>URL Configuration</strong>.</li>
              <li>Add this URL to <strong>Redirect URLs</strong>:
                <code className="block bg-yellow-100 p-2 rounded mt-1 select-all font-mono text-xs border border-yellow-200 break-all">
                  {window.location.origin}
                </code>
              </li>
              <li>Click <strong>Save</strong>.</li>
            </ol>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-center space-x-4">
          <button 
            onClick={onClose}
            className="bg-gray-900 text-white font-bold px-6 py-2 rounded-xl hover:bg-gray-800 transition-colors"
          >
            I'll fix it in Supabase
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigHelp;
