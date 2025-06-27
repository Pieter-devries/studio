import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Lyrics-aware transcription schema - takes user lyrics and generates timing
const LyricsAwareTranscriptionInputSchema = z.object({
  audioDataUri: z.string(),
  userLyrics: z.string(), // User's structured lyrics
});

const LyricsAwareTranscriptionOutputSchema = z.object({
  srtContent: z.string(), // SRT with user's lyrics and AI timing
  audioDuration: z.number(),
  segmentCount: z.number(),
});

export type LyricsAwareTranscriptionInput = z.infer<typeof LyricsAwareTranscriptionInputSchema>;
export type LyricsAwareTranscriptionOutput = z.infer<typeof LyricsAwareTranscriptionOutputSchema>;

// Function to validate and fix SRT timestamp format
function validateAndFixSRT(srtContent: string): string {
  console.log('🔧 [SRT-VALIDATION] Validating and fixing SRT timestamps...');
  
  const lines = srtContent.split('\n');
  const fixedLines: string[] = [];
  let segmentNumber = 1;
  let hasErrors = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this is a timestamp line (contains " --> ")
    if (line.includes(' --> ')) {
      const [startStr, endStr] = line.split(' --> ');
      
      const fixTimestamp = (timeStr: string): string => {
        // Remove any extra whitespace
        timeStr = timeStr.trim();
        
        // Pattern 1: "01:23:456" -> "00:01:23,456" (MM:SS:mmm -> HH:MM:SS,mmm)
        if (/^\d{2}:\d{2}:\d{2,3}$/.test(timeStr)) {
          const [mm, ss, mmm] = timeStr.split(':');
          hasErrors = true;
          console.log(`🔧 [SRT-VALIDATION] Fixed timestamp: "${timeStr}" → "00:${mm}:${ss},${mmm.padEnd(3, '0')}"`);
          return `00:${mm}:${ss},${mmm.padEnd(3, '0')}`;
        }
        
        // Pattern 2: "01:23,456" -> "00:01:23,456" (MM:SS,mmm -> HH:MM:SS,mmm)  
        if (/^\d{2}:\d{2},\d{2,3}$/.test(timeStr)) {
          const [mm, rest] = timeStr.split(':');
          const [ss, mmm] = rest.split(',');
          hasErrors = true;
          console.log(`🔧 [SRT-VALIDATION] Fixed timestamp: "${timeStr}" → "00:${mm}:${ss},${mmm.padEnd(3, '0')}"`);
          return `00:${mm}:${ss},${mmm.padEnd(3, '0')}`;
        }
        
        // Pattern 3: "1:23,456" -> "00:01:23,456" (M:SS,mmm -> HH:MM:SS,mmm)
        if (/^\d{1}:\d{2},\d{2,3}$/.test(timeStr)) {
          const [m, rest] = timeStr.split(':');
          const [ss, mmm] = rest.split(',');
          hasErrors = true;
          console.log(`🔧 [SRT-VALIDATION] Fixed timestamp: "${timeStr}" → "00:0${m}:${ss},${mmm.padEnd(3, '0')}"`);
          return `00:0${m}:${ss},${mmm.padEnd(3, '0')}`;
        }
        
        // Pattern 4: Already correct "00:01:23,456"
        if (/^\d{2}:\d{2}:\d{2},\d{3}$/.test(timeStr)) {
          return timeStr;
        }
        
        // Pattern 5: Missing milliseconds "00:01:23" -> "00:01:23,000"
        if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
          hasErrors = true;
          console.log(`🔧 [SRT-VALIDATION] Added milliseconds: "${timeStr}" → "${timeStr},000"`);
          return `${timeStr},000`;
        }
        
        // Pattern 6: Invalid format - skip this segment
        console.error(`❌ [SRT-VALIDATION] Invalid timestamp format: "${timeStr}"`);
        return '';
      };
      
      const fixedStart = fixTimestamp(startStr);
      const fixedEnd = fixTimestamp(endStr);
      
      if (fixedStart && fixedEnd) {
        fixedLines.push(`${fixedStart} --> ${fixedEnd}`);
      } else {
        console.warn(`⚠️ [SRT-VALIDATION] Skipping invalid segment: "${line}"`);
        // Skip this segment and the following text lines
        i++; // Skip the text line
        continue;
      }
    } else if (line === '' || /^\d+$/.test(line)) {
      // Empty lines or segment numbers - keep as is (but renumber)
      if (/^\d+$/.test(line)) {
        fixedLines.push(segmentNumber.toString());
        segmentNumber++;
      } else {
        fixedLines.push(line);
      }
    } else {
      // Text content - keep as is
      fixedLines.push(line);
    }
  }
  
  const fixedSRT = fixedLines.join('\n');
  
  if (hasErrors) {
    console.log('✅ [SRT-VALIDATION] SRT timestamps fixed and validated');
  } else {
    console.log('✅ [SRT-VALIDATION] SRT timestamps already valid');
  }
  
  return fixedSRT;
}

