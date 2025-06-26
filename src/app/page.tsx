'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateDynamicBackground } from '@/ai/flows/generate-dynamic-background';
import { syncLyricsWithAudio } from '@/ai/flows/sync-lyrics-with-audio';
import { InputForm } from '@/components/lyro/InputForm';
import { LoadingIndicator } from '@/components/lyro/LoadingIndicator';
import { VideoPreview, type VideoData } from '@/components/lyro/VideoPreview';


export default function Home() {
  const [step, setStep] = useState<'input' | 'loading' | 'preview'>('input');
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
      
      const [backgroundResult, syncResult] = await Promise.all([
        generateDynamicBackground({ audioDataUri, lyrics }),
        syncLyricsWithAudio({ audioDataUri, lyrics }),
      ]);

      if (!backgroundResult.scenes || !syncResult.syncedLyrics) {
        throw new Error('AI generation failed. Please try again.');
      }
      
      const parsedLyrics = syncResult.syncedLyrics;

      if (parsedLyrics.length === 0) {
        throw new Error('Failed to parse synchronized lyrics. The AI may have returned an unexpected format.');
      }

      setVideoData({
        audioUrl: audioDataUri,
        backgroundScenes: backgroundResult.scenes,
        syncedLyrics: parsedLyrics,
        title: file.name.replace(/\.[^/.]+$/, ""),
      });
      setStep('preview');
      toast({
        title: 'Video Ready!',
        description: 'Your video preview has been generated successfully.',
      });
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({
        variant: 'destructive',
        title: 'Error Generating Video',
        description: errorMessage,
      });
      setStep('input');
    }
  };
  
  const reset = () => {
    setVideoData(null);
    setStep('input');
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="py-4 px-6 border-b">
        <div className="container mx-auto flex items-center gap-2">
          <Wand2 className="text-primary" size={28} />
          <h1 className="text-2xl font-bold font-headline">LyroVideo</h1>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-5xl">
          {step === 'input' && <InputForm onGenerate={handleGenerate} />}
          {step === 'loading' && <LoadingIndicator />}
          {step === 'preview' && videoData && (
            <VideoPreview videoData={videoData} onReset={reset} />
          )}
        </div>
      </main>

      <footer className="py-4 px-6 border-t mt-auto">
        <div className="container mx-auto text-center text-sm text-muted-foreground">
          <p>Powered by Firebase and Genkit AI</p>
        </div>
      </footer>
    </div>
  );
}
