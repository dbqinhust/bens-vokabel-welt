
import React, { useState, useEffect, useRef } from 'react';
import { VocabItem, Article, WordType } from './types';
import { fetchVocabMetadata, generateVisualMnemonic, generateSpeech, getWordSuggestions, decodeBase64, decodeAudioData } from './services/geminiService';
import VocabCard from './components/VocabCard';

const capitalize = (s: string) => s && s.charAt(0).toUpperCase() + s.slice(1);

const App: React.FC = () => {
  const [vocabList, setVocabList] = useState<VocabItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [filter, setFilter] = useState<'all' | WordType | Article>('all');
  
  // Study Mode State
  const [isStudyMode, setIsStudyMode] = useState(false);
  const [studyList, setStudyList] = useState<VocabItem[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Load from local storage on mount with migration
  useEffect(() => {
    const saved = localStorage.getItem('deutschWunder_vocab');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: Ensure all items have a wordType (defaulting to noun for old data)
        const migrated = (parsed as any[]).map(item => ({
          ...item,
          wordType: item.wordType || 'noun',
          mastery: item.mastery ?? 0,
          article: item.article || 'none'
        }));
        setVocabList(migrated);
      } catch (e) {
        console.error("Failed to load vocab", e);
      }
    }
  }, []);

  // Save to local storage on change
  useEffect(() => {
    localStorage.setItem('deutschWunder_vocab', JSON.stringify(vocabList));
  }, [vocabList]);

  // Suggestion Logic
  useEffect(() => {
    const trimmedInput = inputValue.trim();
    if (trimmedInput.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      // Don't fetch if currently processing (e.g., just submitted)
      if (!isProcessing) {
        const suggs = await getWordSuggestions(trimmedInput);
        // Only show if the input hasn't drastically changed in the meantime
        if (suggs.length > 0) {
            setSuggestions(suggs);
            setShowSuggestions(true);
        }
      }
    }, 800); // Increased from 400ms to 800ms to reduce API calls and avoid 429

    return () => clearTimeout(timer);
  }, [inputValue, isProcessing]);

  const handleSelectSuggestion = (word: string) => {
    setInputValue(word);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleAddWord = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    // Clear suggestions immediately
    setSuggestions([]);
    setShowSuggestions(false);
    
    setIsProcessing(true);
    setStatusMessage('Analysiere Wort...');

    try {
      const metadata = await fetchVocabMetadata(inputValue);
      
      if (vocabList.some(v => v.german.toLowerCase() === metadata.german.toLowerCase())) {
        alert(`${metadata.german} ist bereits in deiner Liste!`);
        setIsProcessing(false);
        setInputValue('');
        return;
      }

      setStatusMessage('Erstelle Bilder & Audio...');
      
      // For Nouns, we want the sound to include the article (e.g., "Das Haus")
      const speechText = metadata.wordType === 'noun' && metadata.article !== 'none' 
        ? `${capitalize(metadata.article)} ${metadata.german}` 
        : metadata.german;

      const [imageUrl, audioBase64] = await Promise.all([
        generateVisualMnemonic(metadata.german, metadata.translation).catch(() => undefined),
        generateSpeech(speechText).catch(() => undefined)
      ]);

      const newItem: VocabItem = {
        id: crypto.randomUUID(),
        german: metadata.german,
        wordType: metadata.wordType,
        article: metadata.article,
        translation: metadata.translation,
        exampleDe: metadata.exampleDe,
        exampleEn: metadata.exampleEn,
        plural: metadata.plural,
        preterite: metadata.preterite,
        perfect: metadata.perfect,
        phonetic: metadata.phonetic,
        imageUrl,
        audioBase64,
        createdAt: Date.now(),
        mastery: 0
      };

      setVocabList(prev => [newItem, ...prev]);
      setInputValue('');
      setStatusMessage('');
    } catch (err) {
      console.error(err);
      alert('Ein Fehler ist aufgetreten. Bitte versuche es später erneut.');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteItem = (id: string) => {
    setVocabList(prev => prev.filter(item => item.id !== id));
  };

  const updateMastery = (id: string, newMastery: number) => {
    setVocabList(prev => prev.map(item => 
      item.id === id ? { ...item, mastery: Math.min(100, Math.max(0, newMastery)) } : item
    ));
    
    if (isStudyMode) {
      setStudyList(prev => prev.map(item => 
        item.id === id ? { ...item, mastery: Math.min(100, Math.max(0, newMastery)) } : item
      ));
    }
  };

  const updateItemData = (id: string, data: Partial<VocabItem>) => {
    setVocabList(prev => prev.map(item => 
      item.id === id ? { ...item, ...data } : item
    ));
  };

  const filteredList = vocabList.filter(item => {
    const matchesFilter = filter === 'all' || item.article === filter || item.wordType === filter;
    const matchesSearch = 
      item.german.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.translation.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const startStudy = () => {
    if (vocabList.length === 0) return;
    const list = [...vocabList].sort((a, b) => a.mastery - b.mastery).slice(0, 10);
    setStudyList(list);
    setStudyIndex(0);
    setIsFlipped(false);
    setIsStudyMode(true);
  };

  const handleStudyMastery = (delta: number) => {
    const currentWord = studyList[studyIndex];
    updateMastery(currentWord.id, currentWord.mastery + delta);
    
    if (studyIndex < studyList.length - 1) {
      setStudyIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      alert("Lerneinheit abgeschlossen! Gut gemacht.");
      setIsStudyMode(false);
    }
  };

  const playStudyAudio = async () => {
    const item = studyList[studyIndex];
    if (!item?.audioBase64) return;
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
    } catch (err) { console.error(err); }
  };

  const getHeaderColor = (item: VocabItem) => {
    if (item.wordType === 'verb') return 'text-amber-600';
    if (item.wordType === 'adjective') return 'text-purple-600';
    switch (item.article) {
      case 'der': return 'text-blue-600';
      case 'die': return 'text-red-600';
      case 'das': return 'text-green-600';
      default: return 'text-slate-600';
    }
  };

  const isNounFilterActive = filter === 'noun' || filter === 'der' || filter === 'die' || filter === 'das';

  if (isStudyMode && studyList.length > 0) {
    const currentItem = studyList[studyIndex];
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col p-4">
        <header className="flex justify-between items-center mb-8 pt-4">
          <button onClick={() => setIsStudyMode(false)} className="text-slate-400 hover:text-white flex items-center gap-2 font-medium">
            <i className="fa-solid fa-xmark"></i> Beenden
          </button>
          <div className="text-sm font-bold tracking-widest text-blue-400 uppercase">
            Wort {studyIndex + 1} von {studyList.length}
          </div>
          <div className="w-10"></div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full">
          <div className={`w-full aspect-[4/5] bg-white rounded-3xl overflow-hidden shadow-2xl transition-all duration-500 transform ${isFlipped ? 'rotate-y-180' : ''}`}>
            {!isFlipped ? (
              <div className="h-full flex flex-col">
                <div className="flex-1 bg-slate-50 flex items-center justify-center p-8">
                  {currentItem.imageUrl ? (
                    <img src={currentItem.imageUrl} alt="Mnemonic" className="max-h-full max-w-full object-contain rounded-xl" />
                  ) : (
                    <div className="text-slate-200 text-6xl"><i className="fa-solid fa-image"></i></div>
                  )}
                </div>
                <div className="p-8 text-center bg-white border-t border-slate-100 flex flex-col items-center justify-center">
                  {currentItem.wordType === 'noun' && currentItem.article !== 'none' ? (
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-6">
                      <span className={getHeaderColor(currentItem)}>{capitalize(currentItem.article)}</span> {currentItem.german}
                    </h2>
                  ) : (
                    <>
                      <span className={`text-sm font-bold uppercase tracking-tighter mb-1 block ${getHeaderColor(currentItem)}`}>
                        {currentItem.wordType}
                      </span>
                      <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-6">{currentItem.german}</h2>
                    </>
                  )}
                  
                  <button 
                    onClick={() => { setIsFlipped(true); playStudyAudio(); }}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-eye"></i> Übersetzung zeigen
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col p-8 bg-blue-50">
                <div className="text-center mb-6">
                  {currentItem.wordType === 'noun' && currentItem.article !== 'none' ? (
                    <h2 className="text-3xl font-black text-blue-900">
                      <span className={`${getHeaderColor(currentItem)} opacity-80`}>{capitalize(currentItem.article)}</span> {currentItem.german}
                    </h2>
                  ) : (
                    <h2 className="text-3xl font-black text-blue-900">{currentItem.german}</h2>
                  )}
                  <p className="text-xl font-medium text-blue-600 italic mt-1">{currentItem.translation}</p>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-blue-100">
                    <p className="text-slate-800 font-medium leading-relaxed">{currentItem.exampleDe}</p>
                    <p className="text-sm text-slate-500 mt-2">{currentItem.exampleEn}</p>
                  </div>
                  
                  {currentItem.wordType === 'verb' && (
                    <div className="bg-amber-100/50 p-3 rounded-xl border border-amber-200 text-center">
                      <p className="text-[10px] uppercase font-bold text-amber-500 mb-1">Verbformen</p>
                      <p className="text-amber-900 font-bold">{currentItem.preterite} | {currentItem.perfect}</p>
                    </div>
                  )}

                  {currentItem.wordType === 'noun' && currentItem.plural && currentItem.plural !== 'none' && (
                    <div className="text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Plural</span>
                      <p className="text-blue-800 font-bold">{currentItem.plural}</p>
                    </div>
                  )}
                  
                  <button 
                    onClick={playStudyAudio}
                    className="mx-auto flex items-center gap-2 bg-blue-200/50 px-6 py-2 rounded-full text-blue-700 font-bold text-sm hover:bg-blue-200 transition-all"
                  >
                    <i className="fa-solid fa-volume-high"></i> Nochmal hören
                  </button>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => handleStudyMastery(-10)}
                    className="py-4 bg-white border-2 border-slate-200 rounded-2xl text-slate-600 font-bold hover:bg-slate-50 transition-all flex flex-col items-center gap-1"
                  >
                    <i className="fa-solid fa-face-frown text-xl"></i>
                    <span>Schwer</span>
                  </button>
                  <button 
                    onClick={() => handleStudyMastery(15)}
                    className="py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex flex-col items-center gap-1"
                  >
                    <i className="fa-solid fa-face-smile text-xl"></i>
                    <span>Einfach</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300" 
              style={{ width: `${((studyIndex + 1) / studyList.length) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900">
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
              <i className="fa-solid fa-graduation-cap text-white text-sm"></i>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400">
              Bens Vokabel Welt
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={startStudy}
              disabled={vocabList.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all text-sm disabled:opacity-50 shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5"
            >
              <i className="fa-solid fa-play"></i> <span>Lernen</span>
            </button>
            <div className="hidden sm:flex flex-col items-end text-sm font-medium text-slate-500">
              <span className="text-slate-900">{vocabList.length} Wörter</span>
              <span className="text-[10px] text-blue-500 uppercase tracking-widest font-bold">Bibliothek</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 pt-8">
        <section className="mb-12">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight">Erweitere deinen Wortschatz</h2>
            <p className="text-slate-500 mb-8">Nomen, Verben, Adjektive – wir kümmern uns um die Grammatik.</p>
            
            <form onSubmit={handleAddWord} className="relative group">
              <div className="relative">
                <input 
                  type="text" 
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onBlur={() => {
                    // Slight delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  onFocus={() => {
                    if (suggestions.length > 0) setShowSuggestions(true);
                  }}
                  placeholder="z.B. laufen, das Haus, schön, oft..."
                  disabled={isProcessing}
                  className="w-full pl-6 pr-32 py-5 bg-white text-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 border border-transparent focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-lg font-medium"
                />
                
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl z-20 overflow-hidden border border-slate-100 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="py-2">
                       <div className="px-6 py-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider">Vorschläge</div>
                       {suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSelectSuggestion(s)}
                          className="w-full text-left px-6 py-3 hover:bg-blue-50 text-slate-700 transition-colors font-medium flex items-center gap-2"
                        >
                          <i className="fa-solid fa-magnifying-glass text-xs text-slate-300"></i>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <button 
                type="submit"
                disabled={isProcessing || !inputValue.trim()}
                className="absolute right-2 top-2 bottom-2 px-8 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-2xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-200 z-10"
              >
                {isProcessing ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-plus"></i>}
                <span className="hidden xs:inline">Hinzufügen</span>
              </button>
            </form>
            {statusMessage && (
              <p className="mt-4 text-sm font-bold text-blue-500 animate-pulse tracking-wide">
                {statusMessage}
              </p>
            )}
          </div>
        </section>

        <section className="mb-8 space-y-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="relative flex-1 max-w-md">
                <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                <input 
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Wörter suchen..."
                  className="w-full pl-11 pr-4 py-3 bg-white text-slate-900 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm shadow-sm"
                />
              </div>
              
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                <button 
                  onClick={() => setFilter('all')}
                  className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${filter === 'all' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 border-blue-600' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                >
                  Alle
                </button>
                {(['verb', 'noun', 'adjective', 'adverb', 'pronoun', 'preposition'] as const).map((t) => (
                  <button 
                    key={t}
                    onClick={() => setFilter(t)}
                    className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap ${filter === t || (t === 'noun' && isNounFilterActive) ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 border-blue-600' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                  >
                    {t}s
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-navigation for Nouns */}
            {isNounFilterActive && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="h-6 w-px bg-slate-200 mx-2 hidden md:block"></div>
                <button 
                  onClick={() => setFilter('noun')}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'noun' ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 hover:bg-slate-50 border border-slate-200'}`}
                >
                  Alle Nomen
                </button>
                <button 
                  onClick={() => setFilter('der')}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'der' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50'}`}
                >
                  Der
                </button>
                <button 
                  onClick={() => setFilter('die')}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'die' ? 'bg-red-600 text-white shadow-md shadow-red-200' : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'}`}
                >
                  Die
                </button>
                <button 
                  onClick={() => setFilter('das')}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filter === 'das' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white text-emerald-600 border border-emerald-200 hover:bg-emerald-50'}`}
                >
                  Das
                </button>
              </div>
            )}
          </div>
        </section>

        <section>
          {filteredList.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredList.map((item) => (
                <VocabCard 
                  key={item.id} 
                  item={item} 
                  onDelete={deleteItem}
                  onMasteryUpdate={updateMastery}
                  onUpdateItem={updateItemData}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-24 bg-white rounded-[2rem] border-2 border-slate-100 border-dashed">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fa-solid fa-ghost text-slate-200 text-3xl"></i>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Keine Ergebnisse gefunden</h3>
              <p className="text-slate-500 max-w-sm mx-auto">Versuche einen anderen Suchbegriff oder füge neue Wörter hinzu.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
