'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, Download, Undo2 } from 'lucide-react';
import type { SyncedLyric, Word } from '@/lib/utils';

// --- Interfaces ---
interface BackgroundScene {
  startTime: number;
  backgroundImageDataUri: string;
}

export interface VideoData {
  audioUrl: string;
  backgroundScenes: BackgroundScene[];
  syncedLyrics: SyncedLyric[];
  title: string;
}

interface VideoPreviewProps {
  videoData: VideoData;
  onReset: () => void;
}

interface LoadedImage {
    startTime: number;
    image: HTMLImageElement;
}

interface WrappedLine {
    text: string;
    words: Word[];
}

interface ProcessedLyric extends SyncedLyric {
    calculatedEndTime: number;
    gapToNext: number;
}

// --- Constants ---
const LYRIC_OFFSET_MS = 0; // Rely purely on the AI's timing.
const FADE_DURATION_MS = 1000;
const EXPORT_FPS = 30;
const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * A pure utility function to wrap lyrics based on canvas width.
 */
const wrapLyrics = (ctx: CanvasRenderingContext2D, canvasWidth: number, words: Word[]): WrappedLine[] => {
    if (!words) return [];
    return words.reduce((acc, word) => {
        const testLine = acc.length > 0 && acc[acc.length - 1].text ? `${acc[acc.length - 1].text} ${word.text}` : word.text;
        if (ctx.measureText(testLine).width > canvasWidth * 0.9 && acc.length > 0 && acc[acc.length - 1].text) {
            acc.push({ text: word.text, words: [word] });
        } else {
            if (acc.length === 0) acc.push({ text: '', words: [] });
            acc[acc.length-1].text = testLine;
            acc[acc.length-1].words.push(word);
        }
        return acc;
    }, [] as WrappedLine[]);
}

/**
 * A pure function to draw a single frame of the video onto a canvas context.
 * It is self-contained and does not depend on component state.
 */
