
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Languages, Mic, Download, Video, Settings, Type, 
  Image as ImageIcon, Play, Pause, AlertCircle, Palette, Upload, User, Sparkles, Trash2, Check, X, Layout, FileVideo, Square, Eye, EyeOff,
  AlignLeft, AlignCenter, AlignRight, LogIn, LogOut, ShieldAlert, Key, Coffee, FileAudio, ChevronDown, Sliders, Maximize, Move, Heading
} from 'lucide-react';
import { 
  AspectRatio, Language, TranscriptStyle, TranscriptAnimation,
  VideoState, VoiceGender, VoiceSettings, CustomVoice, TextAlign, AuthUser, UserRole
} from './types';
import { AVAILABLE_FONTS, MAX_CHARS, GEMINI_VOICES } from './constants';
import { generateSpeech, generateClonedSpeech, translateText } from './services/geminiService';
import { decodeAudioData, audioBufferToWav, audioBufferToMp3 } from './services/audioUtils';
import VideoEditor from './components/VideoEditor';

const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3qv2BmESqbS8-4cntrUvngieWgRrEXjdrkr6uu6HC0X-xJtsvp_DJSeRsq7FvwciPAfgSDONbv66D/pub?output=csv";

const App: React.FC = () => {
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  // --- App State ---
  const [activeTab, setActiveTab] = useState<'voice' | 'visual'>('voice');
  const [voiceMode, setVoiceMode] = useState<'preset' | 'cloned'>('preset');
  
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    gender: VoiceGender.FEMALE,
    voiceName: GEMINI_VOICES[VoiceGender.FEMALE][0],
    speed: 1.0,
    stability: 0.5,
    similarity: 0.75,
    styleExaggeration: 0.0,
    language: Language.ENGLISH,
    accent: 'American',
    useClonedVoice: false,
    clonedVoiceId: undefined
  });

  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [transcriptStyle, setTranscriptStyle] = useState<TranscriptStyle>({
    isVisible: true,
    fontSize: 24,
    fontFamily: 'Inter',
    textColor: '#FFFFFF',
    highlightColor: '#3B82F6',
    backgroundColor: '#000000',
    backgroundOpacity: 0.5,
    verticalPosition: 75,
    horizontalPosition: 50,
    boxWidth: 80,
    boxHeight: 15,
    paddingTop: 20,
    paddingBottom: 20,
    paddingLeft: 20,
    paddingRight: 20,
    lineHeight: 1.2,
    animation: TranscriptAnimation.KARAOKE,
    textAlign: 'center'
  });

  const [secondaryTextStyle, setSecondaryTextStyle] = useState<TranscriptStyle>({
    isVisible: true,
    fontSize: 48,
    fontFamily: 'Impact',
    textColor: '#FFFFFF',
    highlightColor: 'transparent',
    backgroundColor: '#000000',
    backgroundOpacity: 0.0,
    verticalPosition: 15,
    horizontalPosition: 50,
    boxWidth: 90,
    boxHeight: 20,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 10,
    lineHeight: 1.1,
    animation: TranscriptAnimation.STATIC,
    textAlign: 'center'
  });

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  
  const [videoState, setVideoState] = useState<VideoState>({
    text: '',
    secondaryText: '',
    audioBlob: null,
    audioBuffer: null,
    isGeneratingAudio: false,
    isRecordingVideo: false,
    images: [],
  });

  // --- Audio Preview State ---
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  interface VideoFormatOption { mime: string; label: string; ext: string; }
  const [availableFormats, setAvailableFormats] = useState<VideoFormatOption[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormatOption | null>(null);

  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  // --- Auth Logic ---

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 5000);
  };

  const parseCSVDate = (dateStr: string) => {
    return new Date(dateStr);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setAuthError('');

    try {
      const response = await fetch(GOOGLE_SHEET_CSV_URL);
      const csvText = await response.text();
      const rows = csvText.split('\n').map(row => row.split(','));
      
      let foundUser = null;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i].map(c => c.trim());
        if (row[0] === loginForm.username && row[1] === loginForm.password) {
          foundUser = { u: row[0], r: row[2], e: row[4] };
          break;
        }
      }

      if (foundUser) {
        const expiryDate = parseCSVDate(foundUser.e);
        if (new Date() > expiryDate) {
          setAuthError('Your account has expired. Please contact support.');
          showToast('Login Declined: Account Expired. Buy a coffee for smartVoice gen');
        } else {
          setCurrentUser({
            username: foundUser.u,
            role: foundUser.r as UserRole,
            expiry: expiryDate
          });
          setShowLoginModal(false);
          showToast('Welcome back! Buy a coffee for smartVoice gen');
          if (foundUser.r === 'User') {
            setNeedsApiKey(true);
          }
        }
      } else {
        setAuthError('Invalid username or password.');
        showToast('Login Declined: Invalid credentials. Buy a coffee for smartVoice gen');
      }
    } catch (err) {
      setAuthError('Authentication system is currently unavailable.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setNeedsApiKey(false);
    setTempApiKey('');
    stopAudioPreview();
    showToast('Logged out successfully.');
  };

  const handleApiKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempApiKey.trim()) {
      setCurrentUser(prev => prev ? { ...prev, customApiKey: tempApiKey.trim() } : null);
      setNeedsApiKey(false);
      showToast('API Key saved. Ready to create!');
    }
  };

  // --- App Effects ---
  
  useEffect(() => {
    const candidates: VideoFormatOption[] = [
      { mime: 'video/mp4', label: 'MP4 (H.264)', ext: 'mp4' },
      { mime: 'video/webm;codecs=vp9', label: 'WebM (VP9)', ext: 'webm' },
      { mime: 'video/webm;codecs=h264', label: 'WebM (H.264)', ext: 'webm' },
      { mime: 'video/webm', label: 'WebM (Standard)', ext: 'webm' },
    ];
    const supported = candidates.filter(c => {
        try { return MediaRecorder.isTypeSupported(c.mime); } catch (e) { return false; }
    });
    setAvailableFormats(supported);
    if (supported.length > 0) {
        const mp4 = supported.find(f => f.ext === 'mp4');
        setSelectedFormat(mp4 || supported[0]);
    }
  }, []);

  useEffect(() => {
    if (generatedVideoUrl) setGeneratedVideoUrl(null);
  }, [voiceSettings, transcriptStyle, secondaryTextStyle, aspectRatio, videoState.text, videoState.secondaryText, videoState.images, videoState.audioBuffer, selectedFormat]);

  useEffect(() => {
    return () => {
      stopAudioPreview();
    };
  }, []);

  // --- Actions ---

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length <= MAX_CHARS) {
      setVideoState(prev => ({ ...prev, text: e.target.value }));
    }
  };

  const handleLanguageChange = (lang: Language) => {
    setVoiceSettings(p => ({ ...p, language: lang, accent: lang === Language.ENGLISH ? 'American' : undefined }));
  };

  const handleTranslate = async () => {
    if (!videoState.text.trim()) return;
    setIsTranslating(true);
    showToast('Translating... Buy a coffee for smartVoice gen');
    try {
      const translated = await translateText(videoState.text, voiceSettings.language, currentUser?.customApiKey);
      setVideoState(prev => ({ ...prev, text: translated }));
    } catch (e) {
      alert("Translation failed.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleGenderChange = (gender: VoiceGender) => {
    setVoiceSettings(p => ({
        ...p,
        gender,
        voiceName: GEMINI_VOICES[gender][0]
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    const currentCount = videoState.images.length;
    const remainingSlots = 20 - currentCount;
    if (remainingSlots <= 0) return;
    const selectedFiles = files.slice(0, remainingSlots);
    Promise.all(selectedFiles.map(file => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (evt) => resolve(evt.target?.result as string);
        reader.readAsDataURL(file);
    }))).then(newImages => {
        setVideoState(prev => ({ ...prev, images: [...prev.images, ...newImages] }));
    });
  };

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsAnalyzingVoice(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64String = (event.target?.result as string).split(',')[1];
        const mimeType = file.type || 'audio/wav';
        const newVoice: CustomVoice = {
          id: Date.now().toString(),
          name: file.name.replace(/\.[^/.]+$/, ""),
          base64Audio: base64String,
          mimeType: mimeType,
          createdAt: Date.now()
        };
        setCustomVoices(prev => [...prev, newVoice]);
        setIsAnalyzingVoice(false);
        setVoiceMode('cloned');
        setVoiceSettings(p => ({ ...p, useClonedVoice: true, clonedVoiceId: newVoice.id }));
      };
      reader.readAsDataURL(file);
    }
  };

  const stopAudioPreview = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    setIsPlayingPreview(false);
  };

  const toggleAudioPreview = () => {
    if (isPlayingPreview) {
      stopAudioPreview();
    } else {
      playAudioPreview();
    }
  };

  const playAudioPreview = async () => {
    if (!videoState.audioBuffer) return;
    
    stopAudioPreview();

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextClass();
    }
    
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = videoState.audioBuffer;
    source.connect(ctx.destination);
    
    source.onended = () => {
      setIsPlayingPreview(false);
    };

    source.start(0);
    audioSourceRef.current = source;
    setIsPlayingPreview(true);
  };

  const handleGenerateAudio = async () => {
    if (!videoState.text.trim()) return;
    stopAudioPreview();
    setVideoState(prev => ({ ...prev, isGeneratingAudio: true }));
    showToast('Generating audio... Buy a coffee for smartVoice gen');
    try {
      let rawAudioBuffer: ArrayBuffer | undefined;
      const options = {
        speed: voiceSettings.speed,
        stability: voiceSettings.stability,
        similarity: voiceSettings.similarity,
        styleExaggeration: voiceSettings.styleExaggeration,
        accent: voiceSettings.accent
      };

      if (voiceMode === 'cloned' && voiceSettings.clonedVoiceId) {
        const customVoice = customVoices.find(v => v.id === voiceSettings.clonedVoiceId);
        if (!customVoice) throw new Error("Voice not found");
        rawAudioBuffer = await generateClonedSpeech(videoState.text, customVoice.base64Audio, customVoice.mimeType, options, currentUser?.customApiKey);
      } else {
        rawAudioBuffer = await generateSpeech(videoState.text, voiceSettings.voiceName, voiceSettings.language, options, currentUser?.customApiKey);
      }
      if (rawAudioBuffer) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        try {
          const audioBuffer = await decodeAudioData(rawAudioBuffer, audioCtx);
          const wavBlob = audioBufferToWav(audioBuffer);
          setVideoState(prev => ({ ...prev, audioBuffer, audioBlob: wavBlob, isGeneratingAudio: false }));
        } finally {
          if (audioCtx.state !== 'closed') await audioCtx.close();
        }
      }
    } catch (error) {
      setVideoState(prev => ({ ...prev, isGeneratingAudio: false }));
      alert("Failed to generate audio.");
    }
  };

  const handleDownloadAudio = (format: 'wav' | 'mp3') => {
    if (!videoState.audioBuffer) return;
    const blob = format === 'wav' 
      ? audioBufferToWav(videoState.audioBuffer) 
      : audioBufferToMp3(videoState.audioBuffer);
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartvoice-narration.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    setShowAudioMenu(false);
  };

  const startVideoCreation = () => {
    if (!videoState.audioBuffer) return;
    stopAudioPreview();
    setVideoState(prev => ({ ...prev, isRecordingVideo: true }));
    showToast('Rendering video... Buy a coffee for smartVoice gen');
  };

  const handleVideoCreated = useCallback((url: string) => {
    setGeneratedVideoUrl(url);
    setVideoState(prev => ({ ...prev, isRecordingVideo: false }));
  }, []);

  const StyleAdjustmentGroup = ({ 
    title, 
    style, 
    setStyle 
  }: { 
    title: string, 
    style: TranscriptStyle, 
    setStyle: React.Dispatch<React.SetStateAction<TranscriptStyle>> 
  }) => (
    <div className="space-y-4 pt-4 border-t border-gray-700">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {title === 'Subtitle' ? <Layout size={16}/> : <Heading size={16}/>} {title} Design
        </h3>
        <button onClick={() => setStyle(p => ({ ...p, isVisible: !p.isVisible }))} className={`p-1.5 rounded-md ${style.isVisible ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
           {style.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>

      <div className="space-y-3 bg-gray-900/50 p-4 rounded-xl border border-gray-700">
          <div className="space-y-1">
            <label className="text-[10px] text-gray-500 uppercase font-bold">Animation Type</label>
            <select value={style.animation} onChange={(e) => setStyle(p => ({ ...p, animation: e.target.value as TranscriptAnimation }))} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-gray-200">
                {Object.values(TranscriptAnimation).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold">Base Font Size</label>
              <input type="number" value={style.fontSize} onChange={(e) => setStyle(p => ({ ...p, fontSize: Number(e.target.value) }))} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-gray-200"/>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 uppercase font-bold">Font Family</label>
              <select value={style.fontFamily} onChange={(e) => setStyle(p => ({ ...p, fontFamily: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-gray-200">
                  {AVAILABLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-gray-500 uppercase font-bold flex items-center gap-1"><AlignLeft size={10}/> Alignment</label>
            <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
                {(['left', 'center', 'right'] as TextAlign[]).map((align) => (
                    <button key={align} onClick={() => setStyle(p => ({ ...p, textAlign: align }))} className={`flex-1 py-1.5 flex justify-center rounded transition-all ${style.textAlign === align ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                        {align === 'left' && <AlignLeft size={16} />}
                        {align === 'center' && <AlignCenter size={16} />}
                        {align === 'right' && <AlignRight size={16} />}
                    </button>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
             <div className="space-y-1">
                <label className="text-[8px] text-gray-500 uppercase font-bold">Text Color</label>
                <input type="color" value={style.textColor} onChange={(e) => setStyle(p => ({ ...p, textColor: e.target.value }))} className="w-full h-8 bg-transparent border-none cursor-pointer" />
             </div>
             <div className="space-y-1">
                <label className="text-[8px] text-gray-500 uppercase font-bold">Highlight</label>
                <input type="color" value={style.highlightColor} onChange={(e) => setStyle(p => ({ ...p, highlightColor: e.target.value }))} className="w-full h-8 bg-transparent border-none cursor-pointer" />
             </div>
             <div className="space-y-1">
                <label className="text-[8px] text-gray-500 uppercase font-bold">Box Color</label>
                <div className="relative h-8">
                   <input type="color" value={style.backgroundColor} onChange={(e) => setStyle(p => ({ ...p, backgroundColor: e.target.value }))} className="w-full h-full bg-transparent border-none cursor-pointer" />
                   <button onClick={() => setStyle(p => ({ ...p, backgroundColor: p.backgroundColor === 'transparent' ? '#000000' : 'transparent' }))} className={`absolute inset-0 flex items-center justify-center text-[8px] font-bold ${style.backgroundColor === 'transparent' ? 'bg-red-500/20 text-red-300' : 'bg-transparent text-transparent pointer-events-none'}`}>
                      {style.backgroundColor === 'transparent' && "HIDDEN"}
                   </button>
                </div>
             </div>
          </div>

          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-[10px] text-gray-500 uppercase font-bold">
                <span>Box Opacity</span>
                <span className="text-purple-400">{Math.round((style.backgroundOpacity ?? 0) * 100)}%</span>
            </div>
            <input type="range" min="0" max="1" step="0.01" value={style.backgroundOpacity ?? 0.5} onChange={e => setStyle(p => ({ ...p, backgroundOpacity: parseFloat(e.target.value) }))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-700">
            <label className="text-[10px] text-gray-500 uppercase font-bold flex items-center gap-1"><Move size={10}/> Position & Box Size</label>
            
            <div className="space-y-3">
               <div className="space-y-1">
                 <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>Vertical Position</span>
                    <span>{style.verticalPosition}%</span>
                 </div>
                 <input type="range" min="0" max="100" value={style.verticalPosition} onChange={e => setStyle(p => ({ ...p, verticalPosition: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
               </div>

               <div className="space-y-1">
                 <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>Horizontal Position</span>
                    <span>{style.horizontalPosition}%</span>
                 </div>
                 <input type="range" min="0" max="100" value={style.horizontalPosition} onChange={e => setStyle(p => ({ ...p, horizontalPosition: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                       <span>Box Width</span>
                       <span>{style.boxWidth}%</span>
                    </div>
                    <input type="range" min="10" max="100" value={style.boxWidth} onChange={e => setStyle(p => ({ ...p, boxWidth: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                       <span>Box Height</span>
                       <span>{style.boxHeight}%</span>
                    </div>
                    <input type="range" min="5" max="100" value={style.boxHeight} onChange={e => setStyle(p => ({ ...p, boxHeight: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                  </div>
               </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-700">
            <label className="text-[10px] text-gray-500 uppercase font-bold flex items-center gap-1">Text Padding & Spacing</label>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1">
                 <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>Top</span>
                    <span>{style.paddingTop}px</span>
                 </div>
                 <input type="range" min="0" max="150" value={style.paddingTop} onChange={e => setStyle(p => ({ ...p, paddingTop: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
               </div>
               <div className="space-y-1">
                 <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>Bottom</span>
                    <span>{style.paddingBottom}px</span>
                 </div>
                 <input type="range" min="0" max="150" value={style.paddingBottom} onChange={e => setStyle(p => ({ ...p, paddingBottom: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
               </div>
               <div className="space-y-1">
                 <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>Left</span>
                    <span>{style.paddingLeft}px</span>
                 </div>
                 <input type="range" min="0" max="150" value={style.paddingLeft} onChange={e => setStyle(p => ({ ...p, paddingLeft: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
               </div>
               <div className="space-y-1">
                 <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>Right</span>
                    <span>{style.paddingRight}px</span>
                 </div>
                 <input type="range" min="0" max="150" value={style.paddingRight} onChange={e => setStyle(p => ({ ...p, paddingRight: parseInt(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
               </div>
               <div className="col-span-2 space-y-1">
                 <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                    <span>Line Spacing</span>
                    <span>{style.lineHeight.toFixed(1)}x</span>
                 </div>
                 <input type="range" min="0.8" max="3.0" step="0.1" value={style.lineHeight} onChange={e => setStyle(p => ({ ...p, lineHeight: parseFloat(e.target.value) }))} className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
               </div>
            </div>
          </div>
      </div>
    </div>
  );

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 font-sans flex flex-col relative">
        <header className="p-6 flex justify-between items-center bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-3">
             <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-900/40">
                <Video size={24} className="text-white" />
             </div>
             <h1 className="text-xl font-bold tracking-tight">smartVoice gen</h1>
          </div>
          <button 
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-full font-semibold transition-all"
          >
            <LogIn size={18} /> Login
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="max-w-2xl space-y-6">
               <h2 className="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-500 pb-2">
                 smartVoice gen
               </h2>
               <p className="text-xl text-gray-400">
                 Harness the power of Gemini 2.5 Flash to create high-quality curriculum videos with professional AI narration, 
                 dynamic visuals, and multilingual support in seconds.
               </p>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
                  <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 hover:border-blue-500 transition-colors">
                      <Mic className="text-blue-500 mx-auto mb-4" size={32} />
                      <h3 className="font-bold text-lg">AI Voices</h3>
                      <p className="text-gray-500 text-sm">Professional narrators in multiple languages and genders.</p>
                  </div>
                  <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 hover:border-purple-500 transition-colors">
                      <User className="text-purple-500 mx-auto mb-4" size={32} />
                      <h3 className="font-bold text-lg">Voice Cloning</h3>
                      <p className="text-gray-500 text-sm">Upload a sample to generate audio that sounds just like you.</p>
                  </div>
                  <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 hover:border-pink-500 transition-colors">
                      <Layout className="text-pink-500 mx-auto mb-4" size={32} />
                      <h3 className="font-bold text-lg">Custom Styles</h3>
                      <p className="text-gray-500 text-sm">Dynamic subtitles, overlays, and professional transitions.</p>
                  </div>
               </div>
            </div>
        </main>

        {showLoginModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold">Secure Login</h3>
                <button onClick={() => setShowLoginModal(false)} className="text-gray-500 hover:text-white"><X /></button>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Username</label>
                  <input 
                    type="text" 
                    required
                    value={loginForm.username}
                    onChange={e => setLoginForm(p => ({ ...p, username: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 mt-1 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Password</label>
                  <input 
                    type="password" 
                    required
                    value={loginForm.password}
                    onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 mt-1 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {authError && <div className="text-red-400 text-sm flex items-center gap-2 mt-2"><ShieldAlert size={16}/> {authError}</div>}
                <button 
                  disabled={isAuthenticating}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 mt-4 flex justify-center items-center"
                >
                  {isAuthenticating ? <Sparkles className="animate-spin" /> : 'Sign In'}
                </button>
              </form>
            </div>
          </div>
        )}

        {notification && (
           <div className="fixed bottom-6 right-6 bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-xl animate-in slide-in-from-right-10 flex items-center gap-3 z-[100]">
              <Coffee size={20} />
              <span className="font-medium">{notification}</span>
           </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col md:flex-row font-sans relative">
      
      {notification && (
         <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-xl animate-in slide-in-from-top-10 flex items-center gap-3 z-[100]">
            <Coffee size={20} />
            <span className="font-medium">{notification}</span>
         </div>
      )}

      <aside className="w-full md:w-96 bg-gray-800 border-r border-gray-700 flex flex-col h-screen overflow-y-auto z-10">
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            smartVoice gen
          </h1>
          <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1"><User size={10}/> {currentUser.username} ({currentUser.role})</p>
        </div>

        <div className="flex border-b border-gray-700">
          <button 
            onClick={() => setActiveTab('voice')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'voice' ? 'bg-gray-700 text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:bg-gray-700/50'}`}
          >
            <Mic size={16} /> Content AI
          </button>
          <button 
            onClick={() => setActiveTab('visual')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'visual' ? 'bg-gray-700 text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:bg-gray-700/50'}`}
          >
            <Settings size={16} /> Video Style
          </button>
        </div>

        <div className="p-6 space-y-6">
          {activeTab === 'voice' && (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <Heading size={14} /> Video Title
                  </label>
                  <input 
                    type="text" 
                    value={videoState.secondaryText}
                    onChange={(e) => setVideoState(prev => ({ ...prev, secondaryText: e.target.value }))}
                    placeholder="Enter main video title..."
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Languages size={14} /> Voice Language
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(Language).map((lang) => (
                    <button key={lang} onClick={() => handleLanguageChange(lang)} className={`px-2 py-2 rounded text-xs border transition-colors ${voiceSettings.language === lang ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-gray-600 hover:border-gray-500 text-gray-300'}`}>
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {voiceSettings.language === Language.ENGLISH && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Accent</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['American', 'British'].map((acc) => (
                      <button key={acc} onClick={() => setVoiceSettings(p => ({ ...p, accent: acc }))} className={`px-2 py-1.5 rounded text-xs border transition-colors ${voiceSettings.accent === acc ? 'border-blue-500 bg-blue-500/20 text-blue-300' : 'border-gray-600 text-gray-400'}`}>
                        {acc}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4 pt-4 border-t border-gray-700">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <Sliders size={14} /> Voice Customization
                </label>
                <div className="space-y-4 bg-gray-900/40 p-3 rounded-lg border border-gray-700">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-500 uppercase font-bold">
                      <span>Speed</span>
                      <span className="text-blue-400">{voiceSettings.speed.toFixed(1)}x</span>
                    </div>
                    <input type="range" min="0.5" max="2.0" step="0.1" value={voiceSettings.speed} onChange={e => setVoiceSettings(p => ({ ...p, speed: parseFloat(e.target.value) }))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-500 uppercase font-bold">
                      <span>Stability</span>
                      <span className="text-blue-400">{Math.round(voiceSettings.stability * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={voiceSettings.stability} onChange={e => setVoiceSettings(p => ({ ...p, stability: parseFloat(e.target.value) }))} className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Gender & Voice</label>
                <div className="flex rounded bg-gray-700 p-1 mb-3">
                  {Object.values(VoiceGender).map((gender) => (
                      <button key={gender} onClick={() => handleGenderChange(gender)} className={`flex-1 py-1.5 text-sm rounded ${voiceSettings.gender === gender ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'}`}>{gender}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                      {GEMINI_VOICES[voiceSettings.gender].map(name => (
                          <button key={name} onClick={() => setVoiceSettings(p => ({ ...p, voiceName: name }))} className={`py-2 px-3 rounded text-sm flex items-center justify-between border ${voiceSettings.voiceName === name ? 'border-blue-500 bg-blue-500/20 text-white' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>
                              <span>{name}</span>
                              {voiceSettings.voiceName === name && <Check size={14} className="text-blue-400" />}
                          </button>
                      ))}
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-gray-700">
                <div className="flex justify-between items-end">
                    <label className="text-xs font-semibold text-gray-400 uppercase">Script Content</label>
                    <button onClick={handleTranslate} disabled={isTranslating || !videoState.text.trim()} className="text-xs flex items-center gap-1.5 text-blue-400"><Languages size={12} /> Translate</button>
                </div>
                <textarea value={videoState.text} onChange={handleTextChange} placeholder="Write your educational script here..." className="w-full h-48 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 outline-none focus:ring-1 focus:ring-blue-500" />
                <div className="flex justify-end mt-1">
                   <span className={`text-[10px] font-bold uppercase ${videoState.text.length > MAX_CHARS * 0.9 ? 'text-red-400' : 'text-gray-500'}`}>
                      Chars: {videoState.text.length} / {MAX_CHARS}
                   </span>
                </div>
              </div>
              <button onClick={handleGenerateAudio} disabled={videoState.isGeneratingAudio || !videoState.text || (currentUser.role === 'User' && !currentUser.customApiKey)} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all">
                {videoState.isGeneratingAudio ? 'Generating Voice...' : <><Mic size={16} /> Generate Narration</>}
              </button>
            </>
          )}

          {activeTab === 'visual' && (
            <div className="space-y-6 pb-20">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-400 uppercase">Aspect Ratio</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.values(AspectRatio).map((ratio) => (
                      <button key={ratio} onClick={() => setAspectRatio(ratio)} className={`py-2 text-xs rounded border ${aspectRatio === ratio ? 'border-purple-500 bg-purple-500/20 text-purple-300' : 'border-gray-600 text-gray-400'}`}>{ratio}</button>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase">Background Images ({videoState.images.length}/20)</label>
                    <div className="flex gap-2">
                       <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" id="img-upload" />
                       <label htmlFor="img-upload" className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded text-xs text-center cursor-pointer border border-gray-600">Upload Media</label>
                       {videoState.images.length > 0 && <button onClick={() => setVideoState(p => ({ ...p, images: [] }))} className="p-2 bg-red-900/20 text-red-400 rounded border border-red-900/50 hover:bg-red-900/30"><Trash2 size={14}/></button>}
                    </div>
                </div>

                {/* Subtitle Design Section */}
                <StyleAdjustmentGroup 
                  title="Subtitle" 
                  style={transcriptStyle} 
                  setStyle={setTranscriptStyle} 
                />

                {/* Title Design Section */}
                <StyleAdjustmentGroup 
                  title="Title" 
                  style={secondaryTextStyle} 
                  setStyle={setSecondaryTextStyle} 
                />
            </div>
          )}
        </div>
        
        {needsApiKey && (
           <div className="absolute inset-0 bg-black/90 z-[60] flex items-center justify-center p-6">
              <div className="bg-gray-800 border border-gray-700 p-8 rounded-3xl w-full text-center space-y-6 animate-in zoom-in-95">
                 <Key className="text-yellow-500 mx-auto" size={48} />
                 <div>
                    <h3 className="text-xl font-bold">API Key Required</h3>
                    <p className="text-gray-400 text-sm mt-2">Standard users must provide their own Gemini API key to proceed.</p>
                 </div>
                 <form onSubmit={handleApiKeySubmit} className="space-y-4">
                    <input 
                      type="password" 
                      placeholder="Paste Gemini API Key..." 
                      value={tempApiKey}
                      onChange={e => setTempApiKey(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-center"
                      required
                    />
                    <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl">Save Key & Start</button>
                    <button type="button" onClick={handleLogout} className="text-gray-500 text-sm hover:text-white">Cancel & Logout</button>
                 </form>
              </div>
           </div>
        )}
      </aside>

      <main className="flex-1 bg-gray-950 p-4 md:p-8 flex flex-col relative">
        <div className="absolute top-8 right-8 z-20 flex items-center gap-4">
           {currentUser.role === 'User' && currentUser.customApiKey && (
              <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 px-3 py-1.5 rounded-full text-xs text-green-400">
                <Check size={12}/> API Key Connected
              </div>
           )}
           <button onClick={handleLogout} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-full text-sm font-medium transition-all">
             <LogOut size={16} /> Logout
           </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <div className="relative w-full max-w-4xl aspect-video flex items-center justify-center bg-gray-900 rounded-2xl border border-gray-800 shadow-2xl p-4 overflow-hidden">
            <VideoEditor images={videoState.images} transcript={videoState.text} secondaryText={videoState.secondaryText} audioBuffer={videoState.audioBuffer} aspectRatio={aspectRatio} transcriptStyle={transcriptStyle} secondaryTextStyle={secondaryTextStyle} playbackSpeed={voiceSettings.speed} onVideoCreated={handleVideoCreated} isRecording={videoState.isRecordingVideo} setIsRecording={(val) => setVideoState(prev => ({ ...prev, isRecordingVideo: val }))} recordingMimeType={selectedFormat?.mime} />
          </div>
          <div className="w-full max-w-4xl flex items-center justify-between bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-400">
                {videoState.audioBuffer ? (
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={toggleAudioPreview}
                      className={`flex items-center justify-center w-10 h-10 rounded-full transition-all ${isPlayingPreview ? 'bg-red-500/20 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30'}`}
                      title={isPlayingPreview ? "Pause Preview" : "Play Preview"}
                    >
                      {isPlayingPreview ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <div className="flex flex-col">
                       <span className="text-green-400 font-semibold flex items-center gap-2">Narration Ready ({Math.round(videoState.audioBuffer.duration)}s)</span>
                       <span className="text-[10px] text-gray-500 uppercase tracking-tighter">Click to listen</span>
                    </div>
                    <div className="h-6 w-px bg-gray-700 mx-1"></div>
                    <div className="relative">
                      <button 
                        onClick={() => setShowAudioMenu(!showAudioMenu)}
                        className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      >
                        <FileAudio size={14} /> Save Audio <ChevronDown size={12} />
                      </button>
                      {showAudioMenu && (
                        <div className="absolute bottom-full mb-2 left-0 w-32 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-30 animate-in slide-in-from-bottom-2">
                          <button onClick={() => handleDownloadAudio('wav')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-800 border-b border-gray-800">WAV Format</button>
                          <button onClick={() => handleDownloadAudio('mp3')} className="w-full text-left px-4 py-2 text-xs hover:bg-gray-800">MP3 Format</button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-yellow-500 font-medium animate-pulse">
                    <AlertCircle size={14}/>
                    <span>Narration missing</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 items-center">
              {!generatedVideoUrl && selectedFormat && (
                  <div className="relative">
                    <select value={selectedFormat.mime} onChange={(e) => { const fmt = availableFormats.find(f => f.mime === e.target.value); if (fmt) setSelectedFormat(fmt); }} className="bg-gray-900 text-gray-300 text-xs border border-gray-600 rounded px-3 py-2 appearance-none pr-8 focus:ring-1 focus:ring-blue-500 outline-none">
                      {availableFormats.map(fmt => <option key={fmt.mime} value={fmt.mime}>{fmt.label}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
                  </div>
              )}
              {generatedVideoUrl ? (
                 <a href={generatedVideoUrl} download={`smartvoice-render.${selectedFormat?.ext || 'webm'}`} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2 shadow-lg shadow-green-900/20 transition-all">
                   <Download size={18} /> Export Video
                 </a>
              ) : (
                <button onClick={startVideoCreation} disabled={!videoState.audioBuffer || videoState.isRecordingVideo} className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-6 py-2 rounded-lg font-semibold flex items-center gap-2 shadow-lg shadow-purple-900/20 transition-all">
                  <Video size={18} /> {videoState.isRecordingVideo ? 'Exporting...' : 'Export Video'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
