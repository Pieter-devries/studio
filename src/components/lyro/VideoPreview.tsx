
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

// --- Constants ---
const LYRIC_OFFSET_MS = 500;
const FADE_DURATION_MS = 1000;
const EXPORT_FPS = 25;
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
    syncedLyrics: SyncedLyric[],
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
    if (syncedLyrics) {
        for (let i = syncedLyrics.length - 1; i >= 0; i--) {
            const currentLine = syncedLyrics[i];
            const nextLine = syncedLyrics[i+1];
            if (currentLine.startTime <= effectiveTimeMs && (!nextLine || nextLine.startTime > effectiveTimeMs)) {
                currentLyric = currentLine;
                break;
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
            line.words.forEach(word => {
                ctx.fillStyle = effectiveTimeMs >= word.startTime ? 'hsl(170 58% 54%)' : 'white';
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
    const renderLoop = () => {
      if (audio.readyState >= 2) {
        // Update UI state for slider and time display
        setCurrentTime(audio.currentTime);
        // Draw the canvas frame with the most up-to-date audio time
        drawFrame(ctx, canvas, audio.currentTime * 1000, audio.duration, backgroundImages, syncedLyrics, wrappedLinesCache.current);
      }
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };
    
    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animationFrameRef.current!);
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('play', handlePlayPause);
      audio.removeEventListener('pause', handlePlayPause);
    };
  }, [backgroundImages, syncedLyrics]);


  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    const { id: toastId, update: updateToast } = toast({
      title: 'Starting Export...',
      description: 'Preparing your video. This may take a few minutes.',
    });
  
    let exportCanvas: HTMLCanvasElement | null = null;
    let audioContext: AudioContext | null = null;
    let renderInterval: ReturnType<typeof setInterval> | null = null;
  
    try {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = 1280;
      exportCanvas.height = 720;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) throw new Error('Could not create offscreen context');
  
      const exportAudio = new Audio(audioUrl);
      exportAudio.muted = true;
  
      const recordedChunks: BlobPart[] = [];
      const stream = exportCanvas.captureStream(EXPORT_FPS);

      // Combine audio and video streams
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioSource = audioContext.createMediaElementSource(exportAudio);
      const audioDestination = audioContext.createMediaStreamDestination();
      audioSource.connect(audioDestination);
      stream.addTrack(audioDestination.stream.getAudioTracks()[0]);
  
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9,opus' });
      
      const cleanup = () => {
        if (renderInterval) clearInterval(renderInterval);
        audioContext?.close();
      };
      
      recorder.ondataavailable = e => e.data.size > 0 && recordedChunks.push(e.data);
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        
        setIsExporting(false);
        updateToast({ id: toastId, title: 'Export Complete!', description: 'Your video has been downloaded.' });
        cleanup();
      };
      
      const localCache = new Map<string, WrappedLine[]>();
      
      const startRendering = () => {
        renderInterval = setInterval(() => {
          if (exportAudio.ended) {
            if (recorder.state === 'recording') recorder.stop();
            cleanup();
            return;
          }
          drawFrame(ctx, exportCanvas!, exportAudio.currentTime * 1000, exportAudio.duration, backgroundImages, syncedLyrics, localCache);
          const progress = (exportAudio.currentTime / exportAudio.duration) * 100;
          if (!isNaN(progress)) {
            updateToast({ id: toastId, description: `Rendering video... ${progress.toFixed(0)}% complete.` });
          }
        }, 1000 / EXPORT_FPS);
      };

      exportAudio.onloadedmetadata = () => {
        updateToast({ id: toastId, title: 'Exporting Video', description: 'Rendering started... 0% complete.' });
        recorder.start();
        exportAudio.play();
        startRendering();
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
      if (renderInterval) clearInterval(renderInterval);
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
