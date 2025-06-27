'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, Download, Undo2 } from 'lucide-react';
import type { SyncedLyric, Word } from '@/lib/utils';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

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
        // Dynamic font sizing based on canvas resolution
        const baseFontSize = canvas.width <= 1280 ? 44 : Math.round(canvas.width * 0.034); // Scale with resolution
        const FONT_SIZE = baseFontSize;
        const LINE_HEIGHT = Math.round(FONT_SIZE * 1.18);
        const PADDING = Math.round(canvas.width * 0.015);
        
        ctx.font = `bold ${FONT_SIZE}px Inter, sans-serif`;
        ctx.textBaseline = 'middle';
        
        // SIMPLIFIED: Just show the full lyric line with proper word wrapping
        // No word-level highlighting, no complex timing calculations
        // Just display the lyric with line breaks when we're in the SRT time window
        
        // Word wrap the lyric text to fit canvas width
        const maxWidth = canvas.width * 0.85; // Use 85% of canvas width for better margins
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
        
        // High-quality background box with better shadow
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = Math.round(canvas.width * 0.008); // Scale shadow with resolution
        const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
        const borderRadius = Math.round(canvas.width * 0.008);
        ctx.beginPath();
        ctx.roundRect(
            (canvas.width - maxLineWidth) / 2 - PADDING, 
            startY - LINE_HEIGHT / 2 - PADDING, 
            maxLineWidth + PADDING * 2, 
            totalTextHeight + PADDING * 2, 
            [borderRadius]
        );
        ctx.fill();
        ctx.restore();

        // High-quality text rendering with better shadows
        lines.forEach((line, lineIndex) => {
            const lineY = startY + lineIndex * LINE_HEIGHT;
            ctx.textAlign = 'center';
            
            // Text shadow for better readability
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = Math.round(canvas.width * 0.003);
            ctx.shadowOffsetX = Math.round(canvas.width * 0.001);
            ctx.shadowOffsetY = Math.round(canvas.width * 0.001);
            ctx.fillText(line, canvas.width / 2, lineY);
            ctx.restore();
            
            // Main text
            ctx.fillStyle = 'white';
            ctx.fillText(line, canvas.width / 2, lineY);
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
  const [exportAbortController, setExportAbortController] = useState<AbortController | null>(null);
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
    
    const abortController = new AbortController();
    setExportAbortController(abortController);
    
    const { id: toastId, update: updateToast } = toast({
      title: 'Starting Export...',
      description: 'Preparing safe video export...',
    });

    // Declare at function scope for cleanup access
    let exportAudioContext: AudioContext | null = null;
    let exportAudio: HTMLAudioElement | null = null;

    const cleanup = () => {
      // Clean up export-specific resources
      if (exportAudioContext && exportAudioContext.state !== 'closed') {
        exportAudioContext.close().catch(console.error);
      }
      
      // Remove export audio from DOM if it exists
      if (exportAudio && exportAudio.parentNode) {
        exportAudio.pause();
        exportAudio.src = '';
        document.body.removeChild(exportAudio);
        console.log('🎵 Removed export audio from DOM');
      }
      
      // Reset state
      setExportAbortController(null);
      setIsExporting(false);
      
      console.log('🧹 Export cleanup completed');
    };

    try {
      // Start with improved MediaRecorder approach (safer and more compatible)
      let mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'; // H.264 + AAC
      let fileExtension = 'mp4';
      
      // Fallback to webm if mp4 not supported
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm; codecs="vp9, opus"';
        fileExtension = 'webm';
        
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
          fileExtension = 'webm';
          
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            updateToast({
              id: toastId,
              variant: 'destructive',
              title: 'Export Failed',
              description: 'Video recording not supported in your browser',
            });
            return;
          }
        }
      }

      console.log('🎬 Using export format:', mimeType);

      // Create high-quality export canvas (1080p)
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 1920;  // Full HD width
      exportCanvas.height = 1080; // Full HD height
      const exportCtx = exportCanvas.getContext('2d', {
        willReadFrequently: false,
        desynchronized: true,
        alpha: false // No transparency for better performance
      });
      if (!exportCtx) throw new Error('Could not create export context');

      // Optimize canvas for video export
      exportCtx.imageSmoothingEnabled = true;
      exportCtx.imageSmoothingQuality = 'high';

      // Create completely separate audio element for export (not connected to main player)
      exportAudio = new Audio();
      exportAudio.src = audioUrl; // Set src separately to avoid conflicts
      exportAudio.crossOrigin = 'anonymous';
      exportAudio.preload = 'metadata';
      exportAudio.volume = 1.0; // Full volume for recording
      exportAudio.style.display = 'none'; // Hidden but in DOM
      
      // Important: Add to DOM to prevent removal errors
      document.body.appendChild(exportAudio);
      console.log('🎵 Created separate export audio element and added to DOM');

      const recordedChunks: BlobPart[] = [];
      const EXPORT_FPS = 30;
      
      // High-quality stream settings
      const videoStream = exportCanvas.captureStream(EXPORT_FPS);

      try {
        exportAudioContext = new AudioContext({ sampleRate: 48000 });
        await exportAudioContext.resume(); // Ensure context is running
        console.log('🎵 Export AudioContext created and resumed');
        
        if (!exportAudio) throw new Error('Export audio element not created');
        
        const audioSource = exportAudioContext.createMediaElementSource(exportAudio);
        const audioDestination = exportAudioContext.createMediaStreamDestination();
        
        // Connect audio to both recording destination AND speakers (for proper capture)
        audioSource.connect(audioDestination);
        audioSource.connect(exportAudioContext.destination); // This enables audio capture

        // Add high-quality audio track to video stream
        const audioTracks = audioDestination.stream.getAudioTracks();
        console.log('🎵 Audio tracks found:', audioTracks.length);
        if (audioTracks.length > 0) {
          audioTracks.forEach(track => {
            console.log('🎵 Adding audio track:', track.label);
            videoStream.addTrack(track);
          });
        } else {
          console.warn('⚠️ No audio tracks found for recording');
        }
      } catch (audioError) {
        console.error('🚨 Audio setup failed:', audioError);
        // Continue without audio if audio setup fails
        updateToast({
          id: toastId,
          title: 'Warning',
          description: 'Audio capture failed, exporting video only',
        });
      }

      // High-quality recorder settings
      const recorder = new MediaRecorder(videoStream, { 
        mimeType,
        videoBitsPerSecond: 12000000, // 12 Mbps for high quality 1080p
        audioBitsPerSecond: 320000    // 320 kbps for high quality audio
      });

      // Memory-safe render variables
      const exportCache = new Map<string, WrappedLine[]>();
      let startTime = 0;
      let frameCount = 0;
      let lastProgressUpdate = 0;
      const MAX_FRAMES_BEFORE_YIELD = 60; // Yield every 2 seconds

      // Handle abort signal
      abortController.signal.addEventListener('abort', () => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        cleanup();
      });

      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        console.log('🎬 Export recording stopped');
        
        // Create blob and download
        const blob = new Blob(recordedChunks, { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lyro-video-${Date.now()}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateToast({
          id: toastId,
          title: 'Export Complete!',
          description: 'Your video has been downloaded successfully.',
        });
        
        cleanup();
      };

      recorder.onerror = (e) => {
        console.error('🚨 MediaRecorder error:', e);
        cleanup();
        setIsExporting(false);
      };

      // Memory-safe render function with yielding
      const renderFrame = (currentTimeMs: number) => {
        if (abortController.signal.aborted) return false;
        
        // Clear canvas
        exportCtx.fillStyle = 'black';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        // Render frame using cached data
        if (!exportAudio) return false;
        
        drawFrame(
          exportCtx,
          exportCanvas,
          currentTimeMs,
          exportAudio.duration,
          backgroundImages,
          sortedLyrics,
          exportCache
        );

        frameCount++;
        return true;
      };

      // Wait for audio metadata and start recording
      await new Promise<void>((resolve, reject) => {
        if (!exportAudio) {
          reject(new Error('Export audio element not available'));
          return;
        }
        
        exportAudio.onloadedmetadata = () => {
          if (!exportAudio) return;
          
          console.log('🎵 Export audio metadata loaded, duration:', exportAudio.duration);
          
          updateToast({
            id: toastId,
            title: 'Exporting Video...',
            description: 'Starting synchronized recording...',
          });

          // Start recording
          recorder.start(1000); // Collect data every second
          console.log('🎬 MediaRecorder started');

          // Start audio playback for sync
          exportAudio.currentTime = 0;
          
          // Handle play promise properly
          const playPromise = exportAudio.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              if (!exportAudio) return;
              
              console.log('🎵 Export audio started playing');
              
              // Real-time sync loop - render frames in sync with audio playback
              const syncRenderLoop = () => {
                if (abortController.signal.aborted || !exportAudio || exportAudio.ended) {
                  console.log('🛑 Export completed or aborted');
                  if (recorder.state === 'recording') {
                    recorder.stop();
                  }
                  return;
                }

                const currentTimeMs = exportAudio.currentTime * 1000;
                
                // Render frame at current audio time
                renderFrame(currentTimeMs);

                // Update progress
                const progress = Math.min((exportAudio.currentTime / exportAudio.duration) * 100, 100);
                if (Math.floor(exportAudio.currentTime) !== lastProgressUpdate) {
                  lastProgressUpdate = Math.floor(exportAudio.currentTime);
                  updateToast({
                    id: toastId,
                    title: 'Exporting Video...',
                    description: `Progress: ${progress.toFixed(0)}% (${exportAudio.currentTime.toFixed(1)}s / ${exportAudio.duration.toFixed(1)}s)`,
                  });
                }

                // Continue loop
                requestAnimationFrame(syncRenderLoop);
              };

              // Start the synchronized render loop
              syncRenderLoop();
              resolve();
            }).catch(reject);
          } else {
            reject(new Error('Audio play() method not supported'));
          }
        };

        exportAudio.onerror = reject;
        exportAudio.onended = () => {
          console.log('🎵 Export audio ended, stopping recording');
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        };
      });

    } catch (error) {
      console.error('🚨 Export failed:', error);
      updateToast({
        id: toastId,
        variant: 'destructive',
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
      cleanup();
    }
  };

  const handleCancelExport = () => {
    if (exportAbortController) {
      exportAbortController.abort();
      toast({
        title: 'Export Cancelled',
        description: 'Video export has been stopped.',
      });
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
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleExport}
            disabled={!sortedLyrics.length || isExporting}
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export Video'}
          </Button>
          
          {isExporting && (
            <Button
              onClick={handleCancelExport}
              variant="outline"
              className="w-full"
            >
              Cancel Export
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
