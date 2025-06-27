import { NextRequest, NextResponse } from 'next/server';
import { mapLyricsToTiming } from '@/ai/flows/map-lyrics-to-timing';
import { generateDynamicBackground } from '@/ai/flows/generate-dynamic-background';

export async function POST(request: NextRequest) {
  try {
    const { 
      srtContent, 
      structuredLyrics, 
      timingOffset, 
      audioDataUri 
    } = await request.json();

    if (!srtContent || !structuredLyrics || !audioDataUri) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    console.log('🎬 [API] Starting final video generation...');
    
    // Step 1: Map verified timing to user's lyrics
    console.log('📝 [API] Mapping lyrics to timing...');
    const mappingResult = await mapLyricsToTiming({
      srtContent,
      structuredLyrics,
      timingOffset: timingOffset || 0
    });

    // Step 2: Generate background scenes
    console.log('🖼️ [API] Generating background scenes...');
    const backgroundResult = await generateDynamicBackground({
      audioDataUri,
      lyrics: structuredLyrics
    });

    if (!mappingResult?.syncedLyrics || !backgroundResult?.scenes) {
      throw new Error('Failed to complete video generation');
    }
    
    if (mappingResult.syncedLyrics.length === 0) {
      throw new Error('Failed to map lyrics to timing - no matches found');
    }

    const result = {
      syncedLyrics: mappingResult.syncedLyrics,
      backgroundScenes: backgroundResult.scenes,
      mappingQuality: mappingResult.mappingQuality
    };

    console.log('🎉 [API] Video generation complete!');
    console.log(`📊 Result: ${backgroundResult.scenes.length} scenes, ${mappingResult.syncedLyrics.length} lyric lines`);
    console.log(`📈 Mapping coverage: ${(mappingResult.mappingQuality.coverage * 100).toFixed(1)}%`);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('🚨 [API] Video generation error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Video generation failed',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
} 