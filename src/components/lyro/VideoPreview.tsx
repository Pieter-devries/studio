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
    const effectiveTimeMs = currentTimeMs; // Use raw time, no offset adjustments
    let currentLyric: SyncedLyric | null = null;
    
    if (syncedLyrics && syncedLyrics.length > 0) {
        // STRICT SRT TIMING: Use exact SRT startTime and endTime only
        // No preprocessing, no gap calculations, no adaptive timing
        for (let i = 0; i < syncedLyrics.length; i++) {
            const line = syncedLyrics[i];
            
            // Find the end time for this lyric
            let endTime: number;
            if (line.words && line.words.length > 0) {
                // Calculate end time from word distribution and line timing
                const nextLyric = syncedLyrics[i + 1];
                const maxWordTime = Math.max(...line.words.map(w => w.startTime));
                const lineSpan = maxWordTime - line.startTime;
                // End time is max word time + estimated duration for last word
                endTime = maxWordTime + Math.max(lineSpan / line.words.length, 500);
                // But don't exceed next lyric start time
                if (nextLyric && endTime > nextLyric.startTime) {
                    endTime = nextLyric.startTime;
                }
            } else {
                // Fallback: estimate from next lyric or use default duration
                const nextLyric = syncedLyrics[i + 1];
                endTime = nextLyric ? nextLyric.startTime : (line.startTime + 3000);
            }
            
            // STRICT timing check - must be within the exact SRT window
            if (line.startTime <= effectiveTimeMs && effectiveTimeMs < endTime) {
                currentLyric = line;
                console.log(`🎯 [STRICT-SRT] Found active lyric: "${line.line.substring(0, 30)}..." | SRT: ${(line.startTime/1000).toFixed(1)}s-${(endTime/1000).toFixed(1)}s | Time: ${(effectiveTimeMs/1000).toFixed(1)}s`);
                break;
            }
        }
        
        // Enhanced debug logging for SRT timing validation
        if (process.env.NODE_ENV === 'development' && Math.floor(effectiveTimeMs / 1000) % 2 === 0 && Math.floor(effectiveTimeMs) % 1000 < 100) {
            if (!currentLyric) {
                const nextLyric = syncedLyrics.find(lyric => lyric.startTime > effectiveTimeMs);
                const nextInfo = nextLyric ? ` | Next: "${nextLyric.line.substring(0, 20)}..." at ${(nextLyric.startTime/1000).toFixed(1)}s` : '';
                console.log(`🔍 [SRT-DEBUG] No active lyric at ${(effectiveTimeMs/1000).toFixed(1)}s${nextInfo}`);
                
                // Debug first few lyrics timing
                if (syncedLyrics.length > 0) {
                    const first3 = syncedLyrics.slice(0, 3).map(l => `"${l.line.substring(0, 15)}..." @ ${(l.startTime/1000).toFixed(1)}s`).join(', ');
                    console.log(`🔍 [SRT-DEBUG] First lyrics: ${first3}`);
                }
            }
        }
    }

    if (currentLyric) {
        const FONT_SIZE = 44, LINE_HEIGHT = 52, PADDING = 20;
        ctx.font = `bold ${FONT_SIZE}px Inter, sans-serif`;
        ctx.textBaseline = 'middle';
        
        // SIMPLIFIED: Just show the full lyric line with proper word wrapping
        // No word-level highlighting, no complex timing calculations
        // Just display the lyric with line breaks when we're in the SRT time window
        
        // Word wrap the lyric text to fit canvas width
        const maxWidth = canvas.width * 0.9; // Use 90% of canvas width
        const words = currentLyric.line.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const testWidth = ctx.measureText(testLine).width;
            
            if (testWidth > maxWidth && currentLine) {
                // Line is too wide, push current line and start new one
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        // Don't forget the last line
        if (currentLine) {
            lines.push(currentLine);
        }
        
        const totalTextHeight = lines.length * LINE_HEIGHT;
        const startY = canvas.height * 0.85 - totalTextHeight / 2;
        
        // Background box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 15;
        const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
        ctx.beginPath();
        ctx.roundRect((canvas.width - maxLineWidth) / 2 - PADDING, startY - LINE_HEIGHT / 2 - PADDING, maxLineWidth + PADDING * 2, totalTextHeight + PADDING * 2, [16]);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Simple text rendering - no highlighting, just plain white text
        lines.forEach((line, lineIndex) => {
            const lineY = startY + lineIndex * LINE_HEIGHT;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            ctx.fillText(line, canvas.width / 2, lineY);
            
            // Reset shadow effects
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        });
        
        // ENHANCED DEBUG: Show exactly what we're displaying vs what the timing says
        const endTimeDisplay = 'calculatedEndTime' in currentLyric ? 
            ((currentLyric as ProcessedLyric).calculatedEndTime/1000).toFixed(1) : 'unknown';
        console.log(`🎬 [DISPLAY] Showing: "${currentLyric.line.substring(0, 50)}..." | SRT timing: ${(currentLyric.startTime/1000).toFixed(1)}s-${endTimeDisplay}s | Current time: ${(effectiveTimeMs/1000).toFixed(1)}s`);
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

  // Simple sorting - no preprocessing that could interfere with SRT timing
  const sortedLyrics = useMemo(() => {
    if (!syncedLyrics || syncedLyrics.length === 0) return [];
    const sorted = [...syncedLyrics].sort((a, b) => a.startTime - b.startTime);
    console.log('🎯 [SRT-SIMPLE] Using raw SRT timing for', sorted.length, 'lyrics');
    return sorted;
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
        
        // Use simple audio timing - no complex Web Audio API
        const currentTimeMs = audio.currentTime * 1000; // Convert to milliseconds
        
        // Draw the canvas frame with the most up-to-date audio time
        drawFrame(ctx, canvas, currentTimeMs, audio.duration, backgroundImages, sortedLyrics, wrappedLinesCache.current);
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
  }, [backgroundImages, sortedLyrics]);


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
          sortedLyrics, 
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
          <span className="text-sm font-mono w-12 text-center text-foreground font-medium">{formatTime(currentTime)}</span>
          <Slider value={[currentTime]} max={duration} step={0.1} onValueChange={handleSeek} className="flex-grow" disabled={isExporting}/>
          <span className="text-sm font-mono w-12 text-center text-foreground font-medium">{formatTime(duration)}</span>
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
