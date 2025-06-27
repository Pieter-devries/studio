import { NextRequest, NextResponse } from 'next/server';
import { generateDynamicBackground } from '@/ai/flows/generate-dynamic-background';

// Function to parse SRT directly into syncedLyrics format
function parseSRTToSyncedLyrics(srtContent: string, timingOffset: number = 0) {
  console.log('📝 [SRT-PARSER] Parsing SRT directly to synced lyrics...');
  console.log('📝 [SRT-PARSER] Timing offset:', timingOffset, 'ms');
  
  const lines = srtContent.split('\n');
  const syncedLyrics = [];
  
  let currentSegment: any = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and segment numbers
    if (!line || /^\d+$/.test(line)) {
      continue;
    }
    
    // Check if this is a timestamp line
    if (line.includes(' --> ')) {
      const [startStr, endStr] = line.split(' --> ');
      
      const parseTimestamp = (timeStr: string): number => {
        const parts = timeStr.split(/[:\.,]/);
        if (parts.length === 4) {
          const hours = parseInt(parts[0]);
          const minutes = parseInt(parts[1]);
          const seconds = parseInt(parts[2]);
          const milliseconds = parseInt(parts[3]);
          return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
        }
        return 0;
      };
      
      const baseStartTime = parseTimestamp(startStr);
      const baseEndTime = parseTimestamp(endStr);
      
      console.log(`📝 [SRT-PARSER] Raw timestamp: ${startStr} → ${baseStartTime}ms, offset: ${timingOffset}ms`);
      
      currentSegment = {
        startTime: baseStartTime + timingOffset,
        endTime: baseEndTime + timingOffset,
        text: ''
      };
    } else if (currentSegment) {
      // This is text content
      if (currentSegment.text) {
        currentSegment.text += ' ' + line;
      } else {
        currentSegment.text = line;
      }
      
      // If next line is empty or new segment number, finalize this segment
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      if (!nextLine || /^\d+$/.test(nextLine)) {
        // Create synced lyric with simple word timing
        const words = currentSegment.text.split(' ').map((word: string, index: number, array: string[]) => {
          const wordDuration = (currentSegment.endTime - currentSegment.startTime) / array.length;
          return {
            text: word,
            startTime: currentSegment.startTime + (index * wordDuration)
          };
        });
        
        syncedLyrics.push({
          line: currentSegment.text,
          startTime: currentSegment.startTime,
          words: words
        });
        
        console.log(`📝 [SRT-PARSER] Final segment: "${currentSegment.text.substring(0, 30)}..." | ${(currentSegment.startTime/1000).toFixed(1)}s-${(currentSegment.endTime/1000).toFixed(1)}s`);
        
        currentSegment = null;
      }
    }
  }
  
  console.log(`📝 [SRT-PARSER] Parsed ${syncedLyrics.length} segments from SRT`);
  return syncedLyrics;
}

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

    console.log('🎬 [API] Starting simplified video generation...');
    
    // Step 1: Parse SRT directly to synced lyrics (no mapping agent)
    console.log('📝 [API] Parsing SRT to synced lyrics...');
    const syncedLyrics = parseSRTToSyncedLyrics(srtContent, timingOffset || 0);

    // Step 2: Generate background scenes
    console.log('🖼️ [API] Generating background scenes...');
    const backgroundResult = await generateDynamicBackground({
      audioDataUri,
      lyrics: structuredLyrics
    });

    if (!syncedLyrics || !backgroundResult?.scenes) {
      throw new Error('Failed to complete video generation');
    }
    
    if (syncedLyrics.length === 0) {
      throw new Error('Failed to parse SRT - no valid segments found');
    }

    const result = {
      syncedLyrics: syncedLyrics,
      backgroundScenes: backgroundResult.scenes,
      mappingQuality: { 
        coverage: 1.0, // 100% since we're using exact SRT 
        totalLines: syncedLyrics.length,
        mappedLines: syncedLyrics.length
      }
    };

    console.log('🎉 [API] Video generation complete!');
    console.log(`📊 Result: ${backgroundResult.scenes.length} scenes, ${syncedLyrics.length} lyric lines`);
    console.log(`📈 SRT coverage: 100% (direct parsing)`);
    
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