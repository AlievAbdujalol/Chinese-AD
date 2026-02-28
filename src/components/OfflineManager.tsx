import React, { useState, useEffect } from 'react';
import { AppLanguage, HSKLevel } from '../types';
import { translations } from '../utils/translations';
import { getOfflineBatches, saveOfflineBatch, deleteOfflineBatch } from '../services/db';
import { generateVocabularyBatch, generateQuiz, generateMockExam } from '../services/gemini';
import { Download, Trash2, Wifi, WifiOff, CheckCircle, Loader, BookOpen, GraduationCap, FileText } from 'lucide-react';

interface Props {
  language: AppLanguage;
  level: HSKLevel;
}

const OfflineManager: React.FC<Props> = ({ language, level }) => {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    loadBatches();
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadBatches = async () => {
    const data = await getOfflineBatches();
    setBatches(data);
  };

  const handleDownload = async (type: 'vocab' | 'quiz' | 'exam') => {
    if (!isOnline) return;
    setDownloadingType(type);
    setLoading(true);

    try {
      let content;
      let title = '';
      
      if (type === 'vocab') {
        content = await generateVocabularyBatch(level, language);
        title = `${level} Vocabulary Batch`;
      } else if (type === 'quiz') {
        content = await generateQuiz('', level, language);
        title = `${level} Quiz`;
      } else if (type === 'exam') {
        content = await generateMockExam(level, language);
        title = `${level} Mock Exam`;
      }

      if (content) {
        await saveOfflineBatch(type, level, title, content);
        await loadBatches();
      }
    } catch (e) {
      console.error("Download failed", e);
      alert("Failed to download content. Please try again.");
    } finally {
      setLoading(false);
      setDownloadingType(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this download?")) {
      await deleteOfflineBatch(id);
      await loadBatches();
    }
  };

  const t = translations[language];

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-800">Offline Downloads</h2>
          <div className={`flex items-center px-3 py-1 rounded-full text-sm font-bold ${isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
            {isOnline ? <Wifi size={16} className="mr-2" /> : <WifiOff size={16} className="mr-2" />}
            {isOnline ? 'Online' : 'Offline Mode'}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Vocab Download Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <BookOpen size={24} />
            </div>
            <h3 className="font-bold text-gray-800 mb-2">Vocabulary</h3>
            <p className="text-sm text-gray-500 mb-4">Download a batch of 10 words for {level}.</p>
            <button
              onClick={() => handleDownload('vocab')}
              disabled={!isOnline || loading}
              className={`w-full py-2 rounded-lg font-bold flex items-center justify-center transition-colors ${!isOnline ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {downloadingType === 'vocab' ? <Loader size={18} className="animate-spin" /> : <Download size={18} className="mr-2" />}
              Download
            </button>
          </div>

          {/* Quiz Download Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mb-4">
              <GraduationCap size={24} />
            </div>
            <h3 className="font-bold text-gray-800 mb-2">Quiz</h3>
            <p className="text-sm text-gray-500 mb-4">Download a 5-question quiz for {level}.</p>
            <button
              onClick={() => handleDownload('quiz')}
              disabled={!isOnline || loading}
              className={`w-full py-2 rounded-lg font-bold flex items-center justify-center transition-colors ${!isOnline ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
            >
              {downloadingType === 'quiz' ? <Loader size={18} className="animate-spin" /> : <Download size={18} className="mr-2" />}
              Download
            </button>
          </div>

          {/* Exam Download Card */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <FileText size={24} />
            </div>
            <h3 className="font-bold text-gray-800 mb-2">Mock Exam</h3>
            <p className="text-sm text-gray-500 mb-4">Download a full mock exam for {level}.</p>
            <button
              onClick={() => handleDownload('exam')}
              disabled={!isOnline || loading}
              className={`w-full py-2 rounded-lg font-bold flex items-center justify-center transition-colors ${!isOnline ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
            >
              {downloadingType === 'exam' ? <Loader size={18} className="animate-spin" /> : <Download size={18} className="mr-2" />}
              Download
            </button>
          </div>
        </div>

        <h3 className="text-xl font-bold text-gray-800 mb-4">Downloaded Content</h3>
        
        {batches.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-100 text-gray-500">
            <Download size={48} className="mx-auto mb-4 opacity-20" />
            <p>No downloads yet. Connect to the internet to download content.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map((batch) => (
              <div key={batch.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${
                    batch.type === 'vocab' ? 'bg-blue-50 text-blue-600' :
                    batch.type === 'quiz' ? 'bg-purple-50 text-purple-600' :
                    'bg-red-50 text-red-600'
                  }`}>
                    {batch.type === 'vocab' ? <BookOpen size={20} /> :
                     batch.type === 'quiz' ? <GraduationCap size={20} /> :
                     <FileText size={20} />}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800">{batch.title}</h4>
                    <p className="text-xs text-gray-500">
                      {new Date(batch.timestamp).toLocaleDateString()} • {batch.level}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded-full flex items-center">
                    <CheckCircle size={12} className="mr-1" /> Ready
                  </span>
                  <button 
                    onClick={() => handleDelete(batch.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfflineManager;
