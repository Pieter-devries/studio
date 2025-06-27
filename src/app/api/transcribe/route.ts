import { NextRequest, NextResponse } from 'next/server';
import { simpleTranscription } from '@/ai/flows/simple-transcription';

export async function POST(request: NextRequest) {
  try {
    const { audioDataUri } = await request.json();

    if (!audioDataUri) {
      return NextResponse.json(
        { error: 'Audio data URI is required' },
        { status: 400 }
      );
    }

    console.log('🎤 [API] Starting simple transcription...');
    
    const result = await simpleTranscription({ audioDataUri });
    
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