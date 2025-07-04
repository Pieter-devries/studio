import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Simple transcription schema - just get basic timing
const SimpleTranscriptionInputSchema = z.object({
  audioDataUri: z.string(),
});

const SimpleTranscriptionOutputSchema = z.object({
  srtContent: z.string(),
  audioDuration: z.number(),
  segmentCount: z.number(),
});

export type SimpleTranscriptionInput = z.infer<typeof SimpleTranscriptionInputSchema>;
export type SimpleTranscriptionOutput = z.infer<typeof SimpleTranscriptionOutputSchema>;

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

// Simple transcription prompt - just get timing, no complex processing
const simpleTranscribePrompt = ai.definePrompt({
  name: 'simpleTranscribePrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: SimpleTranscriptionInputSchema },
  output: { schema: SimpleTranscriptionOutputSchema },
  prompt: `You are a simple audio transcription system. Your job is to transcribe the audio and provide basic timing information in SRT format.

AUDIO FILE TO TRANSCRIBE:
{{media url=audioDataUri}}

CRITICAL TIMESTAMP FORMAT REQUIREMENTS:
- ALL timestamps MUST be in the exact format: HH:MM:SS,mmm --> HH:MM:SS,mmm
- Hours are ALWAYS 2 digits (00-23)
- Minutes are ALWAYS 2 digits (00-59) 
- Seconds are ALWAYS 2 digits (00-59)
- Milliseconds are ALWAYS 3 digits (000-999)
- Use COMMA before milliseconds, NOT colon
- Examples: "00:01:23,456" NOT "01:23:456" or "1:23,456" or "01:23:456"

INSTRUCTIONS:
1. Listen to the entire audio file carefully
2. Transcribe all spoken/sung words you can hear
3. Provide timing information in standard SRT format
4. Focus on accuracy of timing - this will be reviewed by a human
5. Don't worry about perfect word-level timing, just get phrase/line timing right
6. Include instrumental sections as gaps in the SRT

OUTPUT REQUIREMENTS:
- Standard SRT format with sequential numbering (1, 2, 3...)
- Timestamps in EXACT format HH:MM:SS,mmm --> HH:MM:SS,mmm
- Reasonable line breaks for readability
- Cover the entire audio duration
- Be conservative with timing - better to be slightly early than late

VALID SRT FORMAT EXAMPLE:
1
00:00:15,500 --> 00:00:18,000
First line of lyrics

2
00:00:20,000 --> 00:00:25,000
Second line of lyrics

3
00:01:30,250 --> 00:01:35,750
Third line after a gap

INVALID FORMATS TO AVOID:
- "01:23:456" (missing hour, colon before milliseconds)
- "1:23,456" (missing leading zero)
- "01:23,45" (insufficient millisecond digits)
- "01:23" (missing milliseconds)

Transcribe the audio and return the SRT content along with basic analysis.`,
});

export const simpleTranscriptionFlow = ai.defineFlow(
  {
    name: 'simpleTranscriptionFlow',
    inputSchema: SimpleTranscriptionInputSchema,
    outputSchema: SimpleTranscriptionOutputSchema,
  },
  async (input) => {
    console.log('🎤 [SIMPLE] Starting basic transcription for human verification...');
    
    const result = await simpleTranscribePrompt(input);
    
    if (!result.output?.srtContent) {
      throw new Error('Failed to get SRT content from simple transcription');
    }
    
    let { srtContent, audioDuration, segmentCount } = result.output;
    
    // Validate and fix SRT format before returning
    srtContent = validateAndFixSRT(srtContent);
    
    console.log('🎤 [SIMPLE] Transcription complete:');
    console.log(`  📊 Audio Duration: ${audioDuration}s`);
    console.log(`  📝 Segments Found: ${segmentCount}`);
    console.log('📝 [SIMPLE SRT]:');
    console.log('==================== SIMPLE SRT START ====================');
    console.log(srtContent);
    console.log('==================== SIMPLE SRT END ====================');
    
    return {
      srtContent,
      audioDuration,
      segmentCount
    };
  }
);

export async function simpleTranscription(
  input: SimpleTranscriptionInput
): Promise<SimpleTranscriptionOutput> {
  return simpleTranscriptionFlow(input);
} 