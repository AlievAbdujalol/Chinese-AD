import React from 'react';
import { CheckCircle, AlertCircle, Volume2, Mic } from 'lucide-react';
import { playTextToSpeech } from '../services/gemini';
import ReactMarkdown from 'react-markdown';

interface Props {
  feedbackText: string;
  onRetry?: () => void;
}

export const PronunciationFeedback: React.FC<Props> = ({ feedbackText, onRetry }) => {
  const scoreMatch = feedbackText.match(/\*\*Score\*\*:\s*(\d+)/);
  const heardMatch = feedbackText.match(/\*\*Heard\*\*:\s*(.*)/);
  const pinyinMatch = feedbackText.match(/\*\*Pinyin\*\*:\s*(.*)/);
  // Improved regex to capture feedback until end of string or next section (though usually feedback is last)
  const feedbackMatch = feedbackText.match(/\*\*Feedback\*\*:\s*([\s\S]*)/);

  const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;
  const heard = heardMatch ? heardMatch[1].trim() : '?';
  const pinyin = pinyinMatch ? pinyinMatch[1].trim() : '?';
  const feedback = feedbackMatch ? feedbackMatch[1].trim() : feedbackText;

  // Highlight tones in pinyin (simple heuristic for visual flair)
  const formatPinyin = (text: string) => {
    return text.split(' ').map((part, i) => (
      <span key={i} className="inline-block mx-0.5">
        {part}
      </span>
    ));
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm my-2 w-full max-w-md">
      <div className="flex items-center justify-between mb-3 border-b border-gray-50 pb-2">
        <h4 className="font-bold text-gray-700 text-sm uppercase tracking-wider flex items-center">
            <Mic size={14} className="mr-1.5 text-blue-500" />
            Pronunciation Analysis
        </h4>
        <div className={`px-2 py-0.5 rounded-full text-xs font-bold flex items-center ${
            score >= 8 ? 'bg-green-100 text-green-700' : 
            score >= 5 ? 'bg-yellow-100 text-yellow-700' : 
            'bg-red-100 text-red-700'
        }`}>
            {score >= 8 ? <CheckCircle size={12} className="mr-1" /> : <AlertCircle size={12} className="mr-1" />}
            Score: {score}/10
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-50 p-2 rounded-lg text-center flex flex-col justify-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">AI Heard</p>
            <p className="text-xl font-bold text-gray-800">{heard}</p>
        </div>
        <div 
            className="bg-blue-50 p-2 rounded-lg text-center relative group cursor-pointer hover:bg-blue-100 transition-colors flex flex-col justify-center" 
            onClick={() => playTextToSpeech(heard)}
            title="Listen to what AI heard"
        >
            <p className="text-[10px] text-blue-400 font-bold uppercase mb-1">Pinyin</p>
            <p className="text-lg font-medium text-blue-700 font-mono">{formatPinyin(pinyin)}</p>
            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Volume2 size={12} className="text-blue-500" />
            </div>
        </div>
      </div>

      <div className="text-sm text-gray-600 leading-relaxed bg-gray-50/50 p-3 rounded-lg border border-gray-100 prose prose-sm max-w-none">
        <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Feedback</p>
        <ReactMarkdown>{feedback}</ReactMarkdown>
      </div>

      {onRetry && (
        <button 
            onClick={onRetry}
            className="mt-3 w-full py-2 text-xs font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center"
        >
            <Mic size={12} className="mr-1.5" /> Try Again
        </button>
      )}
    </div>
  );
};