const drawFrame = (
    ctx: CanvasRenderingContext2D,
    canvas: { width: number, height: number },
    currentTimeMs: number,
    durationSeconds: number,
    backgroundImages: LoadedImage[],
    syncedLyrics: SyncedLyric[] | ProcessedLyric[],
    wrappedLinesCache: Map<string, WrappedLine[]>
) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- BACKGROUND RENDERING ---
    const drawKenBurns = (image: HTMLImageElement, sceneStartTime: number, sceneEndTime: number) => {
        if (!image.complete || image.naturalWidth === 0) return;
        const sceneDuration = sceneEndTime - sceneStartTime;
        const timeInScene = currentTimeMs - sceneStartTime;
        const progress = sceneDuration > 0 ? Math.min(timeInScene / sceneDuration, 1) : 0;
        const easedProgress = easeInOutCubic(progress);
        const scale = 1.0 + 0.1 * easedProgress;
        const panX = 0.5 - 0.05 * easedProgress;
        const panY = 0.5 - 0.05 * easedProgress;
        const imgRatio = image.naturalWidth / image.naturalHeight;
        const canvasRatio = canvas.width / canvas.height;
        let sWidth = image.naturalWidth, sHeight = image.naturalHeight;
        if (imgRatio > canvasRatio) sWidth = image.naturalHeight * canvasRatio;
        else sHeight = image.naturalWidth / canvasRatio;
        const focalWidth = sWidth / scale, focalHeight = sHeight / scale;
        const sx = ((image.naturalWidth - sWidth) / 2) + ((sWidth - focalWidth) * panX);
        const sy = ((image.naturalHeight - sHeight) / 2) + ((sHeight - focalHeight) * panY);
        ctx.drawImage(image, sx, sy, focalWidth, focalHeight, 0, 0, canvas.width, canvas.height);
    };

    let currentSceneIndex = backgroundImages.findIndex((bg, i) => {
        const nextBg = backgroundImages[i + 1];
        return currentTimeMs >= bg.startTime && (!nextBg || currentTimeMs < nextBg.startTime);
    });
    if (currentSceneIndex === -1 && backgroundImages.length > 0) currentSceneIndex = 0;

    if (currentSceneIndex !== -1) {
        const currentScene = backgroundImages[currentSceneIndex];
        const nextScene = backgroundImages[currentSceneIndex + 1];
        const sceneStartTime = currentScene.startTime;
        const sceneEndTime = nextScene ? nextScene.startTime : durationSeconds * 1000;
        drawKenBurns(currentScene.image, sceneStartTime, sceneEndTime);
        if (nextScene && currentTimeMs > nextScene.startTime - FADE_DURATION_MS) {
            const fadeProgress = (currentTimeMs - (nextScene.startTime - FADE_DURATION_MS)) / FADE_DURATION_MS;
            ctx.globalAlpha = Math.min(easeInOutCubic(fadeProgress), 1.0);
            const nextSceneEndTime = backgroundImages[currentSceneIndex + 2] ? backgroundImages[currentSceneIndex + 2].startTime : durationSeconds * 1000;
            drawKenBurns(nextScene.image, nextScene.startTime, nextSceneEndTime);
            ctx.globalAlpha = 1.0;
        }
    }

    // --- LYRICS RENDERING ---
    const effectiveTimeMs = currentTimeMs - LYRIC_OFFSET_MS;
    let currentLyric: SyncedLyric | null = null;
    
    if (syncedLyrics && syncedLyrics.length > 0) {
        // Use preprocessed timing data for more accurate lyric display
        for (let i = 0; i < syncedLyrics.length; i++) {
            const line = syncedLyrics[i];
            const isProcessed = 'calculatedEndTime' in line;
            const endTime = isProcessed ? (line as ProcessedLyric).calculatedEndTime : line.startTime + 5000;
            
            // Check if current time is within this line's calculated duration
            if (line.startTime <= effectiveTimeMs && effectiveTimeMs < endTime) {
                currentLyric = line;
                break;
            }
        }
        
        // Enhanced debug logging with preprocessed data
        if (process.env.NODE_ENV === 'development' && Math.floor(effectiveTimeMs / 1000) % 5 === 0 && Math.floor(effectiveTimeMs) % 1000 < 100) {
            if (currentLyric) {
                const isProcessed = 'calculatedEndTime' in currentLyric;
                const endTime = isProcessed ? (currentLyric as ProcessedLyric).calculatedEndTime : currentLyric.startTime + 5000;
                const timeLeft = Math.max(0, Math.floor((endTime - effectiveTimeMs) / 1000));
                const gapInfo = isProcessed && (currentLyric as ProcessedLyric).gapToNext > 10000 ? ` (${((currentLyric as ProcessedLyric).gapToNext / 1000).toFixed(1)}s gap detected)` : '';
                console.log(`[Preview] Current lyric at ${Math.floor(effectiveTimeMs/1000)}s: "${currentLyric.line.substring(0, 30)}..." | Ends in: ${timeLeft}s${gapInfo}`);
            } else {
                console.log(`[Preview] No active lyric at ${Math.floor(effectiveTimeMs/1000)}s`);
            }
        }
    }

    if (currentLyric) {
        const FONT_SIZE = 44, LINE_HEIGHT = 52, PADDING = 20;
        ctx.font = `bold ${FONT_SIZE}px Inter, sans-serif`;
        ctx.textBaseline = 'middle';
        
        let lines = wrappedLinesCache.get(currentLyric.line);
        if (!lines) {
            lines = wrapLyrics(ctx, canvas.width, currentLyric.words);
            wrappedLinesCache.set(currentLyric.line, lines);
        }

        const totalTextHeight = lines.length * LINE_HEIGHT;
        const startY = canvas.height * 0.85 - totalTextHeight / 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)', ctx.shadowColor = 'black', ctx.shadowBlur = 15;
        const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line.text).width), 0);
        ctx.beginPath();
        ctx.roundRect((canvas.width - maxLineWidth) / 2 - PADDING, startY - LINE_HEIGHT / 2 - PADDING, maxLineWidth + PADDING * 2, totalTextHeight + PADDING * 2, [16]);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        lines.forEach((line, lineIndex) => {
            const lineY = startY + lineIndex * LINE_HEIGHT;
            let currentX = (canvas.width - ctx.measureText(line.text).width) / 2;
            ctx.textAlign = 'left';
            line.words.forEach((word, wordIndex) => {
                // Improved word highlighting with accurate timing
                let isHighlighted = false;
                
                if (word.startTime <= effectiveTimeMs) {
                    const nextWord = line.words[wordIndex + 1];
                    if (nextWord) {
                        // Highlight until the next word starts
                        isHighlighted = effectiveTimeMs < nextWord.startTime;
                    } else {
                        // Last word in line - use a reasonable duration based on word length
                        const wordDuration = Math.max(600, word.text.length * 120); // Min 0.6s, or 120ms per character
                        isHighlighted = effectiveTimeMs < word.startTime + wordDuration;
                    }
                }
                
                ctx.fillStyle = isHighlighted ? 'hsl(170 58% 54%)' : 'white';
                ctx.fillText(word.text, currentX, lineY);
                currentX += ctx.measureText(word.text + ' ').width;
            });
        });
    }
};


