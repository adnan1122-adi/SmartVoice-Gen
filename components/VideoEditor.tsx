
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { AspectRatio, TranscriptStyle, TranscriptAnimation } from '../types';

interface VideoEditorProps {
  images: string[]; // Array of base64 strings
  transcript: string;
  secondaryText: string;
  audioBuffer: AudioBuffer | null;
  aspectRatio: AspectRatio;
  transcriptStyle: TranscriptStyle;
  secondaryTextStyle: TranscriptStyle;
  playbackSpeed: number;
  onVideoCreated: (url: string) => void;
  isRecording: boolean;
  setIsRecording: (val: boolean) => void;
  recordingMimeType?: string;
}

const seededRandom = (seed: number) => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

const generateTextTimingMap = (text: string) => {
    const weights: number[] = [];
    let totalWeight = 0;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      let weight = 1; 
      
      if (['.', '!', '?', ':', ';'].includes(char)) weight = 12; 
      else if (char === ',') weight = 6; 
      else if (char === '\n') weight = 25; 
      else if (char === ' ') weight = 0; 
      else if (/[A-Z]/.test(char)) weight = 1.2; 
      else if (/[0-9]/.test(char)) weight = 1.5; 
      
      totalWeight += weight;
      weights.push(totalWeight);
    }
    
    return { weights, totalWeight };
};

