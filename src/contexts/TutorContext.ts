import { createContext } from 'react';

export interface TutorContextType {
  activeWordRecording: string | null;
  handleWordRecord: (text: string) => void;
  audioCache: Record<string, ArrayBuffer>;
  playAudio: (text: string) => Promise<void>;
  evaluationResult: { text: string; feedback: string } | null;
  setEvaluationResult: (res: { text: string; feedback: string } | null) => void;
  showWordHistory: (text: string) => void;
}

export const TutorContext = createContext<TutorContextType>({
  activeWordRecording: null,
  handleWordRecord: () => {},
  audioCache: {},
  playAudio: async () => {},
  evaluationResult: null,
  setEvaluationResult: () => {},
  showWordHistory: () => {}
});
