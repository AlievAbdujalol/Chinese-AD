import React from 'react';
import { X, Cloud, ExternalLink, Server, Database, Globe } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const DeployGuide: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-xl font-bold text-gray-900 flex items-center">
            <Cloud className="mr-2 text-blue-500" size={24} />
            How to Deploy for Free
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={24} className="text-gray-400" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8 text-gray-700">
          
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 flex items-start">
             <Globe className="shrink-0 mr-3 mt-0.5" size={18} />
             <div>
                <strong>Good News!</strong> Your backend (Supabase) is already in the cloud. You only need to deploy the frontend (this website).
             </div>
          </div>

          <section>
            <h4 className="font-bold text-gray-900 mb-4 flex items-center text-lg">
              <span className="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm mr-3">1</span>
              Export Code
            </h4>
            <p className="mb-2">First, you need to get the code out of this AI Studio preview.</p>
            <ul className="list-disc list-inside ml-4 space-y-1 text-sm">
               <li>Click the <strong>Export</strong> or <strong>Download</strong> button in the AI Studio interface.</li>
               <li>Or simply copy the files to your local machine.</li>
            </ul>
          </section>

          <section>
            <h4 className="font-bold text-gray-900 mb-4 flex items-center text-lg">
              <span className="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm mr-3">2</span>
              Deploy Frontend (Vercel)
            </h4>
            <p className="mb-2">Vercel is the easiest way to host React/Vite apps for free.</p>
            <ol className="list-decimal list-inside ml-4 space-y-2 text-sm">
               <li>Push your downloaded code to a <strong>GitHub</strong> repository.</li>
               <li>Go to <a href="https://vercel.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center">vercel.com <ExternalLink size={10} className="ml-1"/></a> and sign up.</li>
               <li>Click <strong>Add New Project</strong> and import your GitHub repo.</li>
               <li>
                  <strong>Crucial Step:</strong> In the "Environment Variables" section, add:
                  <div className="bg-gray-100 p-3 rounded-lg mt-2 font-mono text-xs border border-gray-200">
                     VITE_SUPABASE_URL = {import.meta.env.VITE_SUPABASE_URL}<br/>
                     VITE_SUPABASE_ANON_KEY = (Your Supabase Anon Key)
                  </div>
               </li>
               <li>Click <strong>Deploy</strong>. You will get a URL like <code>https://my-app.vercel.app</code>.</li>
            </ol>
          </section>

          <section>
            <h4 className="font-bold text-gray-900 mb-4 flex items-center text-lg">
              <span className="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm mr-3">3</span>
              Update Supabase
            </h4>
            <p className="mb-2">Tell Supabase about your new Vercel URL so logins work.</p>
            <ol className="list-decimal list-inside ml-4 space-y-2 text-sm">
               <li>Go to your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center">Supabase Dashboard <ExternalLink size={10} className="ml-1"/></a>.</li>
               <li>Navigate to <strong>Authentication</strong> &rarr; <strong>URL Configuration</strong>.</li>
               <li>Change <strong>Site URL</strong> to your new Vercel URL.</li>
               <li>Add your Vercel URL to <strong>Redirect URLs</strong>.</li>
               <li>Click <strong>Save</strong>.</li>
            </ol>
          </section>

          <section>
             <h4 className="font-bold text-gray-900 mb-4 flex items-center text-lg">
              <span className="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm mr-3">4</span>
              Google Login (Optional)
            </h4>
            <p className="mb-2 text-sm">If you use Google Login, update the <strong>Authorized JavaScript origins</strong> in Google Cloud Console to include your new Vercel URL.</p>
          </section>

        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
          <button 
            onClick={onClose}
            className="bg-gray-900 text-white font-bold px-8 py-3 rounded-xl hover:bg-gray-800 transition-colors"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeployGuide;
