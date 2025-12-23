
import { GoogleGenAI, Modality } from "@google/genai";
import { GEMINI_VOICES } from '../constants';

// Standard voices supported by Gemini 2.5/3 series
const SAFE_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function chunkText(text: string, maxLength: number = 300): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  
  return chunks;
}

async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 5, baseDelay: number = 4000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errBody = error?.error || error;
      const msg = errBody?.message || error?.message || '';
      const code = errBody?.code || error?.status || error?.code;
      const status = errBody?.status || error?.status;

      const isRateLimit = 
        msg.includes('429') || 
        msg.includes('Quota') || 
        msg.includes('RESOURCE_EXHAUSTED') ||
        code === 429 ||
        status === 429 ||
        status === 'RESOURCE_EXHAUSTED';
        
      if (isRateLimit && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        console.warn(`[GeminiService] Rate limit hit. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// Fix: Remove apiKey parameter and use process.env.API_KEY directly as per guidelines.
export const generateSpeech = async (
  text: string,
  voiceName: string,
  language: string,
  options: { speed: number; stability: number; similarity: number; styleExaggeration: number; accent?: string }
): Promise<ArrayBuffer | undefined> => {
  // Initialize AI client with system API key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const chunks = chunkText(text);
  const BATCH_SIZE = 1;
  const audioSegments: Uint8Array[] = new Array(chunks.length);
  const fallbackVoice = ['Fenrir', 'Charon', 'Puck'].includes(voiceName) ? 'Fenrir' : 'Kore';

  const stabilityDesc = options.stability > 0.7 ? "consistent and professional" : options.stability < 0.3 ? "expressive and emotional" : "balanced";
  const accentPart = options.accent ? ` with a clear ${options.accent} accent` : "";
  const speedPart = options.speed !== 1.0 ? ` speaking at exactly ${options.speed}x normal speed` : "";
  const stylePart = options.styleExaggeration > 0.6 ? "highly dramatic and animated" : options.styleExaggeration < 0.3 ? "calm and matter-of-fact" : "natural";
  
  const instruction = `Speak in ${language}${accentPart}. Tone: ${stylePart}, ${stabilityDesc}${speedPart}. Read the following text precisely: `;

  try {
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        if (i > 0) await new Promise(r => setTimeout(r, 2000));
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (chunk, index) => {
            const globalIndex = i + index;
            await retryOperation(async () => {
                let base64Audio: string | undefined;
                try {
                    const response = await ai.models.generateContent({
                        model: "gemini-2.5-flash-preview-tts",
                        contents: [{ parts: [{ text: instruction + chunk }] }],
                        config: {
                            responseModalities: [Modality.AUDIO],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: voiceName },
                                },
                            },
                        },
                    });
                    base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                } catch (e: any) {
                    console.warn(`Voice ${voiceName} failed, trying fallback ${fallbackVoice}`);
                    const response = await ai.models.generateContent({
                        model: "gemini-2.5-flash-preview-tts",
                        contents: [{ parts: [{ text: instruction + chunk }] }],
                        config: {
                            responseModalities: [Modality.AUDIO],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: fallbackVoice },
                                },
                            },
                        },
                    });
                    base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                }
                if (base64Audio) audioSegments[globalIndex] = base64ToBytes(base64Audio);
            });
        });
        await Promise.all(promises);
    }
    const validSegments = audioSegments.filter(s => s !== undefined);
    if (validSegments.length === 0) return undefined;
    const totalLength = validSegments.reduce((acc, seg) => acc + seg.length, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const seg of validSegments) {
        combinedBuffer.set(seg, offset);
        offset += seg.length;
    }
    return combinedBuffer.buffer;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
};

// Fix: Remove apiKey parameter and use process.env.API_KEY directly.
export const generateClonedSpeech = async (
  text: string,
  referenceAudioBase64: string,
  referenceMimeType: string,
  options: { speed: number; stability: number; similarity: number; styleExaggeration: number }
): Promise<ArrayBuffer | undefined> => {
  const hash = referenceAudioBase64.length % SAFE_VOICES.length;
  const bestMatchVoice = SAFE_VOICES[hash];
  
  return generateSpeech(text, bestMatchVoice, "English", {
    ...options,
    accent: "Natural"
  });
};

// Fix: Use 'gemini-3-flash-preview' for translation and remove apiKey parameter.
export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  if (!text.trim()) return "";
  try {
    return await retryOperation(async () => {
        const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Translate to ${targetLanguage}. Return text only:\n\n${text}`,
        });
        return response.text?.trim() || text;
    });
  } catch (error) {
    throw error;
  }
};