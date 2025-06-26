'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, Download, Undo2 } from 'lucide-react';
import type { SyncedLyric } from '@/lib/utils';

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

const LYRIC_OFFSET_MS = 500; // Delay to make lyrics appear slightly after they are sung.
const FADE_DURATION_MS = 1000; // 1 second fade

// Smoother animation timing function
const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;


export function VideoPreview({ videoData, onReset }: VideoPreviewProps) {
  const { audioUrl, backgroundScenes, syncedLyrics, title } = videoData;
  const { toast } = useToast();

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const backgroundImages = useMemo(() => {
    return backgroundScenes.map(scene => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = scene.backgroundImageDataUri;
      return { startTime: scene.startTime, image: img };
    });
  }, [backgroundScenes]);

  const drawCanvasFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const audio = audioRef.current;
    if (!ctx || !canvas || !audio) return;

    const currentTimeMs = audio.currentTime * 1000;
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
        
        let sWidth = image.naturalWidth;
        let sHeight = image.naturalHeight;
        
        if (imgRatio > canvasRatio) {
            sWidth = image.naturalHeight * canvasRatio;
        } else {
            sHeight = image.naturalWidth / canvasRatio;
        }

        const focalWidth = sWidth / scale;
        const focalHeight = sHeight / scale;
        
        const sx = ((image.naturalWidth - sWidth) / 2) + ((sWidth - focalWidth) * panX);
        const sy = ((image.naturalHeight - sHeight) / 2) + ((sHeight - focalHeight) * panY);
        
        ctx.drawImage(image, sx, sy, focalWidth, focalHeight, 0, 0, canvas.width, canvas.height);
    };
    
    let currentSceneIndex = backgroundImages.findIndex((bg, i) => {
        const nextBg = backgroundImages[i + 1];
        return currentTimeMs >= bg.startTime && (!nextBg || currentTimeMs < nextBg.startTime);
    });
    if (currentSceneIndex === -1 && backgroundImages.length > 0) {
      currentSceneIndex = 0;
    }
    
    if (currentSceneIndex !== -1) {
      const currentScene = backgroundImages[currentSceneIndex];
      const nextScene = backgroundImages[currentSceneIndex + 1];
      
      const sceneStartTime = currentScene.startTime;
      const sceneEndTime = nextScene ? nextScene.startTime : duration * 1000;
  
      // Draw current scene
      drawKenBurns(currentScene.image, sceneStartTime, sceneEndTime);
      
      // Handle fade transition to next scene
      if (nextScene && currentTimeMs > nextScene.startTime - FADE_DURATION_MS) {
          const fadeProgress = (currentTimeMs - (nextScene.startTime - FADE_DURATION_MS)) / FADE_DURATION_MS;
          ctx.globalAlpha = Math.min(easeInOutCubic(fadeProgress), 1.0);
          const nextSceneEndTime = backgroundImages[currentSceneIndex + 2] ? backgroundImages[currentSceneIndex + 2].startTime : duration * 1000;
          drawKenBurns(nextScene.image, nextScene.startTime, nextSceneEndTime);
          ctx.globalAlpha = 1.0;
      }
    }


    // --- LYRICS RENDERING ---
    const effectiveTimeMs = currentTimeMs - LYRIC_OFFSET_MS;
    let currentLyric: SyncedLyric | null = null;
    if (syncedLyrics) {
      for (let i = syncedLyrics.length - 1; i >= 0; i--) {
        if (syncedLyrics[i].startTime <= effectiveTimeMs) {
          currentLyric = syncedLyrics[i];
          break;
        }
      }
    }
    
    if (currentLyric) {
        const FONT_SIZE = 44;
        const LINE_HEIGHT = 52;
        const PADDING = 20;

        ctx.font = `bold ${FONT_SIZE}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const words = currentLyric.words;
        const lines: { text: string, words: typeof words }[] = [];
        let currentLine = '';
        let currentLineWords: typeof words = [];

        words.forEach(word => {
            const testLine = currentLine ? `${currentLine} ${word.text}` : word.text;
            if (ctx.measureText(testLine).width > canvas.width * 0.9 && currentLine) {
                lines.push({ text: currentLine, words: currentLineWords });
                currentLine = word.text;
                currentLineWords = [word];
            } else {
                currentLine = testLine;
                currentLineWords.push(word);
            }
        });
        lines.push({ text: currentLine, words: currentLineWords });

        const totalTextHeight = lines.length * LINE_HEIGHT;
        const startY = canvas.height * 0.85 - totalTextHeight / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 5;

        const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line.text).width), 0);
        const bgX = (canvas.width - maxLineWidth) / 2 - PADDING;
        const bgY = startY - LINE_HEIGHT / 2 - PADDING;
        const bgWidth = maxLineWidth + PADDING * 2;
        const bgHeight = totalTextHeight + PADDING * 2;
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgWidth, bgHeight, [16]);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        lines.forEach((line, lineIndex) => {
            const lineY = startY + lineIndex * LINE_HEIGHT;
            let currentX = (canvas.width - ctx.measureText(line.text).width) / 2;
            
            ctx.textAlign = 'left';
            line.words.forEach(word => {
                const isSung = effectiveTimeMs >= word.startTime;
                ctx.fillStyle = isSung ? 'hsl(170 58% 54%)' : 'white';
                ctx.fillText(word.text, currentX, lineY);
                currentX += ctx.measureText(word.text + ' ').width;
            });
        });
    }

  }, [backgroundImages, syncedLyrics, duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
    };

    const handleTimeUpdate = () => {
      // Update UI state at a reasonable rate for the slider
      setCurrentTime(audio.currentTime);
    };
    
    const handleEnded = () => {
        setIsPlaying(false);
        // On end, ensure the UI shows the full duration.
        setCurrentTime(audio.duration);
    };

    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    if (!isRecording) {
        audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
    
    return () => {
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isRecording]);

  useEffect(() => {
    // This effect runs the animation loop ONLY.
    // It reads the audio time directly in drawCanvasFrame for smoothness.
    const render = () => {
      drawCanvasFrame();
      animationFrameRef.current = requestAnimationFrame(render);
    };
    animationFrameRef.current = requestAnimationFrame(render);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawCanvasFrame]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleExport = async () => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) {
      toast({ variant: 'destructive', title: 'Error', description: 'Preview elements not ready.' });
      return;
    }

    setIsRecording(true);
    toast({ title: 'Recording Started', description: 'Playing audio to capture video. Please wait.' });
    
    // Pause and reset audio for recording
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);


    recordedChunksRef.current = [];

    try {
      // Need a new audio context for exporting
      const exportAudioContext = new AudioContext();
      const source = exportAudioContext.createMediaElementSource(audio);
      const dest = exportAudioContext.createMediaStreamDestination();
      source.connect(dest);
      // Let's not connect to destination to avoid hearing it twice
      // source.connect(exportAudioContext.destination);
      
      const stream = canvas.captureStream(30);
      dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));

      recorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

      recorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.webm`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setIsRecording(false);
        toast({ title: 'Export Complete!', description: 'Your video has been downloaded.' });
        
        // Cleanup
        exportAudioContext.close();
        // Reset the main audio element to its original state
        audio.muted = false;
      };

      const onAudioEnd = () => {
        recorderRef.current?.stop();
        audio.removeEventListener('ended', onAudioEnd);
      };
      audio.addEventListener('ended', onAudioEnd);

      recorderRef.current.start();
      audio.muted = true; // Mute the original audio element to prevent echo
      await audio.play();
      setIsPlaying(true);


    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Export Failed', description: 'Could not start recording. Check browser permissions.' });
      setIsRecording(false);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="w-full flex flex-col items-center gap-6 animate-in fade-in-50 duration-500">
      <audio ref={audioRef} src={audioUrl} crossOrigin="anonymous" />
      <Card className="w-full overflow-hidden shadow-2xl">
        <CardContent className="p-0">
          <canvas ref={canvasRef} width="1280" height="720" className="w-full aspect-video bg-black" />
        </CardContent>
      </Card>
      <div className="w-full max-w-2xl p-4 bg-card/50 backdrop-blur-sm rounded-lg border shadow-lg">
        <div className="flex items-center gap-4">
          <Button onClick={togglePlay} size="icon" disabled={isRecording}>
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <span className="text-sm font-mono">{formatTime(currentTime)}</span>
          <Slider
            value={[currentTime]}
            max={duration}
            step={0.1}
            onValueChange={handleSeek}
            className="flex-grow"
            disabled={isRecording}
          />
          <span className="text-sm font-mono">{formatTime(duration)}</span>
        </div>
      </div>
      <div className="flex gap-4">
        <Button onClick={onReset} variant="outline" size="lg" disabled={isRecording}>
          <Undo2/> Create New Video
        </Button>
        <Button onClick={handleExport} size="lg" disabled={isRecording} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          <Download /> {isRecording ? 'Recording...' : 'Export Video'}
        </Button>
      </div>
    </div>
  );
}
