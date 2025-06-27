'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { InputForm } from '@/components/lyro/InputForm';
import { LoadingIndicator } from '@/components/lyro/LoadingIndicator';
import { TimingVerification } from '@/components/lyro/TimingVerification';
import { VideoPreview, type VideoData } from '@/components/lyro/VideoPreview';

interface TranscriptionData {
  srtContent: string;
  audioDuration: number;
  audioUrl: string;
  lyrics: string;
  title: string;
}

export default function Home() {
  const [step, setStep] = useState<'input' | 'loading' | 'verify-timing' | 'preview'>('input');
  const [transcriptionData, setTranscriptionData] = useState<TranscriptionData | null>(null);
  const [videoData, setVideoData] = useState<VideoData | null>(null);
  const { toast } = useToast();

  const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async (file: File, lyrics: string) => {
    setStep('loading');
    try {
      const audioDataUri = await fileToDataUri(file);
      const title = file.name.replace(/\.[^/.]+$/, "");
      
      console.log('🎬 Starting simple transcription for human verification...');
      
      // Step 1: Call lyrics-aware transcription API
      const transcriptionResponse = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audioDataUri, userLyrics: lyrics }),
      });

      if (!transcriptionResponse.ok) {
        const errorData = await transcriptionResponse.json();
        throw new Error(errorData.error || 'Transcription failed');
      }

      const transcriptionResult = await transcriptionResponse.json();

      if (!transcriptionResult?.srtContent) {
        throw new Error('Failed to get transcription timing. Please try again.');
      }

      // Store data for verification step
      setTranscriptionData({
        srtContent: transcriptionResult.srtContent,
        audioDuration: transcriptionResult.audioDuration,
        audioUrl: audioDataUri,
        lyrics,
        title
      });

      setStep('verify-timing');
      
      toast({
        title: 'Transcription Complete!',
        description: 'Please review and verify the timing before proceeding.',
      });
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({
        variant: 'destructive',
        title: 'Error During Transcription',
        description: errorMessage,
      });
      setStep('input');
    }
  };

  const handleTimingVerified = async (timingOffset: number) => {
    if (!transcriptionData) return;
    
    setStep('loading');
    try {
      console.log('🎬 Starting final video generation with verified timing...');
      
      // Step 2: Call video generation API
      const videoResponse = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          srtContent: transcriptionData.srtContent,
          structuredLyrics: transcriptionData.lyrics,
          timingOffset,
          audioDataUri: transcriptionData.audioUrl
        }),
      });

      if (!videoResponse.ok) {
        const errorData = await videoResponse.json();
        throw new Error(errorData.error || 'Video generation failed');
      }

      const videoResult = await videoResponse.json();

      if (!videoResult?.syncedLyrics || !videoResult?.backgroundScenes) {
        throw new Error('Failed to complete video generation. Please try again.');
      }
      
      if (videoResult.syncedLyrics.length === 0) {
        throw new Error('Failed to map lyrics to timing. The transcription may not match your lyrics well enough.');
      }

      // Final result
      setVideoData({
        audioUrl: transcriptionData.audioUrl,
        backgroundScenes: videoResult.backgroundScenes,
        syncedLyrics: videoResult.syncedLyrics,
        title: transcriptionData.title,
      });

      console.log('🎉 Video generation complete with human-verified timing!');
      console.log(`📊 Final result: ${videoResult.backgroundScenes.length} scenes, ${videoResult.syncedLyrics.length} lyric lines`);
      console.log(`📈 Mapping coverage: ${(videoResult.mappingQuality.coverage * 100).toFixed(1)}%`);

      setStep('preview');
      toast({
        title: 'Video Ready!',
        description: `Your video has been generated with ${(videoResult.mappingQuality.coverage * 100).toFixed(1)}% lyric coverage.`,
      });
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({
        variant: 'destructive',
        title: 'Error Generating Video',
        description: errorMessage,
      });
      setStep('verify-timing'); // Go back to verification step
    }
  };

  const handleBackToInput = () => {
    setTranscriptionData(null);
    setVideoData(null);
    setStep('input');
  };
  
  const reset = () => {
    setTranscriptionData(null);
    setVideoData(null);
    setStep('input');
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="py-4 px-6 border-b">
        <div className="container mx-auto flex items-center gap-2">
          <Wand2 className="text-primary" size={28} />
          <h1 className="text-2xl font-bold font-headline text-foreground">LyroVideo</h1>
          <span className="text-sm text-slate-600 dark:text-slate-300 ml-2">with Human Verification</span>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-5xl">
          {step === 'input' && <InputForm onGenerate={handleGenerate} />}
          {step === 'loading' && <LoadingIndicator />}
          {step === 'verify-timing' && transcriptionData && (
            <TimingVerification
              audioUrl={transcriptionData.audioUrl}
              srtContent={transcriptionData.srtContent}
              providedLyrics={transcriptionData.lyrics}
              audioDuration={transcriptionData.audioDuration}
              onVerified={handleTimingVerified}
              onBack={handleBackToInput}
            />
          )}
          {step === 'preview' && videoData && (
            <VideoPreview videoData={videoData} onReset={reset} />
          )}
        </div>
      </main>

      <footer className="py-4 px-6 border-t mt-auto">
        <div className="container mx-auto text-center text-sm text-slate-600 dark:text-slate-300">
          <p>Powered by AI Transcription + Human Verification</p>
        </div>
      </footer>
    </div>
  );
}
