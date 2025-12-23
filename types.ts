
export enum VoiceGender {
  MALE = 'Male',
  FEMALE = 'Female',
}

export enum Language {
  ENGLISH = 'English',
  SPANISH = 'Spanish',
  ARABIC = 'Arabic',
  URDU = 'Urdu',
  HINDI = 'Hindi',
}

export enum AspectRatio {
  SQUARE = '1:1',
  PORTRAIT = '9:16',
  LANDSCAPE = '16:9',
}

export enum TranscriptAnimation {
  STATIC = 'Static',
  KARAOKE = 'Karaoke',
  ACTIVE_WORD = 'Active Word',
  TYPEWRITER = 'Typewriter',
  BOUNCE = 'Bounce',
  SLIDE_UP = 'Slide Up (Teleprompter)',
  SENTENCE = 'Sentence by Sentence',
  SUBTITLE = 'Subtitle'
}

export type UserRole = 'Admin' | 'User';

export interface AuthUser {
  username: string;
  role: UserRole;
  expiry: Date;
  customApiKey?: string;
}

export interface VoiceSettings {
  gender: VoiceGender;
  voiceName: string;
  speed: number;
  stability: number;
  similarity: number;
  styleExaggeration: number;
  language: Language;
  accent?: string;
  useClonedVoice?: boolean;
  clonedVoiceId?: string;
}

export interface CustomVoice {
  id: string;
  name: string;
  base64Audio: string;
  mimeType: string;
  createdAt: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TranscriptStyle {
  isVisible: boolean; 
  fontSize: number;
  fontFamily: string;
  textColor: string;
  highlightColor: string;
  backgroundColor: string;
  backgroundOpacity: number; // Added for adjustable transparency
  verticalPosition: number; // 0 to 100% (Top to Bottom)
  horizontalPosition: number; // 0 to 100% (Left to Right)
  boxWidth: number; // 10 to 100% of video width
  boxHeight: number; // 5 to 100% of video height
  paddingTop: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingRight: number;
  lineHeight: number; // Line spacing multiplier
  animation: TranscriptAnimation;
  textAlign: TextAlign;
}

export interface VideoState {
  text: string;
  secondaryText: string;
  audioBlob: Blob | null;
  audioBuffer: AudioBuffer | null;
  images: string[];
  isGeneratingAudio: boolean;
  isRecordingVideo: boolean;
}
