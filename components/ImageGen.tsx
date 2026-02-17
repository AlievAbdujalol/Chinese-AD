
import React, { useState } from 'react';
import { generateVisualAid, getFriendlyErrorMessage } from '../services/gemini';
import { Image as ImageIcon, Download, RefreshCw, AlertCircle, Wand2 } from 'lucide-react';
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
            await (window as any).aistudio.openSelectKey();
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
    <div className="h-full p-8 flex flex-col items-center overflow-y-auto bg-gray-50">
      <div className="max-w-2xl w-full bg-white p-8 rounded-3xl shadow-lg border border-gray-100">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4">
             <ImageIcon size={32} />
          </div>
          <h2 className="text-3xl font-bold text-gray-800">
            {t.title}
          </h2>
          <p className="text-gray-500 mt-2 max-w-md">{t.desc}</p>
        </div>
        
        {error && (
             <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 flex items-start text-left text-sm animate-fade-in">
                <AlertCircle className="mr-2 flex-shrink-0 mt-0.5" size={16} />
                <span>{error}</span>
             </div>
        )}

        <div className="space-y-6">
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">{t.promptLabel}</label>
             <textarea
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               placeholder={t.promptPlace}
               rows={3}
               className="w-full bg-white text-gray-900 border border-gray-200 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-gray-400 resize-none transition-all shadow-sm hover:border-gray-300"
             />
           </div>

           <div>
             <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">{t.ratioLabel}</label>
             <div className="grid grid-cols-3 gap-3">
               {['1:1', '16:9', '9:16'].map((ratio) => (
                 <button
                   key={ratio}
                   onClick={() => setAspectRatio(ratio)}
                   className={`py-2 px-4 rounded-xl border-2 font-medium text-sm transition-all ${
                     aspectRatio === ratio 
                       ? 'border-red-500 bg-red-50 text-red-700' 
                       : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                   }`}
                 >
                   {ratio}
                 </button>
               ))}
             </div>
           </div>

           <button 
             onClick={handleGenerate}
             disabled={loading || !prompt}
             className={`w-full py-4 rounded-xl font-bold text-white transition-all shadow-lg flex items-center justify-center ${
               loading || !prompt 
                 ? 'bg-gray-300 shadow-none cursor-not-allowed' 
                 : 'bg-red-600 hover:bg-red-700 hover:shadow-red-200 hover:-translate-y-0.5 active:translate-y-0'
             }`}
           >
             {loading ? (
               <RefreshCw className="animate-spin mr-2" size={20} />
             ) : (
               <Wand2 className="mr-2" size={20} />
             )}
             {loading ? t.dreaming : t.generate}
           </button>
        </div>
      </div>

      {image && (
        <div className="mt-8 max-w-2xl w-full bg-white p-6 rounded-3xl shadow-xl border border-gray-100 flex flex-col items-center animate-fade-in">
           <div className="relative rounded-2xl overflow-hidden shadow-sm mb-6 bg-gray-50 border border-gray-100">
             <img src={image} alt="Generated visual aid" className="max-h-[500px] w-auto object-contain" />
           </div>
           <a 
             href={image} 
             download={`hsk-visual-${Date.now()}.png`}
             className="flex items-center justify-center w-full py-4 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 shadow-lg hover:shadow-red-200 transition-all transform hover:-translate-y-0.5"
           >
             <Download size={20} className="mr-2" /> {t.download}
           </a>
        </div>
      )}
    </div>
  );
};

export default ImageGen;
