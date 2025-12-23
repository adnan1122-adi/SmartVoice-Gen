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

// Expanded list of voices.
// Note: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr' are standard. 
// Others are mapped or aliased in logic if the API strictly restricts names.
export const GEMINI_VOICES = {
  [VoiceGender.FEMALE]: ['Kore', 'Zephyr', 'Aoede', 'Leto', 'Lyra'],
  [VoiceGender.MALE]: ['Fenrir', 'Charon', 'Puck', 'Orion', 'Marcus'],
};

export const SAMPLE_RATE = 24000;