
import React, { useState, useRef, useEffect } from 'react';
import { generateVisualAid, getFriendlyErrorMessage } from '../services/gemini';
import { Image as ImageIcon, Download, RefreshCw, AlertCircle, Wand2, Upload, X, Sparkles, Save, BookOpen, Palette, Bookmark } from 'lucide-react';
import { AppLanguage } from '../types';
import { translations } from '../utils/translations';

interface Props {
  language?: AppLanguage;
}

const ImageGen: React.FC<Props> = ({ language = AppLanguage.EN }) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [image, setImage] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateCategory, setTemplateCategory] = useState<'styles' | 'learning' | 'saved'>('styles');
  const [customTemplates, setCustomTemplates] = useState<{label: string, prompt: string}[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = translations[language].visuals;

  useEffect(() => {
    const saved = localStorage.getItem('hsk_custom_img_prompts');
    if (saved) {
      try {
        setCustomTemplates(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const STYLE_TEMPLATES = [
    { label: 'Forbidden City', prompt: 'A photorealistic shot of this person standing in front of the Forbidden City in Beijing, China. Sunny day, majestic architecture.' },
    { label: 'Cyberpunk Shanghai', prompt: 'Cyberpunk style portrait in a futuristic Shanghai street at night, neon lights, rain, high tech.' },
    { label: 'Traditional Hanfu', prompt: 'Wearing elegant traditional Chinese Hanfu clothing, in a classical Chinese garden, soft lighting, ethereal style.' },
    { label: 'Ink Painting', prompt: 'Traditional Chinese ink wash painting style (Shuimo), artistic, mountains and clouds background.' },
  ];

  const LEARNING_TEMPLATES = [
    { label: 'Character Breakdown', prompt: 'An educational illustration decomposing the Chinese character "..." into its radical and phonetic components, showing stroke order clearly.' },
    { label: 'Visual Mnemonic', prompt: 'A creative and memorable image that visualizes the meaning of the Chinese word "...", designed to help a student remember it.' },
    { label: 'Context Scene', prompt: 'A realistic everyday scene in China showing the usage of the object/concept "...", with the object highlighted.' },
    { label: 'Story Card', prompt: 'A single panel comic style illustration depicting a simple story involving "...", suitable for HSK learners.' },
  ];

  const getCurrentTemplates = () => {
    switch (templateCategory) {
      case 'learning': return LEARNING_TEMPLATES;
      case 'saved': return customTemplates;
      default: return STYLE_TEMPLATES;
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = ''; // Reset input
  };

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
      // Pass the selected image (base64) without prefix if present
      const imageBase64 = selectedImage ? selectedImage.split(',')[1] : undefined;
      const result = await generateVisualAid(prompt, aspectRatio, imageBase64);
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

  const applyTemplate = (templatePrompt: string) => {
    setPrompt(templatePrompt);
  };

  const savePrompt = () => {
    if (!prompt.trim()) return;
    const label = prompt.length > 15 ? prompt.slice(0, 15) + '...' : prompt;
    const newTpl = { label, prompt };
    const updated = [...customTemplates, newTpl];
    setCustomTemplates(updated);
    localStorage.setItem('hsk_custom_img_prompts', JSON.stringify(updated));
    setTemplateCategory('saved');
  };

  const deleteSaved = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customTemplates.filter((_, i) => i !== idx);
    setCustomTemplates(updated);
    localStorage.setItem('hsk_custom_img_prompts', JSON.stringify(updated));
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
             <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t.promptPlace}
                  rows={3}
                  className="w-full bg-white text-gray-900 border border-gray-200 rounded-2xl p-4 pr-12 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent placeholder-gray-400 resize-none transition-all shadow-sm hover:border-gray-300"
                />
                {prompt && (
                  <button 
                    onClick={savePrompt}
                    title={t.savePrompt}
                    className="absolute top-3 right-3 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Save size={18} />
                  </button>
                )}
             </div>
             
             {/* Templates Section */}
             <div className="mt-4">
                 <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center ml-1">
                        <Sparkles size={12} className="mr-1" /> {t.templates}
                    </p>
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                        <button 
                          onClick={() => setTemplateCategory('styles')}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${templateCategory === 'styles' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                           {t.style || 'Styles'}
                        </button>
                        <button 
                          onClick={() => setTemplateCategory('learning')}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${templateCategory === 'learning' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                           {t.learning || 'Learning'}
                        </button>
                        <button 
                          onClick={() => setTemplateCategory('saved')}
                          className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${templateCategory === 'saved' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                           {t.saved || 'Saved'}
                        </button>
                    </div>
                 </div>
                 
                 <div className="flex flex-wrap gap-2">
                     {getCurrentTemplates().length > 0 ? getCurrentTemplates().map((tpl, idx) => (
                         <div key={idx} className="relative group">
                            <button
                                onClick={() => applyTemplate(tpl.prompt)}
                                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors border flex items-center
                                  ${templateCategory === 'learning' ? 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100' : 
                                    templateCategory === 'saved' ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100' :
                                    'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'}`}
                            >
                                {templateCategory === 'learning' && <BookOpen size={10} className="mr-1.5" />}
                                {templateCategory === 'styles' && <Palette size={10} className="mr-1.5" />}
                                {templateCategory === 'saved' && <Bookmark size={10} className="mr-1.5" />}
                                {tpl.label}
                            </button>
                            {templateCategory === 'saved' && (
                                <button 
                                  onClick={(e) => deleteSaved(idx, e)}
                                  className="absolute -top-1 -right-1 bg-gray-200 text-gray-600 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                                >
                                    <X size={10} />
                                </button>
                            )}
                         </div>
                     )) : (
                         <div className="text-sm text-gray-400 italic px-2">
                            {templateCategory === 'saved' ? "No saved prompts yet. Type a prompt and click the save icon." : "No templates available."}
                         </div>
                     )}
                 </div>
             </div>
           </div>
           
           {/* Image Upload Section */}
           <div>
               <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">{t.uploadLabel || "Reference Image"}</label>
               {selectedImage ? (
                   <div className="relative w-full h-40 bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 group">
                       <img src={selectedImage} alt="Reference" className="w-full h-full object-contain p-2" />
                       <button
                           onClick={() => setSelectedImage(null)}
                           className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors backdrop-blur-sm"
                       >
                           <X size={16} />
                       </button>
                   </div>
               ) : (
                    <button
                       onClick={() => fileInputRef.current?.click()}
                       className="w-full h-24 border-2 border-dashed border-blue-300 bg-blue-50/30 rounded-2xl flex flex-col items-center justify-center text-gray-500 hover:border-red-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                       <Upload size={24} className="mb-1 text-blue-400" />
                       <span className="text-sm font-medium">{t.uploadLabel || "Upload Image"}</span>
                    </button>
               )}
               <input
                   type="file"
                   ref={fileInputRef}
                   className="hidden"
                   accept="image/*"
                   onChange={handleImageSelect}
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
