import React, { useState, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import { RefreshCw, Volume2, StopCircle, Mic, History, X } from 'lucide-react';
import { TutorContext } from '../contexts/TutorContext';

export const ChineseWord: React.FC<{ text: string }> = ({ text }) => {
  const { activeWordRecording, handleWordRecord, playAudio, evaluationResult, setEvaluationResult, showWordHistory } = useContext(TutorContext);
  const [loadingAudio, setLoadingAudio] = useState(false);
  
  const isRecording = activeWordRecording === text;
  const hasFeedback = evaluationResult?.text === text;

  const play = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loadingAudio) return;
    setLoadingAudio(true);
    await playAudio(text);
    setLoadingAudio(false);
  };

  const toggleRecord = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasFeedback) {
        setEvaluationResult(null);
    }
    handleWordRecord(text);
  };

  const openHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    showWordHistory(text);
  };

  return (
    <span className="relative inline-flex items-center mx-0.5 group whitespace-nowrap bg-gray-50 rounded px-1 border border-gray-100">
      <span 
        className="cursor-pointer hover:underline decoration-dotted decoration-2 underline-offset-4 transition-all text-gray-800 font-medium" 
        onClick={play}
        title="Click to pronounce"
      >
        {text}
      </span>
      <span className="flex items-center ml-1 space-x-0.5">
          <button 
            onClick={play}
            className={`p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors ${loadingAudio ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
            title="Listen"
          >
            {loadingAudio ? (
              <RefreshCw size={10} className="animate-spin" />
            ) : (
              <Volume2 size={12} fill="currentColor" />
            )}
          </button>
          <button 
            onClick={toggleRecord}
            className={`p-1 rounded-full transition-colors ${isRecording ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-gray-200 text-gray-400 hover:text-red-500 opacity-40 group-hover:opacity-100'}`}
            title="Practice Pronunciation"
          >
            {isRecording ? (
               <StopCircle size={12} fill="currentColor" />
            ) : (
               <Mic size={12} />
            )}
          </button>
          <button 
            onClick={openHistory}
            className="p-1 rounded-full hover:bg-gray-200 text-gray-400 hover:text-blue-500 opacity-40 group-hover:opacity-100 transition-colors"
            title="View History"
          >
             <History size={12} />
          </button>
      </span>

      {hasFeedback && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 z-[60] animate-fade-in pointer-events-auto block">
            <span className="bg-white rounded-xl shadow-2xl border border-blue-100 p-4 relative block">
                <button 
                    onClick={(e) => { e.stopPropagation(); setEvaluationResult(null); }}
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                >
                    <X size={14} />
                </button>
                <span className="prose prose-sm text-gray-800 block">
                    <ReactMarkdown components={{
                        p: ({node, ...props}) => <span className="block mb-2" {...props} />
                    }}>{evaluationResult.feedback}</ReactMarkdown>
                </span>
                <span className="absolute top-full left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-blue-100 rotate-45 -mt-1.5 block"></span>
            </span>
        </span>
      )}
    </span>
  );
};
