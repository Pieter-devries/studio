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
    const nextLyricIndex = syncedLyrics.findIndex(lyric => lyric.time > currentTime * 1000);
    let currentLyricIndex = nextLyricIndex === -1 ? syncedLyrics.length - 1 : nextLyricIndex - 1;
    if (currentLyricIndex < 0) currentLyricIndex = 0;

    return syncedLyrics[currentLyricIndex]?.text || '';
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
    const audio = audioRef.current;
    if (!ctx || !canvas || !audio) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    if (backgroundImage.complete) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
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
      ctx.font = 'bold 48px Inter, sans-serif';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(currentLyricText, canvas.width / 2, canvas.height * 0.85);
    }
    
    animationFrameRef.current = requestAnimationFrame(drawCanvasFrame);
  }, [backgroundImage, currentLyric]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(drawCanvasFrame);
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
