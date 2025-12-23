import { VoiceGender } from './types';

export const MAX_CHARS = 50000;

export const AVAILABLE_FONTS = [
  'Inter',
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Georgia',
  'Impact'
];

// Updated to standard Gemini voices: Puck, Charon, Kore, Fenrir, Zephyr
export const GEMINI_VOICES = {
  [VoiceGender.FEMALE]: ['Kore', 'Zephyr'],
  [VoiceGender.MALE]: ['Fenrir', 'Charon', 'Puck'],
};

export const SAMPLE_RATE = 24000;