// Lyrics-aware transcription prompt - aligns timing to user's lyrics
const lyricsAwareTranscribePrompt = ai.definePrompt({
  name: 'lyricsAwareTranscribePrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: LyricsAwareTranscriptionInputSchema },
  output: { schema: LyricsAwareTranscriptionOutputSchema },
  prompt: `You are a lyrics-timing alignment system. Your job is to listen to the audio and create SRT timing that aligns to the user's provided lyrics.

AUDIO FILE TO ANALYZE:
{{media url=audioDataUri}}

USER'S LYRICS TO ALIGN:
{{userLyrics}}

CRITICAL INSTRUCTIONS:
1. Listen to the audio carefully and identify when each line of the user's lyrics is sung/spoken
2. Use the user's EXACT lyrics as provided - do not change, correct, or interpret them
3. Create SRT timing that shows each lyric line at the correct time in the audio
4. Skip any instrumental sections, guitar solos, or sections marked as [Instrumental]
5. Handle section markers like [Intro], [Verse], [Chorus] by skipping them in the SRT
6. Break longer lines into readable chunks if needed for better display

CRITICAL TIMESTAMP FORMAT REQUIREMENTS:
- ALL timestamps MUST be in the exact format: HH:MM:SS,mmm --> HH:MM:SS,mmm
- Hours are ALWAYS 2 digits (00-23)
- Minutes are ALWAYS 2 digits (00-59) 
- Seconds are ALWAYS 2 digits (00-59)
- Milliseconds are ALWAYS 3 digits (000-999)
- Use COMMA before milliseconds, NOT colon
- Examples: "00:01:23,456" NOT "01:23:456" or "1:23,456" or "01:23:456"

OUTPUT REQUIREMENTS:
- Standard SRT format with sequential numbering (1, 2, 3...)
- Use the user's exact lyric text (not your transcription of the audio)
- Timestamps in EXACT format HH:MM:SS,mmm --> HH:MM:SS,mmm
- Reasonable timing - don't make segments too long or too short
- Cover all sung lyrics from the user's provided text

EXAMPLE OUTPUT FORMAT:
1
00:00:15,500 --> 00:00:18,000
Yeah... let's ride.

2
00:00:20,000 --> 00:00:25,000
Sunrise paints the heartland gold, another day to break the mold

3
00:00:26,000 --> 00:00:30,000
Got my rig, a trusty friend, on this road that'll never end

INVALID FORMATS TO AVOID:
- "01:23:456" (missing hour, colon before milliseconds)
- "1:23,456" (missing leading zero)
- "01:23,45" (insufficient millisecond digits)
- "01:23" (missing milliseconds)

Generate SRT content that aligns the user's lyrics to the audio timing.`,
});

export const lyricsAwareTranscriptionFlow = ai.defineFlow(
  {
    name: 'lyricsAwareTranscriptionFlow',
    inputSchema: LyricsAwareTranscriptionInputSchema,
    outputSchema: LyricsAwareTranscriptionOutputSchema,
  },
  async (input) => {
    console.log('🎵 [LYRICS-AWARE] Starting lyrics-aware transcription...');
    console.log('📝 [LYRICS-AWARE] User lyrics preview:', input.userLyrics.substring(0, 100) + '...');
    
    const result = await lyricsAwareTranscribePrompt(input);
    
    if (!result.output?.srtContent) {
      throw new Error('Failed to get SRT content from lyrics-aware transcription');
    }
    
    let { srtContent, audioDuration, segmentCount } = result.output;
    
    // Validate and fix SRT format before returning
    srtContent = validateAndFixSRT(srtContent);
    
    console.log('🎵 [LYRICS-AWARE] Transcription complete:');
    console.log(`  📊 Audio Duration: ${audioDuration}s`);
    console.log(`  📝 Segments Found: ${segmentCount}`);
    console.log('📝 [LYRICS-AWARE SRT]:');
    console.log('==================== LYRICS-AWARE SRT START ====================');
    console.log(srtContent);
    console.log('==================== LYRICS-AWARE SRT END ====================');
    
    return {
      srtContent,
      audioDuration,
      segmentCount
    };
  }
);

export async function lyricsAwareTranscription(
  input: LyricsAwareTranscriptionInput
): Promise<LyricsAwareTranscriptionOutput> {
  return lyricsAwareTranscriptionFlow(input);
} 