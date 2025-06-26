'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, Download, Undo2 } from 'lucide-react';
import type { SyncedLyric } from '@/lib/utils';

export interface VideoData {
  audioUrl: string;
  backgroundUrl: string;
  syncedLyrics: SyncedLyric[];
  title: string;
}

interface VideoPreviewProps {
  videoData: VideoData;
  onReset: () => void;
}

export function VideoPreview({ videoData, onReset }: VideoPreviewProps) {
  const { audioUrl, backgroundUrl, syncedLyrics, title } = videoData;
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

  const backgroundImage = useMemo(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = backgroundUrl;
    return img;
  }, [backgroundUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
    };

    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('loadeddata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleEnded);

    // Auto-play when component mounts
    audio.play().then(() => setIsPlaying(true)).catch(console.error);

    return () => {
      audio.removeEventListener('loadeddata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleEnded);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const currentLyric = useMemo(() => {
    const currentTimeMs = currentTime * 1000;
    // Find the last lyric that has a start time before or at the current time.
    // Use a reverse loop for efficiency.
    for (let i = syncedLyrics.length - 1; i >= 0; i--) {
      if (syncedLyrics[i].time <= currentTimeMs) {
        return syncedLyrics[i].text;
      }
    }
    return ''; // Return empty string if no lyric has started yet.
  }, [currentTime, syncedLyrics]);

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

  const drawCanvasFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    
    const wrapText = (
      context: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      maxWidth: number,
      lineHeight: number
    ) => {
      const words = text.split(' ');
      let line = '';
      const lines = [];

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          lines.push(line.trim());
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());
      
      const totalTextHeight = (lines.length -1) * lineHeight;
      const startY = y - totalTextHeight / 2;
      
      lines.forEach((line, index) => {
        if(line) {
          context.fillText(line, x, startY + index * lineHeight);
        }
      });
    };

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background with Ken Burns effect
    if (backgroundImage.complete && backgroundImage.naturalWidth > 0) {
        const progress = duration > 0 ? currentTime / duration : 0;
        
        const scale = 1.0 + 0.15 * progress;
        const panX = 0.5 - 0.05 * progress;
        const panY = 0.5 - 0.05 * progress;

        const imgRatio = backgroundImage.naturalWidth / backgroundImage.naturalHeight;
        const canvasRatio = canvas.width / canvas.height;
        
        let sWidth = backgroundImage.naturalWidth;
        let sHeight = backgroundImage.naturalHeight;
        
        if (imgRatio > canvasRatio) {
            sWidth = backgroundImage.naturalHeight * canvasRatio;
        } else {
            sHeight = backgroundImage.naturalWidth / canvasRatio;
        }

        const focalWidth = sWidth / scale;
        const focalHeight = sHeight / scale;
        
        const sx = ((backgroundImage.naturalWidth - sWidth) / 2) + ((sWidth - focalWidth) * panX);
        const sy = ((backgroundImage.naturalHeight - sHeight) / 2) + ((sHeight - focalHeight) * panY);
        
        ctx.drawImage(backgroundImage, sx, sy, focalWidth, focalHeight, 0, 0, canvas.width, canvas.height);

        // Add a semi-transparent overlay for better text readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Draw lyrics
    const currentLyricText = currentLyric || '';
    if (currentLyricText) {
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 44px Inter, sans-serif';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const maxWidth = canvas.width * 0.9;
      const lineHeight = 52;
      const x = canvas.width / 2;
      const y = canvas.height * 0.85;
      wrapText(ctx, currentLyricText, x, y, maxWidth, lineHeight);
    }
    
  }, [backgroundImage, currentLyric, currentTime, duration]);

  useEffect(() => {
    const render = () => {
      drawCanvasFrame();
      animationFrameRef.current = requestAnimationFrame(render);
    };
    animationFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [drawCanvasFrame]);

  const handleExport = async () => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) {
      toast({ variant: 'destructive', title: 'Error', description: 'Preview elements not ready.' });
      return;
    }

    setIsRecording(true);
    toast({ title: 'Recording Started', description: 'Playing audio to capture video. Please wait.' });

    recordedChunksRef.current = [];
    audio.currentTime = 0;

    try {
      const stream = canvas.captureStream(30);
      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(audio);
      const dest = audioContext.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioContext.destination);
      
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
      };

      const onAudioEnd = () => {
        recorderRef.current?.stop();
        audio.removeEventListener('ended', onAudioEnd);
      };
      audio.addEventListener('ended', onAudioEnd);

      recorderRef.current.start();
      await audio.play();
      setIsPlaying(true);

    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Export Failed', description: 'Could not start recording. Check browser permissions.' });
      setIsRecording(false);
    }
  };

  const formatTime = (seconds: number) => {
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
            step={1}
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
