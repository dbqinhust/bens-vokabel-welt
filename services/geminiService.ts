
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Article, AIResponse, WordType, VerbConjugations } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

async function retryWithBackoff<T>(
  operation: () => Promise<T>, 
  retries = 3, 
  delay = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Check for rate limit (429) or service unavailable (503)
    const errorCode = error?.status || error?.code || error?.error?.code;
    const errorMessage = error?.message || error?.error?.message || '';
    const status = error?.status || error?.error?.status;
    
    const isRateLimit = 
      errorCode === 429 || 
      errorCode === 503 || 
      errorMessage.includes('429') || 
      errorMessage.toLowerCase().includes('quota') ||
      status === 'RESOURCE_EXHAUSTED';

    if (retries > 0 && isRateLimit) {
      console.warn(`Gemini API rate limit hit. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function fetchVocabMetadata(word: string): Promise<AIResponse> {
  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `Translate and provide linguistic details for the word: "${word}". 
      1. If the input is not German, translate it to German first. 
      2. Identify the word type (noun, verb, adjective, adverb, pronoun, preposition, conjunction, other).
      3. For VERBS: provide the infinitive (as 'german'), the preterite (Präteritum, 3rd person singular), and the perfect (Perfekt, including auxiliary 'haben' or 'sein').
      4. For NOUNS: provide the definite article (der, die, das) and plural form.
      5. Provide a phonetic guide in IPA format for German pronunciation.
      6. Provide a simple example sentence in German and its English translation.
      
      IMPORTANT: For any field that is not applicable to the identified word type (e.g. 'plural' for verbs, 'preterite' for nouns), you MUST return the string "none".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            german: { type: Type.STRING, description: "The German word (infinitive for verbs, nominative singular for nouns)." },
            wordType: { type: Type.STRING, enum: ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "other"] },
            article: { type: Type.STRING, enum: ["der", "die", "das", "none"], description: "The definite article for nouns. Use 'none' if not a noun." },
            translation: { type: Type.STRING, description: "English translation." },
            exampleDe: { type: Type.STRING, description: "A simple German example sentence." },
            exampleEn: { type: Type.STRING, description: "English translation of the example sentence." },
            plural: { type: Type.STRING, description: "Plural form for nouns, or 'none'." },
            preterite: { type: Type.STRING, description: "Preterite form for verbs, or 'none'." },
            perfect: { type: Type.STRING, description: "Perfect form for verbs including auxiliary, or 'none'." },
            phonetic: { type: Type.STRING, description: "IPA phonetic transcription." },
          },
          required: ["german", "wordType", "article", "translation", "exampleDe", "exampleEn", "plural", "preterite", "perfect", "phonetic"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    try {
      return JSON.parse(text) as AIResponse;
    } catch (e) {
      console.error("Failed to parse Gemini response:", text);
      throw new Error("Invalid response format from AI");
    }
  });
}

export async function fetchVerbConjugations(verb: string): Promise<VerbConjugations> {
  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Conjugate the German verb "${verb}" in Present (Präsens), Preterite (Präteritum), and Future I (Futur I) tenses. Return strictly structured JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            present: {
              type: Type.OBJECT,
              properties: {
                ich: { type: Type.STRING },
                du: { type: Type.STRING },
                er_sie_es: { type: Type.STRING },
                wir: { type: Type.STRING },
                ihr: { type: Type.STRING },
                sie_Sie: { type: Type.STRING },
              },
              required: ["ich", "du", "er_sie_es", "wir", "ihr", "sie_Sie"]
            },
            preterite: {
              type: Type.OBJECT,
              properties: {
                ich: { type: Type.STRING },
                du: { type: Type.STRING },
                er_sie_es: { type: Type.STRING },
                wir: { type: Type.STRING },
                ihr: { type: Type.STRING },
                sie_Sie: { type: Type.STRING },
              },
              required: ["ich", "du", "er_sie_es", "wir", "ihr", "sie_Sie"]
            },
            future: {
              type: Type.OBJECT,
              properties: {
                ich: { type: Type.STRING },
                du: { type: Type.STRING },
                er_sie_es: { type: Type.STRING },
                wir: { type: Type.STRING },
                ihr: { type: Type.STRING },
                sie_Sie: { type: Type.STRING },
              },
              required: ["ich", "du", "er_sie_es", "wir", "ihr", "sie_Sie"]
            }
          },
          required: ["present", "preterite", "future"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as VerbConjugations;
  });
}

export async function generateVisualMnemonic(word: string, translation: string): Promise<string | undefined> {
  try {
    return await retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                text: `A clear, minimalist educational illustration of the object or concept of '${word}' (${translation}) on a clean solid white background. High quality, soft lighting, 3D isometric render style. THE IMAGE MUST NOT CONTAIN ANY TEXT, LETTERS, WORDS, NUMBERS, OR CHARACTERS WHATSOEVER. Purely visual representation only.`,
              },
            ],
          },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
        return undefined;
    }, 1, 2000); // Fewer retries for heavy media generation
  } catch (e) {
    console.error("Image generation failed", e);
  }
  return undefined;
}

export async function generateSpeech(text: string): Promise<string | undefined> {
  try {
    return await retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Puck' },
              },
            },
          },
        });

        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    }, 1, 2000);
  } catch (e) {
    console.error("Speech generation failed", e);
    return undefined;
  }
}

export async function getWordSuggestions(prefix: string): Promise<string[]> {
  try {
    return await retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `List 5 common German words that start with "${prefix}". Return a JSON object with a "words" property containing the array of strings.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                words: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              }
            }
          }
        });
        const text = response.text;
        if (!text) return [];
        const json = JSON.parse(text);
        return json.words || [];
    }, 3, 1000); // Increased retries to handle 429
  } catch (e) {
    console.warn("Error fetching suggestions", e);
    return [];
  }
}

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  // Ensure the buffer is aligned for Int16Array
  const buffer = data.buffer;
  const dataInt16 = new Int16Array(buffer);
  const frameCount = dataInt16.length / numChannels;
  const audioBuffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return audioBuffer;
}
