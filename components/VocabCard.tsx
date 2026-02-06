
import React, { useRef, useState } from 'react';
import { VocabItem } from '../types';
import { decodeBase64, decodeAudioData } from '../services/geminiService';

interface VocabCardProps {
  item: VocabItem;
  onDelete?: (id: string) => void;
  onMasteryUpdate?: (id: string, newMastery: number) => void;
  onUpdateItem?: (id: string, data: Partial<VocabItem>) => void;
}

const VocabCard: React.FC<VocabCardProps> = ({ item, onDelete, onMasteryUpdate }) => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [showPhonetic, setShowPhonetic] = useState(false);

  const capitalize = (s: string) => s && s.charAt(0).toUpperCase() + s.slice(1);

  const getThemeColors = () => {
    if (item.wordType === 'verb') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (item.wordType === 'adjective') return 'bg-purple-50 text-purple-700 border-purple-200';
    
    switch (item.article) {
      case 'der': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'die': return 'bg-red-50 text-red-700 border-red-200';
      case 'das': return 'bg-green-50 text-green-700 border-green-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getBadgeColor = () => {
    if (item.wordType === 'verb') return 'bg-amber-600';
    if (item.wordType === 'adjective') return 'bg-purple-600';
    
    switch (item.article) {
      case 'der': return 'bg-blue-600';
      case 'die': return 'bg-red-600';
      case 'das': return 'bg-green-600';
      default: return 'bg-slate-600';
    }
  };

  const getArticleTextColor = () => {
     switch (item.article) {
      case 'der': return 'text-blue-600';
      case 'die': return 'text-red-600';
      case 'das': return 'text-green-600';
      default: return 'text-slate-600';
    }
  };

  const playAudio = async () => {
    if (!item.audioBase64) return;
    
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    
    try {
      const decoded = decodeBase64(item.audioBase64);
      const audioBuffer = await decodeAudioData(decoded, ctx);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start();
    } catch (err) {
      console.error("Audio playback error:", err);
    }
  };

  const adjustMastery = (delta: number) => {
    const newMastery = Math.min(100, Math.max(0, item.mastery + delta));
    onMasteryUpdate?.(item.id, newMastery);
  };

  const handleDelete = () => {
    if (window.confirm(`Möchtest du "${item.german}" wirklich aus deiner Liste entfernen?`)) {
      onDelete?.(item.id);
    }
  };

  return (
    <>
      <div className={`relative flex flex-col overflow-hidden rounded-2xl border transition-all hover:shadow-lg ${getThemeColors()}`}>
        {item.imageUrl && (
          <div className="h-48 w-full overflow-hidden bg-white">
            <img src={item.imageUrl} alt={item.german} className="h-full w-full object-cover" />
          </div>
        )}
        
        <div className="p-5 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white ${getBadgeColor()}`}>
                {item.wordType === 'noun' && item.article !== 'none' ? item.article : item.wordType}
              </span>
              <h3 className="text-xl font-bold tracking-tight">
                {item.wordType === 'noun' && item.article !== 'none' ? (
                  <>
                    <span className={getArticleTextColor()}>{capitalize(item.article)}</span> {item.german}
                  </>
                ) : (
                  item.german
                )}
              </h3>
            </div>
            <button 
              onClick={handleDelete}
              className="text-slate-400 hover:text-red-500 transition-colors p-1"
              title="Delete Word"
            >
              <i className="fa-solid fa-trash-can text-sm"></i>
            </button>
          </div>
          
          <p className="text-slate-600 font-medium mb-4 italic">{item.translation}</p>
          
          <div className="space-y-1 mb-4">
            {item.wordType === 'noun' && item.plural && item.plural !== 'none' && (
              <p className="text-xs text-slate-500">
                <span className="font-semibold">Plural:</span> {item.plural}
              </p>
            )}

            {item.wordType === 'verb' && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold">Präteritum:</span> {item.preterite}
                </p>
                <p className="text-xs text-slate-500">
                  <span className="font-semibold">Perfekt:</span> {item.perfect}
                </p>
              </div>
            )}
          </div>

          <div className="mt-auto space-y-3">
            <div className="bg-white/50 p-3 rounded-xl border border-white/50">
              <p className="text-sm font-medium text-slate-800 leading-snug">{item.exampleDe}</p>
              <p className="text-xs text-slate-500 mt-1">{item.exampleEn}</p>
            </div>

            {item.phonetic && (
              <div className="border-t border-slate-200/50 pt-2">
                <button 
                  onClick={() => setShowPhonetic(!showPhonetic)}
                  className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 hover:text-blue-500 transition-colors"
                >
                  <i className={`fa-solid fa-chevron-${showPhonetic ? 'down' : 'right'} text-[8px]`}></i>
                  Phonetic Guide
                </button>
                {showPhonetic && (
                  <p className="text-xs font-mono text-slate-600 bg-white/30 p-2 rounded mt-1 border border-white/20">
                    {item.phonetic}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center justify-between">
                <button 
                  onClick={playAudio}
                  className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm hover:shadow-md transition-all text-slate-700 font-medium text-sm"
                >
                  <i className="fa-solid fa-volume-high text-blue-500"></i>
                  Listen
                </button>

                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => adjustMastery(-10)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-slate-50 text-slate-500 transition-all border border-slate-100"
                    title="Decrease Mastery"
                  >
                    <i className="fa-solid fa-minus text-xs"></i>
                  </button>
                  <button 
                    onClick={() => adjustMastery(10)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white shadow-sm hover:bg-slate-50 text-slate-500 transition-all border border-slate-100"
                    title="Increase Mastery"
                  >
                    <i className="fa-solid fa-plus text-xs"></i>
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500" 
                    style={{ width: `${item.mastery}%` }}
                  ></div>
                </div>
                <span className="text-[10px] font-bold text-slate-400 min-w-[24px]">{item.mastery}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default VocabCard;
