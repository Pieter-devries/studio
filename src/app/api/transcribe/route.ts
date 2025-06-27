import { NextRequest, NextResponse } from 'next/server';
import { lyricsAwareTranscription } from '@/ai/flows/lyrics-aware-transcription';

export async function POST(request: NextRequest) {
  try {
    const { audioDataUri, userLyrics } = await request.json();

    if (!audioDataUri) {
      return NextResponse.json(
        { error: 'Audio data URI is required' },
        { status: 400 }
      );
    }

    if (!userLyrics) {
      return NextResponse.json(
        { error: 'User lyrics are required' },
        { status: 400 }
      );
    }

    console.log('🎤 [API] Starting lyrics-aware transcription...');
    
    const result = await lyricsAwareTranscription({ audioDataUri, userLyrics });
    
    console.log('🎤 [API] Transcription complete');
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('🚨 [API] Transcription error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Transcription failed',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
} 