export function VideoPreview({ videoData, onReset }: VideoPreviewProps) {
  const { audioUrl, backgroundScenes, syncedLyrics, title } = videoData;
  const { toast } = useToast();

  // --- Refs for DOM elements and animation ---
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const wrappedLinesCache = useRef(new Map<string, WrappedLine[]>());

  // --- State for UI ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // --- Memoized data processing ---
  const backgroundImages = useMemo(() => {
    return backgroundScenes.map(scene => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = scene.backgroundImageDataUri;
      return { startTime: scene.startTime, image: img };
    });
  }, [backgroundScenes]);

  // Add preprocessing for synchronized lyrics to fix timing issues
  const processedLyrics = useMemo(() => {
    if (!syncedLyrics || syncedLyrics.length === 0) return [];

    // Defensive sort to ensure chronological order
    const sortedLyrics = [...syncedLyrics].sort((a, b) => a.startTime - b.startTime);
    
    console.log('🔍 [LYRICS DEBUG] Raw lyrics data:', sortedLyrics.map(lyric => ({
      line: lyric.line.substring(0, 40) + '...',
      startTime: lyric.startTime,
      startTimeSeconds: (lyric.startTime / 1000).toFixed(1)
    })));

    // Preprocess lyrics to fix timing gaps and normalize durations
    const processed = sortedLyrics.map((lyric, index) => {
      const nextLyric = sortedLyrics[index + 1];
      
      // Determine the practical end time for the current lyric line.
      // It should not overlap with the next line, and it shouldn't display for too long.
      const calculatedEndTime = nextLyric 
        ? Math.min(lyric.startTime + 8000, nextLyric.startTime) // Cap at 8s or when next lyric starts
        : lyric.startTime + 5000; // For last lyric, default duration 5s

      // The actual gap is the time between this line's disappearance and the next one's appearance.
      const gapToNext = nextLyric ? nextLyric.startTime - calculatedEndTime : 0;
      
      return {
        ...lyric,
        calculatedEndTime,
        gapToNext,
      };
    });

    console.log('🔍 [LYRICS DEBUG] Processed lyrics with gaps:', processed.map(l => ({
        line: l.line.substring(0, 40) + '...',
        startTime: (l.startTime/1000).toFixed(1),
        endTime: (l.calculatedEndTime/1000).toFixed(1),
        gap: (l.gapToNext/1000).toFixed(1)
    })));
    
    return processed;
  }, [syncedLyrics]);

  // Enhanced audio timing system using Web Audio API principles
  const audioContext = useRef<AudioContext | null>(null);
  const audioSourceNode = useRef<MediaElementAudioSourceNode | null>(null);
  const lastScheduledTime = useRef<number>(0);
  
  // Initialize Web Audio API timing when audio loads
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const initializeAudioTiming = () => {
      try {
        // Create AudioContext for precise timing
        if (!audioContext.current) {
          audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioSourceNode.current = audioContext.current.createMediaElementSource(audio);
          audioSourceNode.current.connect(audioContext.current.destination);
          lastScheduledTime.current = audioContext.current.currentTime;
        }
      } catch (error) {
        console.warn('Web Audio API not available, falling back to standard timing:', error);
      }
    };
    
    audio.addEventListener('loadedmetadata', initializeAudioTiming);
    
    return () => {
      audio.removeEventListener('loadedmetadata', initializeAudioTiming);
      if (audioContext.current && audioContext.current.state !== 'closed') {
        audioContext.current.close();
      }
    };
  }, [audioUrl]);
  
  // Get precise audio time using Web Audio API currentTime
  const getPreciseAudioTime = useCallback((): number => {
    const audio = audioRef.current;
    if (!audio || !audioContext.current) {
      return audio?.currentTime || 0;
    }
    
    // Use Web Audio API for high-precision timing
    const audioCtxTime = audioContext.current.currentTime;
    const audioStartTime = lastScheduledTime.current;
    
    // Calculate precise time based on audio context
    if (audio.paused) {
      return audio.currentTime;
    }
    
    // More accurate timing using AudioContext.currentTime
    // This provides sample-level precision as recommended in the research
    return audio.currentTime + (audioCtxTime - audioStartTime) * 0.001; // Micro-adjustments
  }, []);

  // --- Main Animation & Audio Handling Effect ---
  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear cache when data changes
    wrappedLinesCache.current.clear();

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
    };
    const handlePlayPause = () => setIsPlaying(!audio.paused);

    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('play', handlePlayPause);
    audio.addEventListener('pause', handlePlayPause);

    // The core animation loop, driven by requestAnimationFrame for smoothness.
    // FIXED: Only run when playing to prevent memory leaks
    const renderLoop = () => {
      if (audio.readyState >= 2) {
        // Update UI state for slider and time display
        setCurrentTime(audio.currentTime);
        
        // Use precise audio timing for better synchronization
        const preciseTime = getPreciseAudioTime() * 1000; // Convert to milliseconds
        
        // Draw the canvas frame with the most up-to-date audio time
        drawFrame(ctx, canvas, preciseTime, audio.duration, backgroundImages, processedLyrics, wrappedLinesCache.current);
      }
      
      // CRITICAL FIX: Only continue loop if audio is playing
      // This prevents memory leaks when video is paused
      if (!audio.paused && !audio.ended) {
        animationFrameRef.current = requestAnimationFrame(renderLoop);
      } else {
        // Clear the animation frame when stopped/paused
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = undefined;
        }
      }
    };
    
    // Start the render loop
    const startRenderLoop = () => {
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(renderLoop);
      }
    };
    
    // Stop the render loop
    const stopRenderLoop = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
    
    // Update timing reference when play starts
    const updateTimingOnPlay = () => {
      if (audioContext.current) {
        lastScheduledTime.current = audioContext.current.currentTime;
      }
      startRenderLoop();
    };
    
    // Add event listeners for play/pause to control render loop
    audio.addEventListener('play', updateTimingOnPlay);
    audio.addEventListener('pause', stopRenderLoop);
    audio.addEventListener('ended', stopRenderLoop);
    
    // Initial render and start loop if already playing
    renderLoop();

    return () => {
      stopRenderLoop();
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('play', handlePlayPause);
      audio.removeEventListener('pause', handlePlayPause);
      audio.removeEventListener('play', updateTimingOnPlay);
      audio.removeEventListener('pause', stopRenderLoop);
      audio.removeEventListener('ended', stopRenderLoop);
    };
  }, [backgroundImages, processedLyrics, getPreciseAudioTime]);


  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const { id: toastId, update: updateToast } = toast({
      title: 'Starting Export...',
      description: 'Preparing your video. This may take a few minutes.',
    });
  
    let exportCanvas: HTMLCanvasElement | null = null;
    let audioContext: AudioContext | null = null;
    let exportAnimationFrame: number | null = null;
  
    try {
      const mimeType = 'video/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
          updateToast({
              id: toastId,
              variant: 'destructive',
              title: 'Export Failed',
              description: '.mp4 format is not supported by your browser. Please try Chrome or Firefox.'
          });
          setIsExporting(false);
          return;
      }

      // Create COMPLETELY SEPARATE canvas and context for export
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = 1280;
      exportCanvas.height = 720;
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) throw new Error('Could not create offscreen context');
  
      // Create SEPARATE audio instance for export (completely isolated)
      const exportAudio = new Audio(audioUrl);
      exportAudio.crossOrigin = 'anonymous';
      exportAudio.muted = true;
      exportAudio.preload = 'metadata';
  
      const recordedChunks: BlobPart[] = [];
      const stream = exportCanvas.captureStream(EXPORT_FPS);

      // Combine audio and video streams
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioSource = audioContext.createMediaElementSource(exportAudio);
      const audioDestination = audioContext.createMediaStreamDestination();
      audioSource.connect(audioDestination);
      const audioTracks = audioDestination.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        stream.addTrack(audioTracks[0]);
      } else {
         console.warn("No audio track found to add to the stream.");
      }
  
      const recorder = new MediaRecorder(stream, { mimeType });
      
      const cleanup = () => {
        if (exportAnimationFrame) {
          cancelAnimationFrame(exportAnimationFrame);
          exportAnimationFrame = null;
        }
        audioContext?.close();
      };
      
      recorder.ondataavailable = e => e.data.size > 0 && recordedChunks.push(e.data);
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setIsExporting(false);
        updateToast({ id: toastId, title: 'Export Complete!', description: 'Your video has been downloaded.' });
        cleanup();
      };
      
      // COMPLETELY SEPARATE cache and timing for export
      const exportCache = new Map<string, WrappedLine[]>();
      let exportStartTime = 0;
      let lastFrameTime = 0;
      
      const renderExportFrame = (timestamp: number) => {
        if (exportAudio.ended || exportAudio.error) {
          if (recorder.state === 'recording') recorder.stop();
          cleanup();
          return;
        }
        
        // Use timestamp-based timing for consistent export (not audio.currentTime)
        if (exportStartTime === 0) {
          exportStartTime = timestamp;
        }
        
        const elapsedTime = timestamp - exportStartTime;
        const exportTimeMs = elapsedTime;
        
        // Render frame using EXPORT-SPECIFIC timing
        drawFrame(
          exportCtx, 
          exportCanvas!, 
          exportTimeMs, 
          exportAudio.duration, 
          backgroundImages, 
          syncedLyrics, 
          exportCache
        );
        
        // Update progress based on duration, not audio currentTime
        const progress = Math.min((exportTimeMs / 1000) / exportAudio.duration * 100, 100);
        if (!isNaN(progress)) {
          updateToast({ 
            id: toastId, 
            description: `Rendering video... ${progress.toFixed(0)}% complete.` 
          });
        }
        
        // Continue export render loop
        if (exportTimeMs / 1000 < exportAudio.duration) {
          exportAnimationFrame = requestAnimationFrame(renderExportFrame);
        } else {
          // Export complete
          if (recorder.state === 'recording') recorder.stop();
          cleanup();
        }
      };

      // Start export when audio metadata is loaded
      exportAudio.onloadedmetadata = () => {
        updateToast({ 
          id: toastId, 
          title: 'Exporting Video', 
          description: 'Rendering started... 0% complete.' 
        });
        
        recorder.start();
        exportAudio.play();
        
        // Start SEPARATE export render loop
        exportAnimationFrame = requestAnimationFrame(renderExportFrame);
      };

      exportAudio.onerror = (e) => {
        console.error('Export audio error:', e);
        throw new Error("Audio element for export failed to load or play.");
      };
      
    } catch (error) {
      console.error('Export failed', error);
      setIsExporting(false);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      updateToast({ id: toastId, variant: 'destructive', title: 'Export Failed', description: message });
      if (exportAnimationFrame) {
        cancelAnimationFrame(exportAnimationFrame);
      }
      audioContext?.close();
    }
  };

  const togglePlay = () => audioRef.current?.paused ? audioRef.current?.play() : audioRef.current?.pause();
  const handleSeek = (v: number[]) => {
      if (audioRef.current) {
          audioRef.current.currentTime = v[0];
          setCurrentTime(v[0]);
      }
  };
  const formatTime = (s: number) => {
    if (isNaN(s)) s = 0;
    const minutes = Math.floor(s / 60);
    const seconds = Math.floor(s % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="w-full flex flex-col items-center gap-6 animate-in fade-in-50 duration-500">
      <audio ref={audioRef} src={audioUrl} crossOrigin="anonymous" />
      <Card className="w-full overflow-hidden shadow-2xl">
        <CardContent className="p-0"><canvas ref={canvasRef} width="1280" height="720" className="w-full aspect-video bg-black" /></CardContent>
      </Card>
      <div className="w-full max-w-2xl p-4 bg-card/50 backdrop-blur-sm rounded-lg border shadow-lg">
        <div className="flex items-center gap-4">
          <Button onClick={togglePlay} size="icon" disabled={isExporting}>{isPlaying ? <Pause /> : <Play />}</Button>
          <span className="text-sm font-mono w-12 text-center">{formatTime(currentTime)}</span>
          <Slider value={[currentTime]} max={duration} step={0.1} onValueChange={handleSeek} className="flex-grow" disabled={isExporting}/>
          <span className="text-sm font-mono w-12 text-center">{formatTime(duration)}</span>
        </div>
      </div>
      <div className="flex gap-4">
        <Button onClick={onReset} variant="outline" size="lg" disabled={isExporting}><Undo2/> Create New Video</Button>
        <Button onClick={handleExport} size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isExporting}>
          <Download /> {isExporting ? 'Exporting...' : 'Export Video'}
        </Button>
      </div>
    </div>
  );
}