const VideoEditor: React.FC<VideoEditorProps> = ({
  images,
  transcript,
  secondaryText,
  audioBuffer,
  aspectRatio,
  transcriptStyle,
  secondaryTextStyle,
  playbackSpeed,
  onVideoCreated,
  isRecording,
  setIsRecording,
  recordingMimeType
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1080, height: 1080 });
  const [loadedImages, setLoadedImages] = useState<HTMLImageElement[]>([]);
  
  const cleanTranscript = useMemo(() => {
      return transcript ? transcript : '';
  }, [transcript]);

  const { weights: timingWeights, totalWeight: textDurationWeight } = useMemo(
      () => generateTextTimingMap(cleanTranscript), 
      [cleanTranscript]
  );

  useEffect(() => {
    if (images.length === 0) {
        setLoadedImages([]);
        return;
    }

    let isMounted = true;
    
    Promise.all(images.map(src => new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.src = src;
    }))).then(imgs => {
        if (isMounted) setLoadedImages(imgs);
    });

    return () => { isMounted = false; };
  }, [images]);

  useEffect(() => {
    let width = 1080;
    let height = 1080;

    switch (aspectRatio) {
      case AspectRatio.PORTRAIT:
        width = 720;
        height = 1280;
        break;
      case AspectRatio.LANDSCAPE:
        width = 1280;
        height = 720;
        break;
      case AspectRatio.SQUARE:
      default:
        width = 1080;
        height = 1080;
        break;
    }
    setDimensions({ width, height });
  }, [aspectRatio]);

  const getWrappedLines = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxHeight: number,
    baseFontSize: number,
    fontFamily: string,
    lineHeightFactor: number
  ) => {
    let fontSize = baseFontSize;
    let lines: string[] = [];
    let lineStartIndices: number[] = [];
    let lineHeight = fontSize * lineHeightFactor;

    const MIN_FONT_SIZE = 10;

    while (fontSize >= MIN_FONT_SIZE) {
      ctx.font = `${fontSize}px ${fontFamily}`;
      lineHeight = fontSize * lineHeightFactor;
      lines = [];
      lineStartIndices = [];
      
      const paragraphs = text.split('\n');
      let currentGlobalIndex = 0;

      for (const para of paragraphs) {
        const words = para.split(' ');
        let currentLine = '';
        let lineStartIndex = currentGlobalIndex;

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const metrics = ctx.measureText(testLine);

          if (metrics.width > maxWidth) {
             if (currentLine === '') {
                 let subWord = '';
                 for (const char of word) {
                    if (ctx.measureText(subWord + char).width > maxWidth) {
                        lines.push(subWord);
                        lineStartIndices.push(lineStartIndex);
                        lineStartIndex += subWord.length;
                        subWord = char;
                    } else {
                        subWord += char;
                    }
                 }
                 currentLine = subWord;
             } else {
                lines.push(currentLine);
                lineStartIndices.push(lineStartIndex);
                lineStartIndex += currentLine.length + 1;
                currentLine = word;
             }
          } else {
            currentLine = testLine;
          }
        }
        lines.push(currentLine);
        lineStartIndices.push(lineStartIndex);
        currentGlobalIndex += para.length + 1;
      }

      const totalHeight = lines.length * lineHeight;
      if (totalHeight <= maxHeight || fontSize === MIN_FONT_SIZE) {
        break;
      }
      fontSize -= 1;
    }

    return { lines, lineStartIndices, fontSize, lineHeight };
  };

  const drawTextBlock = (
      ctx: CanvasRenderingContext2D,
      text: string, 
      style: TranscriptStyle,
      currentTime: number,
      totalDuration: number,
      isSecondary: boolean = false
  ) => {
      if (!text || !style.isVisible) return;

      ctx.save();
      
      // Reset text properties
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      const boxWidthPx = dimensions.width * (style.boxWidth / 100);
      const boxHeightPx = dimensions.height * (style.boxHeight / 100);
      const boxX = (dimensions.width - boxWidthPx) * (style.horizontalPosition / 100);
      const boxY = (dimensions.height - boxHeightPx) * (style.verticalPosition / 100);

      // Draw Background Box with adjustable transparency
      if (style.backgroundColor !== 'transparent') {
          ctx.save();
          ctx.globalAlpha = style.backgroundOpacity ?? 1;
          ctx.fillStyle = style.backgroundColor;
          ctx.fillRect(boxX, boxY, boxWidthPx, boxHeightPx);
          ctx.restore();
      }

      let charIndex = 0;
      if (!isSecondary && totalDuration > 0 && textDurationWeight > 0) {
          const rawProgress = Math.min(1, Math.max(0, currentTime / totalDuration));
          const targetWeight = rawProgress * textDurationWeight;
          const idx = timingWeights.findIndex(w => w >= targetWeight);
          charIndex = idx === -1 ? text.length : idx;
      } else {
          const progress = Math.min(1, Math.max(0, currentTime / totalDuration));
          charIndex = Math.floor(progress * text.length);
      }

      let activeWordStart = -1;
      let activeWordEnd = -1;
      let activeSentenceStart = -1;
      let activeSentenceEnd = -1;

      if (!isSecondary) {
          const sIndex = Math.min(charIndex, text.length - 1);
          let s = sIndex < 0 ? 0 : sIndex;
          while (s > 0 && text[s-1] !== ' ' && text[s-1] !== '\n') s--;
          let e = s;
          while (e < text.length && text[e] !== ' ' && text[e] !== '\n') e++;
          activeWordStart = s;
          activeWordEnd = e;

          const sentences = [];
          let boundaryRegex = /[^.!?\n]+(?:[.!?\n]+|$)/g;
          let match;
          while ((match = boundaryRegex.exec(text)) !== null) {
              sentences.push({ start: match.index, end: match.index + match[0].length });
          }
          const activeSentence = sentences.find(sent => charIndex >= sent.start && charIndex < sent.end);
          if (activeSentence) {
              activeSentenceStart = activeSentence.start;
              activeSentenceEnd = activeSentence.end;
          }
      }

      let processedText = text;
      if (!isSecondary && style.animation === TranscriptAnimation.SENTENCE) {
          processedText = text.replace(/([.!?])\s+/g, '$1\n').trim();
      }

      const pTop = style.paddingTop ?? 0;
      const pBottom = style.paddingBottom ?? 0;
      const pLeft = style.paddingLeft ?? 0;
      const pRight = style.paddingRight ?? 0;

      const availableWidth = Math.max(0, boxWidthPx - (pLeft + pRight));
      const availableHeight = Math.max(0, boxHeightPx - (pTop + pBottom));

      const { lines, lineStartIndices, fontSize, lineHeight } = getWrappedLines(
        ctx,
        processedText,
        availableWidth,
        availableHeight,
        style.fontSize,
        style.fontFamily,
        style.lineHeight || 1.2
      );

      // --- SUBTITLE PAGING LOGIC (MAX 2 LINES) ---
      let visibleLines = lines;
      let visibleIndices = lineStartIndices;

      if (!isSecondary && style.animation !== TranscriptAnimation.SLIDE_UP) {
          const linesPerPage = 2;
          const pages: { lines: string[], indices: number[], startChar: number, endChar: number }[] = [];
          
          for (let i = 0; i < lines.length; i += linesPerPage) {
              const pLines = lines.slice(i, i + linesPerPage);
              const pIndices = lineStartIndices.slice(i, i + linesPerPage);
              const startChar = pIndices[0];
              const endChar = (i + linesPerPage < lines.length) ? lineStartIndices[i + linesPerPage] : text.length + 1;
              pages.push({ lines: pLines, indices: pIndices, startChar, endChar });
          }

          const activePage = pages.find(p => charIndex >= p.startChar && charIndex < p.endChar) || pages[pages.length - 1];
          if (activePage) {
              visibleLines = activePage.lines;
              visibleIndices = activePage.indices;
          }
      }

      const totalTextHeight = visibleLines.length * lineHeight;
      let drawY = boxY + pTop + (availableHeight - totalTextHeight) / 2;
      if (totalTextHeight > availableHeight) drawY = boxY + pTop;

      if (!isSecondary && style.animation === TranscriptAnimation.SLIDE_UP) {
          const progress = Math.min(1, Math.max(0, currentTime / totalDuration));
          const fullHeight = lines.length * lineHeight;
          const scrollableHeight = Math.max(0, fullHeight - availableHeight);
          drawY = (boxY + pTop) - (scrollableHeight * progress);
          visibleLines = lines;
          visibleIndices = lineStartIndices;
      }

      // Clip text to box boundaries
      ctx.beginPath();
      ctx.rect(boxX, boxY, boxWidthPx, boxHeightPx);
      ctx.clip();

      visibleLines.forEach((line, i) => {
          const metrics = ctx.measureText(line);
          let drawX = boxX + pLeft; // Respect left padding
          
          if (style.textAlign === 'center') {
              drawX = boxX + pLeft + (availableWidth - metrics.width) / 2;
          } else if (style.textAlign === 'right') {
              drawX = boxX + boxWidthPx - pRight - metrics.width;
          }

          const currentLineY = drawY + i * lineHeight;
          const lineGlobalStart = visibleIndices[i];

          // Animation Logic
          if (!isSecondary && style.animation === TranscriptAnimation.SENTENCE) {
              const overlapStart = Math.max(lineGlobalStart, activeSentenceStart);
              const overlapEnd = Math.min(lineGlobalStart + line.length, activeSentenceEnd);

              if (overlapStart < overlapEnd && activeSentenceStart !== -1) {
                  ctx.fillStyle = style.highlightColor;
                  ctx.fillText(line, drawX, currentLineY);
              } else {
                  ctx.fillStyle = style.textColor;
                  ctx.fillText(line, drawX, currentLineY);
              }
          } 
          else if (!isSecondary && style.animation === TranscriptAnimation.KARAOKE) {
              const localCharIndex = charIndex - lineGlobalStart;
              const progressInLine = Math.min(line.length, Math.max(0, localCharIndex));
              const activePart = line.substring(0, progressInLine);
              const activeWidth = ctx.measureText(activePart).width;

              ctx.fillStyle = style.textColor;
              ctx.fillText(line, drawX, currentLineY);

              ctx.save();
              ctx.beginPath();
              ctx.rect(drawX, currentLineY, activeWidth, lineHeight);
              ctx.clip();
              ctx.fillStyle = style.highlightColor;
              ctx.fillText(line, drawX, currentLineY);
              ctx.restore();
          } 
          else if (!isSecondary && style.animation === TranscriptAnimation.SUBTITLE) {
              const overlapStart = Math.max(lineGlobalStart, activeWordStart);
              const overlapEnd = Math.min(lineGlobalStart + line.length, activeWordEnd);

              if (overlapStart < overlapEnd) {
                  const localStart = overlapStart - lineGlobalStart;
                  const localEnd = overlapEnd - lineGlobalStart;
                  const before = line.substring(0, localStart);
                  const active = line.substring(localStart, localEnd);
                  const beforeWidth = ctx.measureText(before).width;

                  ctx.fillStyle = style.textColor;
                  ctx.fillText(line, drawX, currentLineY);

                  ctx.fillStyle = style.highlightColor;
                  ctx.fillText(active, drawX + beforeWidth, currentLineY);
              } else {
                  ctx.fillStyle = style.textColor;
                  ctx.fillText(line, drawX, currentLineY);
              }
          }
          else if (!isSecondary && style.animation === TranscriptAnimation.TYPEWRITER) {
              const localVisibleLen = Math.max(0, charIndex - lineGlobalStart);
              const visibleText = line.substring(0, localVisibleLen);
              ctx.fillStyle = style.textColor;
              ctx.fillText(visibleText, drawX, currentLineY);
          }
          else if (!isSecondary && style.animation === TranscriptAnimation.BOUNCE) {
              const bounceY = Math.sin(currentTime * 10) * 10;
              ctx.fillStyle = style.highlightColor;
              ctx.fillText(line, drawX, currentLineY + bounceY);
          }
          else {
              ctx.fillStyle = (isSecondary || style.animation === TranscriptAnimation.STATIC) ? style.textColor : style.highlightColor;
              ctx.fillText(line, drawX, currentLineY);
          }
      });

      ctx.restore();
  };

  const drawFrame = (
      ctx: CanvasRenderingContext2D, 
      currentTime: number, 
      totalDuration: number
  ) => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      if (loadedImages.length > 0) {
        const SLIDE_DURATION = 4; 
        const slideIndex = Math.floor(currentTime / SLIDE_DURATION);
        const randImg = seededRandom(slideIndex * 123.45);
        const randAnim = seededRandom(slideIndex * 678.90);
        const imgIdx = Math.floor(randImg * loadedImages.length);
        const animType = Math.floor(randAnim * 6); 
        const img = loadedImages[imgIdx];
        
        if (img) {
            const progress = (currentTime % SLIDE_DURATION) / SLIDE_DURATION;
            let scale = 1.0;
            let translateX = 0; 
            let translateY = 0; 
            const ZOOM_FACTOR = 0.15; 
            const PAN_FACTOR = 0.10;  

            switch (animType) {
                case 0: scale = 1.0 + (progress * ZOOM_FACTOR); break;
                case 1: scale = (1.0 + ZOOM_FACTOR) - (progress * ZOOM_FACTOR); break;
                case 2: scale = 1.0 + ZOOM_FACTOR; translateX = -progress * PAN_FACTOR; break;
                case 3: scale = 1.0 + ZOOM_FACTOR; translateX = -PAN_FACTOR + (progress * PAN_FACTOR); break;
                case 4: scale = 1.0 + ZOOM_FACTOR; translateY = -progress * PAN_FACTOR; break;
                case 5: scale = 1.0 + ZOOM_FACTOR; translateY = -PAN_FACTOR + (progress * PAN_FACTOR); break;
            }

            const imgRatio = img.width / img.height;
            const canvasRatio = dimensions.width / dimensions.height;
            let renderW, renderH;
            if (imgRatio > canvasRatio) {
                renderH = dimensions.height;
                renderW = dimensions.height * imgRatio;
            } else {
                renderW = dimensions.width;
                renderH = dimensions.width / imgRatio;
            }
            const offsetX = (dimensions.width - renderW) / 2;
            const offsetY = (dimensions.height - renderH) / 2;

            ctx.save();
            ctx.translate(dimensions.width/2, dimensions.height/2);
            ctx.scale(scale, scale);
            ctx.translate(-dimensions.width/2, -dimensions.height/2);
            ctx.translate(translateX * dimensions.width, translateY * dimensions.height);
            ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
            ctx.restore();
        }
      } else {
         ctx.fillStyle = '#1f2937';
         ctx.fillRect(0, 0, dimensions.width, dimensions.height);
         ctx.fillStyle = '#374151';
         ctx.font = '48px Inter';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText('smartVoice gen', dimensions.width/2, dimensions.height/2);
      }

      if (secondaryText && secondaryTextStyle.isVisible) {
          drawTextBlock(ctx, secondaryText, secondaryTextStyle, currentTime, totalDuration, true);
      }

      if (cleanTranscript && transcriptStyle.isVisible) {
          drawTextBlock(ctx, cleanTranscript, transcriptStyle, currentTime, totalDuration, false);
      }
  };

  useEffect(() => {
    if (isRecording) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationId: number;
    const startTime = Date.now();
    const renderLoop = () => {
        const now = Date.now();
        let simTime = (now - startTime) / 1000;
        let maxDur = 10;
        if (audioBuffer) {
            maxDur = audioBuffer.duration / playbackSpeed;
            simTime = simTime % (maxDur + 1); 
            if (simTime > maxDur) simTime = maxDur; 
        } else {
            simTime = simTime % 20; 
        }
        drawFrame(ctx, simTime, maxDur);
        animationId = requestAnimationFrame(renderLoop);
    };
    renderLoop();
    return () => cancelAnimationFrame(animationId);
  }, [dimensions, loadedImages, cleanTranscript, secondaryText, transcriptStyle, secondaryTextStyle, isRecording, audioBuffer, playbackSpeed, timingWeights]);

  useEffect(() => {
    if (!isRecording || !audioBuffer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    let source: AudioBufferSourceNode | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let animationFrameId: number;
    const startRecording = async () => {
        try {
             if (audioCtx.state === 'suspended') await audioCtx.resume();
            const stream = (canvas as any).captureStream(30); 
            source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = playbackSpeed;
            const dest = audioCtx.createMediaStreamDestination();
            source.connect(dest);
            source.connect(audioCtx.destination);
            const combinedStream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
            let mimeType = recordingMimeType || 'video/webm';
            mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 5000000 });
            const chunks: BlobPart[] = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                onVideoCreated(URL.createObjectURL(blob));
                setIsRecording(false);
            };
            const ctx = canvas.getContext('2d');
            const startTime = audioCtx.currentTime;
            const actualDuration = audioBuffer.duration / playbackSpeed;
            const renderLoop = () => {
                if (!ctx) return;
                const elapsed = audioCtx.currentTime - startTime;
                drawFrame(ctx, elapsed, actualDuration);
                if (elapsed < actualDuration + 0.5) animationFrameId = requestAnimationFrame(renderLoop);
                else if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            };
            mediaRecorder.start();
            source.start();
            renderLoop();
            source.onended = () => { setTimeout(() => { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); }, 500); };
        } catch (e) { setIsRecording(false); }
    };
    startRecording();
    return () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (source) try { source.stop(); } catch (e) {}
        if (audioCtx.state !== 'closed') audioCtx.close();
    };
  }, [isRecording]); 

  return (
    <div className="w-full h-full flex items-center justify-center bg-black/50 rounded-lg overflow-hidden border border-gray-700 relative">
        <canvas ref={canvasRef} width={dimensions.width} height={dimensions.height} className="max-w-full max-h-full object-contain shadow-2xl" />
         {isRecording && (
            <div className="absolute top-4 right-4 flex items-center space-x-2 bg-red-600 px-3 py-1 rounded-full animate-pulse z-50">
                <div className="w-3 h-3 bg-white rounded-full"></div>
                <span className="text-white font-bold text-xs">RECORDING</span>
            </div>
        )}
    </div>
  );
};

export default VideoEditor;
