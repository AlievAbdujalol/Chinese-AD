import React, { useState } from 'react';
import { generateVisualAid, getFriendlyErrorMessage } from '../services/gemini';
import { ImageIcon, Download, RefreshCw, Key, AlertCircle } from 'lucide-react';
import { AppLanguage } from '../types';
import { translations } from '../utils/translations';

interface Props {
  language?: AppLanguage;
}

const ImageGen: React.FC<Props> = ({ language = AppLanguage.EN }) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const t = translations[language].visuals;

  const handleGenerate = async () => {
    if (!prompt) return;
    setError(null);

    // Check for API Key selection (required for gemini-3-pro-image-preview)
    if ((window as any).aistudio) {
       try {
         const hasKey = await (window as any).aistudio.hasSelectedApiKey();
         if (!hasKey) {
            const success = await (window as any).aistudio.openSelectKey();
            // Proceed immediately, assuming success as per guidelines for race condition
         }
       } catch (e) {
         console.warn("AI Studio key check failed", e);
       }
    }

    setLoading(true);
    setImage(null);
    try {
      const result = await generateVisualAid(prompt, aspectRatio);
      setImage(result);
    } catch (e: any) {
      if (e.toString().includes("403") || e.toString().includes("PERMISSION_DENIED")) {
         setError("Please select a paid API Key project to use high-quality image generation.");
         if ((window as any).aistudio) {
            (window as any).aistudio.openSelectKey();
         }
      } else {
         setError(getFriendlyErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full p-8 flex flex-col items-center overflow-y-auto">
      <div className="max-w-2xl w-full bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold flex items-center">
            <ImageIcon className="mr-2 text-red-600" /> 
            {t.title}
          </h2>
        </div>
        
        <p className="text-gray-600 mb-6">{t.desc}</p>
        
        {error && (
             <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start text-left text-sm">
                <AlertCircle className="mr-2 flex-shrink-0 mt-0.5" size={16} />
                <span>{error}</span>
             </div>
        )}

        <div className="space-y-4">
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">{t.promptLabel}</label>
             <textarea
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               placeholder={t.promptPlace}
               rows={4}
               className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-400 resize-none transition-colors"
             />
           </div>

           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">{t.ratioLabel}</label>
             <select 
               value={aspectRatio}
               onChange={(e) => setAspectRatio(e.target.value)}
               className="w-full border border-gray-300 rounded-lg p-3 bg-white"
             >
               <option value="1:1">Square (1:1)</option>
               <option value="16:9">Landscape (16:9)</option>
               <option value="9:16">Portrait (9:16)</option>
               <option value="4:3">Standard (4:3)</option>
               <option value="3:4">Portrait Standard (3:4)</option>
             </select>
           </div>

           <button 
             onClick={handleGenerate}
             disabled={loading || !prompt}
             className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${loading || !prompt ? 'bg-gray-300' : 'bg-red-600 hover:bg-red-700'}`}
           >
             {loading ? t.dreaming : t.generate}
           </button>
        </div>
      </div>

      {image && (
        <div className="mt-8 max-w-2xl w-full bg-white p-4 rounded-2xl shadow-lg border border-gray-100 flex flex-col items-center animate-fade-in">
           <img src={image} alt="Generated visual aid" className="rounded-lg max-h-[500px] w-auto object-contain shadow-sm mb-4" />
           <a 
             href={image} 
             download={`hsk-visual-${Date.now()}.png`}
             className="flex items-center text-red-600 font-medium hover:text-red-700"
           >
             <Download size={20} className="mr-2" /> {t.download}
           </a>
        </div>
      )}
    </div>
  );
};

export default ImageGen;