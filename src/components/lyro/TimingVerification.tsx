'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, RotateCcw, CheckCircle } from 'lucide-react';

interface TimingSegment {
  start: string;
  end: string;
  text: string;
  startMs: number;
  endMs: number;
}

interface TimingVerificationProps {
  audioUrl: string;
  srtContent: string;
  providedLyrics: string;
  audioDuration: number;
  onVerified: (adjustedOffset: number) => void;
  onBack: () => void;
}

export function TimingVerification({
  audioUrl,
  srtContent,
  providedLyrics,
  audioDuration,
  onVerified,
  onBack
}: TimingVerificationProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timingOffset, setTimingOffset] = useState(0); // ms offset to apply
  const [segments, setSegments] = useState<TimingSegment[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Helper function to validate and fix SRT timestamp format
  const validateAndFixTimestamp = (timeStr: string): string | null => {
    try {
      const originalTimeStr = timeStr;
      timeStr = timeStr.trim();
      
      // Handle non-standard format where AI uses colons instead of comma for milliseconds
      // Pattern: "00:06:587" means 0 hours, 6.587 seconds = "00:00:06,587"
      // Pattern: "00:27:17" means 0 hours, 27.17 seconds = "00:00:27,170" 
      // Pattern: "01:44:47" means 0 hours, 104.47 seconds = "00:01:44,470"
      const parts = timeStr.split(':');
      
      if (parts.length === 3 && !timeStr.includes(',')) {
        const hours = parseInt(parts[0]);
        const minutesAndSeconds = parts[1];
        const fractionalPart = parts[2];
        
        // Convert the non-standard format to seconds
        const totalSeconds = hours * 3600 + parseInt(minutesAndSeconds) + (parseInt(fractionalPart) / 1000);
        
        // Convert back to proper HH:MM:SS,mmm format
        const finalHours = Math.floor(totalSeconds / 3600);
        const finalMinutes = Math.floor((totalSeconds % 3600) / 60);
        const finalSecondsWhole = Math.floor(totalSeconds % 60);
        const finalMilliseconds = Math.round((totalSeconds % 1) * 1000);
        
        timeStr = `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}:${finalSecondsWhole.toString().padStart(2, '0')},${finalMilliseconds.toString().padStart(3, '0')}`;
        
        console.log(`🔧 [SRT-UI] Converted non-standard format: "${originalTimeStr}" → "${timeStr}"`);
      }
      
      // Now validate the standard format
      if (!timeStr.includes(',')) {
        console.log(`⚠️ [SRT] Invalid timestamp format (no comma): "${originalTimeStr}"`);
        return null;
      }
      
      const [timePart, msPart] = timeStr.split(',');
      
      // Fix milliseconds part
      let ms = msPart;
      if (ms.length > 3) {
        ms = ms.substring(0, 3);
      } else if (ms.length < 3) {
        ms = ms.padEnd(3, '0');
      }
      
      // Validate time part
      const timeParts = timePart.split(':');
      if (timeParts.length !== 3) {
        console.log(`⚠️ [SRT] Invalid time format: "${timePart}"`);
        return null;
      }
      
      const [hours, minutes, seconds] = timeParts.map(Number);
      
      if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(Number(ms))) {
        console.log(`⚠️ [SRT] Non-numeric values in timestamp: "${originalTimeStr}"`);
        return null;
      }
      
      if (minutes >= 60 || seconds >= 60) {
        console.log(`⚠️ [SRT] Invalid time values: ${minutes}m ${seconds}s`);
        return null;
      }
      
      const fixedTimestamp = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${ms}`;
      
      if (fixedTimestamp !== timeStr && fixedTimestamp !== originalTimeStr) {
        console.log(`🔧 [SRT-UI] Fixed timestamp: "${originalTimeStr}" → "${fixedTimestamp}"`);
      }
      
      return fixedTimestamp;
    } catch (error) {
      console.log(`❌ [SRT] Failed to parse timestamp: "${timeStr}" - ${error}`);
      return null;
    }
  };

  // Helper function to parse SRT time to milliseconds with validation
  const parseTimeToMs = (timeStr: string): number => {
    const validatedTimeStr = validateAndFixTimestamp(timeStr);
    if (!validatedTimeStr) {
      console.log(`❌ [SRT] Skipping invalid timestamp: "${timeStr}"`);
      return NaN;
    }
    
    try {
      const [time, ms] = validatedTimeStr.split(',');
      const [hours, minutes, seconds] = time.split(':').map(Number);
      
      const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + Number(ms);
      
      if (isNaN(totalMs)) {
        console.log(`❌ [SRT] Calculated NaN for timestamp: "${timeStr}"`);
        return NaN;
      }
      
      return totalMs;
    } catch (error) {
      console.log(`❌ [SRT] Error parsing validated timestamp "${validatedTimeStr}": ${error}`);
      return NaN;
    }
  };

  // Parse SRT content into segments with validation
  useEffect(() => {
    const parseSegments = () => {
      const lines = srtContent.split('\n');
      const parsed: TimingSegment[] = [];
      let skippedCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          const [start, end] = lines[i].split(' --> ');
          const text = lines[i + 1] || '';
          
          if (text.trim()) {
            const startMs = parseTimeToMs(start.trim());
            const endMs = parseTimeToMs(end.trim());
            
            // Only include segments with valid timestamps
            if (!isNaN(startMs) && !isNaN(endMs) && startMs < endMs) {
              parsed.push({
                start: start.trim(),
                end: end.trim(),
                text: text.trim(),
                startMs,
                endMs
              });
            } else {
              skippedCount++;
              console.log(`⚠️ [SRT-UI] Skipped invalid segment: "${start} --> ${end}" with text: "${text.trim()}"`);
            }
          } else {
            skippedCount++;
            console.log(`⚠️ [SRT-UI] Skipped empty segment: "${start} --> ${end}"`);
          }
        }
      }
      
      if (skippedCount > 0) {
        console.log(`⚠️ [SRT-UI] Total skipped segments: ${skippedCount}`);
      }
      
      console.log(`✅ [SRT-UI] Successfully parsed ${parsed.length} valid segments for UI`);
      setSegments(parsed);
    };
    
    parseSegments();
  }, [srtContent]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle audio time updates
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime * 1000); // Convert to ms
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const seekTo = (timeMs: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.currentTime = timeMs / 1000;
    setCurrentTime(timeMs);
  };

  const resetOffset = () => {
    setTimingOffset(0);
  };

  const handleApprove = () => {
    onVerified(timingOffset);
  };

  // Get current active segment with offset applied
  const getCurrentSegment = () => {
    const adjustedTime = currentTime - timingOffset;
    return segments.find(seg => 
      adjustedTime >= seg.startMs && adjustedTime <= seg.endMs
    );
  };

  const currentSegment = getCurrentSegment();

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🎯 Verify Timing
            <Badge variant="outline">Step 2 of 3</Badge>
          </CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Review the AI transcription timing and adjust if needed. The timing will be applied to your provided lyrics.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Audio Controls */}
          <div className="space-y-4">
            <audio ref={audioRef} src={audioUrl} preload="metadata" />
            
            <div className="flex items-center gap-4">
              <Button onClick={togglePlayback} size="sm">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
                  {formatTime(currentTime / 1000)} / {formatTime(audioDuration)}
                </div>
                <Slider
                  value={[currentTime]}
                  max={audioDuration * 1000}
                  step={100}
                  onValueChange={([value]) => seekTo(value)}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Timing Offset Control */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Timing Adjustment</h3>
              <Button onClick={resetOffset} variant="outline" size="sm">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Offset: {timingOffset > 0 ? '+' : ''}{(timingOffset / 1000).toFixed(1)}s</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Positive = lyrics appear later, Negative = lyrics appear earlier
                </span>
              </div>
              <Slider
                value={[timingOffset]}
                min={-10000}
                max={10000}
                step={100}
                onValueChange={([value]) => setTimingOffset(value)}
                className="w-full"
              />
            </div>
          </div>

          {/* Current Segment Display */}
          {currentSegment && (
            <Card className="bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700">
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">Currently Playing</Badge>
                    <span className="text-sm font-mono text-foreground">
                      {formatTime((currentSegment.startMs + timingOffset) / 1000)} - {formatTime((currentSegment.endMs + timingOffset) / 1000)}
                    </span>
                  </div>
                  <p className="text-lg font-medium text-foreground">{currentSegment.text}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transcription Preview */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">AI Transcription Preview</h3>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {segments.map((segment, index) => {
                const adjustedStart = segment.startMs + timingOffset;
                const adjustedEnd = segment.endMs + timingOffset;
                const isActive = currentTime >= adjustedStart && currentTime <= adjustedEnd;
                
                return (
                  <div
                    key={index}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      isActive 
                        ? 'bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700' 
                        : 'bg-slate-100 hover:bg-slate-200 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700'
                    }`}
                    onClick={() => seekTo(adjustedStart)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono text-slate-600 dark:text-slate-300">
                        {formatTime(adjustedStart / 1000)} - {formatTime(adjustedEnd / 1000)}
                      </span>
                      {isActive && <Badge variant="default">Playing</Badge>}
                    </div>
                    <p className="text-sm font-medium text-foreground">{segment.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Provided Lyrics Reference */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Your Provided Lyrics</h3>
            <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg max-h-40 overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
              <pre className="text-sm whitespace-pre-wrap text-foreground font-medium">{providedLyrics}</pre>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4">
            <Button onClick={onBack} variant="outline">
              Back to Upload
            </Button>
            
            <Button onClick={handleApprove} className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Timing Looks Good - Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 