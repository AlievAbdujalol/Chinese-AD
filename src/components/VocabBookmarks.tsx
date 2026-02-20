
import React, { useState, useEffect } from 'react';
import { playTextToSpeech } from '../services/gemini';
import { toggleVocabBookmark as toggleDbBookmark, getBookmarkedWords as fetchBookmarks } from '../services/db';
import { AppLanguage, HSKLevel, VocabCard } from '../types';
import { Volume2, RotateCw, Star, ArrowRight, ArrowLeft } from 'lucide-react';
import { translations } from '../utils/translations';
import { getLevelTheme } from '../utils/theme';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

const VocabBookmarks: React.FC<Props> = ({ language, level }) => {
  const [cards, setCards] = useState<VocabCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const t = translations[language].vocab;
  const theme = getLevelTheme(level);

  const loadBookmarks = async () => {
    setLoading(true);
    try {
      const data = await fetchBookmarks(level);
      setCards(data);
      if (currentIndex >= data.length && data.length > 0) {
        setCurrentIndex(0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookmarks();
  }, [level]);

  const playAudio = async (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await playTextToSpeech(text);
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  };

  const handleRemoveBookmark = async () => {
    if (!cards[currentIndex]) return;
    const currentCard = cards[currentIndex];
    await toggleDbBookmark(currentCard, level);
    
    // Refresh list locally
    const newCards = cards.filter((_, idx) => idx !== currentIndex);
    
    // Calculate new index before setting cards to avoid race condition where card is undefined in render
    let newIndex = currentIndex;
    if (currentIndex >= newCards.length) {
      newIndex = Math.max(0, newCards.length - 1);
    }
    
    setCurrentIndex(newIndex);
    setCards(newCards);
    setIsFlipped(false);
  };

  const nextCard = () => {
    if (currentIndex < cards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(c => c + 1), 150);
    }
  };

  const prevCard = () => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(c => c - 1), 150);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-gray-500">{t.loading}</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="bg-gray-100 p-6 rounded-full mb-4">
           <Star size={48} className="text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">{t.bookmarksTitle}</h2>
        <p className="text-gray-500 max-w-md">{t.noBookmarks}</p>
        <div className={`mt-4 ${theme.badge} inline-block px-3 py-1 rounded-full text-xs font-bold`}>
           {level}
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
         <h2 className="text-xl font-bold text-gray-800 flex items-center">
            <Star className="mr-2 text-yellow-500" fill="currentColor" size={20} />
            {t.bookmarksTitle}
         </h2>
         <span className={`px-3 py-1 rounded-full text-xs font-bold ${theme.badge}`}>
            {currentIndex + 1} / {cards.length}
         </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center perspective-1000">
         <div 
           onClick={() => setIsFlipped(!isFlipped)}
           className="relative w-full max-w-xl aspect-[4/5] md:aspect-[3/2] cursor-pointer group perspective-1000"
         >
           <div className={`relative w-full h-full duration-500 preserve-3d transition-all transform ${isFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
             
             {/* Front */}
             <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl border border-gray-200 flex flex-col items-center justify-center p-8 text-center" style={{ backfaceVisibility: 'hidden' }}>
                <div className="absolute top-4 left-4 z-50">
                   <button 
                     onClick={(e) => { e.stopPropagation(); handleRemoveBookmark(); }}
                     className="p-3 rounded-full text-yellow-400 bg-yellow-50 hover:bg-gray-100 transition-colors"
                     title={t.removeBookmark}
                   >
                     <Star size={24} fill="currentColor" />
                   </button>
                </div>

                <span className="text-gray-400 text-sm uppercase tracking-widest mb-4">Character</span>
                <h2 className="text-8xl font-bold text-gray-800 mb-8">{card.character}</h2>
                <div className="text-gray-400 text-sm mt-8 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                  <RotateCw size={14} className="mr-1" /> Tap to flip
                </div>
             </div>

             {/* Back */}
             <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-xl border-2 border-yellow-100 flex flex-col items-center justify-center p-6 text-center" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <div className="absolute top-4 right-4 z-50">
                  <button onClick={(e) => playAudio(card.character, e)} className="p-3 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors">
                    <Volume2 size={24} />
                  </button>
                </div>
                
                <h2 className="text-6xl font-bold text-gray-800 mb-1">{card.character}</h2>
                <h3 className="text-3xl font-bold text-red-600 mb-2">{card.pinyin}</h3>
                <p className="text-xl text-gray-800 font-medium mb-6">{card.translation}</p>
                
                <div className="w-full bg-gray-50 p-4 rounded-xl text-left">
                  <p className="text-lg text-gray-800 mb-1">{card.exampleSentence}</p>
                  {card.examplePinyin && <p className="text-md text-red-500 mb-1 font-medium">{card.examplePinyin}</p>}
                  <p className="text-sm text-gray-500 italic">{card.exampleTranslation}</p>
                </div>
             </div>
           </div>
         </div>
      </div>

      {/* Controls */}
      <div className="mt-8 max-w-xl mx-auto w-full grid grid-cols-2 gap-4">
        <button 
          onClick={prevCard}
          disabled={currentIndex === 0}
          className={`py-4 rounded-xl font-bold flex items-center justify-center transition-colors ${currentIndex === 0 ? 'bg-gray-100 text-gray-400' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'}`}
        >
          <ArrowLeft size={20} className="mr-2" /> Prev
        </button>
        <button 
          onClick={nextCard}
          disabled={currentIndex === cards.length - 1}
          className={`py-4 rounded-xl font-bold flex items-center justify-center transition-colors ${currentIndex === cards.length - 1 ? 'bg-gray-100 text-gray-400' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
        >
          Next <ArrowRight size={20} className="ml-2" />
        </button>
      </div>
    </div>
  );
};

export default VocabBookmarks;