
export type Article = 'der' | 'die' | 'das' | 'none';
export type WordType = 'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun' | 'preposition' | 'conjunction' | 'other';

export interface ConjugationTense {
  ich: string;
  du: string;
  er_sie_es: string;
  wir: string;
  ihr: string;
  sie_Sie: string;
}

export interface VerbConjugations {
  present: ConjugationTense;
  preterite: ConjugationTense;
  future: ConjugationTense;
}

export interface VocabItem {
  id: string;
  german: string;
  wordType: WordType;
  article: Article;
  translation: string;
  exampleDe: string;
  exampleEn: string;
  plural?: string;
  preterite?: string;
  perfect?: string;
  phonetic?: string;
  imageUrl?: string;
  audioBase64?: string;
  conjugations?: VerbConjugations;
  createdAt: number;
  mastery: number; // 0 to 100
}

export interface AIResponse {
  german: string;
  wordType: WordType;
  article: Article;
  translation: string;
  exampleDe: string;
  exampleEn: string;
  plural: string;
  preterite: string;
  perfect: string;
  phonetic: string;
}
