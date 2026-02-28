import React, { useState, useEffect } from 'react';
import { getAllLearnedWords } from '../services/db';
import { VocabCard, AppLanguage } from '../types';
import { X, Search, Volume2 } from 'lucide-react';
import { playTextToSpeech } from '../services/gemini';

interface Props {
  onClose: () => void;
  language: AppLanguage;
}

const LearnedWordsList: React.FC<Props> = ({ onClose, language }) => {
  const [words, setWords] = useState<VocabCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      const data = await getAllLearnedWords();
      // Sort by most recently reviewed
      data.sort((a: any, b: any) => (b.lastReviewed || 0) - (a.lastReviewed || 0));
      setWords(data);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = words.filter(w => 
    w.character.includes(search) || 
    w.pinyin.toLowerCase().includes(search.toLowerCase()) || 
    w.translation.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-scale-in">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-gray-800">Learned Words ({words.length})</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Search words..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading your vocabulary...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {search ? 'No matching words found.' : 'No words learned yet. Start reviewing vocabulary!'}
            </div>
          ) : (
            filtered.map((w, i) => (
              <div key={i} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl border border-gray-100 transition-colors group">
                <div>
                  <div className="flex items-baseline space-x-3">
                    <span className="text-2xl font-bold text-gray-800">{w.character}</span>
                    <span className="text-base text-red-500 font-medium">{w.pinyin}</span>
                    {w.level && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{w.level}</span>}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">{w.translation}</div>
                </div>
                <button 
                  onClick={() => playTextToSpeech(w.character)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Play Audio"
                >
                  <Volume2 size={20} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default LearnedWordsList;
