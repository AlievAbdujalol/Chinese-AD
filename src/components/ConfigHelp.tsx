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
              Configure Firebase Authentication
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
              <li>Go to your <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center">Firebase Console <ExternalLink size={10} className="ml-1"/></a>.</li>
              <li>Navigate to <strong>Authentication</strong> &rarr; <strong>Sign-in method</strong>.</li>
              <li><strong>Enable</strong> Google provider.</li>
              <li><strong>Enable</strong> Email/Password provider.</li>
              <li>Click <strong>Save</strong>.</li>
            </ol>
          </section>

          <section>
            <h4 className="font-bold text-gray-900 mb-2 flex items-center">
              <span className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs mr-2">2</span>
              Configure Firebase Firestore
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
              <li>Navigate to <strong>Firestore Database</strong>.</li>
              <li>Click <strong>Create database</strong>.</li>
              <li>Start in <strong>production mode</strong> or <strong>test mode</strong>.</li>
              <li>Set up your security rules to allow authenticated users to read/write their own data.</li>
            </ol>
          </section>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
            <strong>Tip:</strong> The Client ID should look like: 
            <code className="block mt-1 font-mono text-xs">123456789-abcdefghijkl.apps.googleusercontent.com</code>
            If yours looks like <code>Chinese.AD</code>, it is incorrect.
          </div>

          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-sm text-yellow-800 mt-4">
            <strong>Error: "auth/unauthorized-domain"?</strong><br/>
            This means Firebase doesn't recognize your app's domain.
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Go to <strong>Authentication</strong> &rarr; <strong>Settings</strong> &rarr; <strong>Authorized domains</strong>.</li>
              <li>Add this domain:
                <code className="block bg-yellow-100 p-2 rounded mt-1 select-all font-mono text-xs border border-yellow-200 break-all">
                  {window.location.hostname}
                </code>
              </li>
              <li>Click <strong>Add</strong>.</li>
            </ol>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-center space-x-4">
          <button 
            onClick={onClose}
            className="bg-gray-900 text-white font-bold px-6 py-2 rounded-xl hover:bg-gray-800 transition-colors"
          >
            I'll fix it in Firebase
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigHelp;
