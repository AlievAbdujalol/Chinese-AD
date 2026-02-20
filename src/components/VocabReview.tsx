
import React, { useState, useEffect, useRef } from 'react';
import { generateVocabularyBatch, playTextToSpeech, getFriendlyErrorMessage } from '../services/gemini';
import { saveVocabProgress, toggleVocabBookmark, saveVocabCustomImage } from '../services/db';
import { AppLanguage, HSKLevel, VocabCard } from '../types';
import { RefreshCw, Volume2, RotateCw, BookOpen, Check, ThumbsUp, AlertTriangle, Smile, Star, AlertCircle, Eye, EyeOff, Camera, Upload, ImageIcon, ImagePlus } from 'lucide-react';
import { translations } from '../utils/translations';
import { getLevelTheme } from '../utils/theme';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

const VocabReview: React.FC<Props> = ({ language, level }) => {
  const [cards, setCards] = useState<VocabCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageProcessing, setImageProcessing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = translations[language].vocab;
  const theme = getLevelTheme(level);

  const loadCards = async () => {
    setLoading(true);
    setCards([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowExample(false);
    setCompleted(false);
    setError(null);
    try {
      const data = await generateVocabularyBatch(level, language);
      setCards(data);
    } catch (e) {
      console.error(e);
      setError(getFriendlyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const playAudio = async (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await playTextToSpeech(text);
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  };

  const handleRate = async (rating: 'hard' | 'good' | 'easy') => {
    if (!cards[currentIndex]) return;
    const currentCard = cards[currentIndex];
    await saveVocabProgress(currentCard, level, rating);

    if (currentIndex < cards.length - 1) {
      setIsFlipped(false);
      setShowExample(false);
      setTimeout(() => setCurrentIndex(c => c + 1), 150);
    } else {
      setCompleted(true);
    }
  };

  const toggleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cards[currentIndex]) return;
    const currentCard = cards[currentIndex];
    try {
      const newState = await toggleVocabBookmark(currentCard, level);
      const updatedCards = [...cards];
      updatedCards[currentIndex] = { ...currentCard, bookmarked: newState };
      setCards(updatedCards);
    } catch (e) {
      console.error("Failed to toggle bookmark", e);
    }
  };
  
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !cards[currentIndex]) return;
      
      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          // Determine mime type from file or default to jpeg if simpler
          const mimeType = file.type || 'image/jpeg';
          const fullDataUrl = `data:${mimeType};base64,${base64}`;

          setImageProcessing(true);
          try {
              // DIRECT SAVE - No AI Transformation
              const updatedCards = [...cards];
              updatedCards[currentIndex] = { ...updatedCards[currentIndex], customImage: fullDataUrl };
              setCards(updatedCards);
              
              await saveVocabCustomImage(updatedCards[currentIndex], fullDataUrl, level);
          } catch (err: any) {
              console.error("Failed to save image", err);
              setError("Failed to save photo. Please try again.");
              setTimeout(() => setError(null), 3000);
          } finally {
              setImageProcessing(false);
          }
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // Reset input
  };

  // Reset example visibility when flipping back to character
  useEffect(() => {
    if (!isFlipped) {
      setShowExample(false);
    }
  }, [isFlipped]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <RefreshCw className="animate-spin text-red-600 mb-4" size={40} />
        <p className="text-gray-600">{t.loading}</p>
      </div>
    );
  }

  if (cards.length === 0 && !completed) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-gray-100 text-center">
           <div className="mb-6 flex justify-center">
              <BookOpen size={64} className="text-red-500" />
           </div>
           <h2 className="text-2xl font-bold text-gray-800 mb-2">{t.title}</h2>
           <p className="text-gray-600 mb-6">{t.desc}</p>
           
           {error && (
             <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start text-left text-sm">
                <AlertCircle className="mr-2 flex-shrink-0 mt-0.5" size={16} />
                <span>{error}</span>
             </div>
           )}

           <div className={`${theme.badge} rounded-lg p-3 mb-6 inline-block px-6 font-bold`}>
             {level}
           </div>
           <button 
             onClick={loadCards}
             className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors"
           >
             {t.generate}
           </button>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-sm w-full animate-fade-in">
           <div className="mb-4 flex justify-center text-green-500">
             <Check size={64} />
           </div>
           <h2 className="text-3xl font-bold text-gray-800 mb-6">{t.complete}</h2>
           <button 
             onClick={loadCards}
             className="w-full bg-gray-900 text-white py-3 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center"
           >
             <RefreshCw size={20} className="mr-2" /> {t.generate}
           </button>
        </div>
      </div>
    );
  }

  const card = cards[currentIndex];
  
  // Guard against render race conditions where card is undefined
  if (!card) return null;

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50 overflow-hidden">
      <div className="flex justify-between items-center mb-6 max-w-xl mx-auto w-full">
         <span className="text-gray-500 font-bold">{currentIndex + 1} / {cards.length}</span>
         <span className={`px-3 py-1 rounded-full text-xs font-bold ${theme.badge}`}>{level}</span>
      </div>
      
      {error && (
          <div className="max-w-xl mx-auto w-full mb-4 bg-red-50 text-red-600 p-3 rounded-xl text-sm text-center border border-red-100 animate-fade-in">
              {error}
          </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center perspective-1000">
         <div 
           onClick={() => setIsFlipped(!isFlipped)}
           className="relative w-full max-w-xl aspect-[4/5] md:aspect-[3/2] cursor-pointer group perspective-1000 transition-transform duration-200 active:scale-95"
         >
           <div className={`relative w-full h-full duration-500 preserve-3d transition-all transform ${isFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
             
             {/* Front */}
             <div 
                className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl border border-gray-200 p-3" 
                style={{ backfaceVisibility: 'hidden' }}
             >
                {/* Dashed Border Container inside the main card */}
                <div className="w-full h-full border-2 border-dashed border-blue-400/50 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden bg-blue-50/20">
                    
                    {/* Background Image Layer */}
                    {card.customImage && (
                        <div className="absolute inset-0 z-0">
                            <img 
                                src={card.customImage} 
                                alt="User Upload" 
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-white/30"></div>
                        </div>
                    )}
                    
                    {/* Content Layer */}
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-6">
                        {/* Top Left: Bookmark (Swapped) */}
                        <div className="absolute top-4 left-4 z-50">
                           <button 
                             onClick={toggleBookmark}
                             className={`p-3 rounded-full transition-colors ${card.bookmarked ? 'text-yellow-400 bg-yellow-50 shadow-sm' : 'text-gray-300 hover:text-yellow-400'}`}
                           >
                             <Star size={24} fill={card.bookmarked ? "currentColor" : "none"} />
                           </button>
                        </div>

                        {/* Top Right: Audio (Swapped) */}
                        <div className="absolute top-4 right-4 z-50">
                          <button 
                            onClick={(e) => playAudio(card.character, e)} 
                            className="p-3 bg-white/90 text-red-600 rounded-full hover:bg-white transition-colors hover:scale-110 active:scale-90 shadow-sm backdrop-blur-sm border border-red-100"
                          >
                            <Volume2 size={24} />
                          </button>
                        </div>

                        <span className="text-gray-500 text-sm uppercase tracking-widest mb-4 font-bold drop-shadow-sm">Character</span>
                        <h2 className="text-8xl font-bold text-gray-800 mb-6 drop-shadow-sm">{card.character}</h2>
                        
                        {/* Example Sentence Toggle on Front */}
                        <div className="w-full relative z-50 px-4 transition-all duration-300 min-h-[40px] flex justify-center">
                            {showExample ? (
                                <div className="w-full bg-white/95 backdrop-blur-md p-4 rounded-xl text-left animate-fade-in border border-gray-200 shadow-md">
                                    <p className="text-lg text-gray-800 mb-1 leading-tight">{card.exampleSentence}</p>
                                    {card.examplePinyin && <p className="text-md text-red-500 mb-1 font-medium">{card.examplePinyin}</p>}
                                    <p className="text-sm text-gray-500 italic leading-tight">{card.exampleTranslation}</p>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setShowExample(false); }}
                                        className="mt-2 text-xs text-gray-400 hover:text-red-500 flex items-center"
                                    >
                                        <EyeOff size={12} className="mr-1" /> Hide example
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setShowExample(true); }}
                                    className="py-2 px-4 rounded-full bg-white/80 text-gray-600 hover:bg-white transition-colors flex items-center text-sm font-medium border border-gray-200 shadow-sm backdrop-blur-sm"
                                >
                                    <Eye size={16} className="mr-2 text-blue-500" />
                                    Show Example Sentence
                                </button>
                            )}
                        </div>
                        
                        {/* Photo Upload Controls */}
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center pb-0 z-50">
                             <input 
                               type="file" 
                               ref={fileInputRef} 
                               className="hidden" 
                               accept="image/*" 
                               onChange={handlePhotoUpload} 
                             />
                             <button 
                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                disabled={imageProcessing}
                                className="flex items-center space-x-2 bg-gray-100/90 text-gray-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-white hover:text-blue-600 backdrop-blur-sm transition-all border border-gray-200 shadow-sm"
                             >
                                {imageProcessing ? (
                                    <>
                                      <RefreshCw size={12} className="animate-spin" />
                                      <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                      <ImagePlus size={14} />
                                      <span>Upload Photo</span>
                                    </>
                                )}
                             </button>
                        </div>
                    </div>
                </div>
             </div>

             {/* Back */}
             <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl border-2 border-red-100 flex flex-col items-center justify-center p-6 text-center overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <div className="absolute top-4 left-4 z-50">
                  <button 
                    onClick={(e) => playAudio(card.character, e)} 
                    className="p-3 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors hover:scale-110 active:scale-90 shadow-sm"
                  >
                    <Volume2 size={24} />
                  </button>
                </div>
                <div className="absolute top-4 right-4 z-50">
                   <button 
                     onClick={toggleBookmark}
                     className={`p-3 rounded-full transition-colors ${card.bookmarked ? 'text-yellow-400 bg-yellow-50' : 'text-gray-300 hover:text-yellow-400'}`}
                   >
                     <Star size={24} fill={card.bookmarked ? "currentColor" : "none"} />
                   </button>
                </div>
                
                <h2 className="text-6xl font-bold text-gray-800 mb-1">{card.character}</h2>
                <h3 className="text-3xl font-bold text-red-600 mb-2">{card.pinyin}</h3>
                <p className="text-xl text-gray-800 font-medium mb-4">{card.translation}</p>
                
                <div className="w-full transition-all duration-300 relative z-50">
                  {showExample ? (
                    <div className="w-full bg-gray-50 p-4 rounded-xl text-left animate-fade-in border border-gray-100">
                      <p className="text-lg text-gray-800 mb-1 leading-tight">{card.exampleSentence}</p>
                      {card.examplePinyin && <p className="text-md text-red-500 mb-1 font-medium">{card.examplePinyin}</p>}
                      <p className="text-sm text-gray-500 italic leading-tight">{card.exampleTranslation}</p>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowExample(false); }}
                        className="mt-2 text-xs text-gray-400 hover:text-red-500 flex items-center"
                      >
                         <EyeOff size={12} className="mr-1" /> Hide example
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowExample(true); }}
                      className="py-2 px-4 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex items-center text-sm font-medium border border-gray-200"
                    >
                      <Eye size={16} className="mr-2 text-blue-500" />
                      Show Example Sentence
                    </button>
                  )}
                </div>
             </div>
           </div>
         </div>
      </div>

      {/* Controls */}
      <div className="mt-8 max-w-xl mx-auto w-full h-24">
         {!isFlipped ? (
           <button 
             onClick={() => setIsFlipped(true)}
             className="w-full py-4 rounded-xl font-bold bg-gray-900 text-white hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center"
           >
             <RotateCw size={20} className="mr-2" /> {t.flip}
           </button>
         ) : (
           <div className="grid grid-cols-3 gap-4 animate-fade-in">
             <button 
               onClick={() => handleRate('hard')}
               className="py-4 rounded-xl font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center justify-center shadow-sm"
             >
               <AlertTriangle size={20} className="mb-1" />
               {t.hard}
             </button>
             <button 
               onClick={() => handleRate('good')}
               className="py-4 rounded-xl font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center justify-center shadow-sm"
             >
               <ThumbsUp size={20} className="mb-1" />
               {t.good}
             </button>
             <button 
               onClick={() => handleRate('easy')}
               className="py-4 rounded-xl font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center justify-center shadow-sm"
             >
               <Smile size={20} className="mb-1" />
               {t.easy}
             </button>
           </div>
         )}
      </div>
    </div>
  );
};

export default VocabReview;
