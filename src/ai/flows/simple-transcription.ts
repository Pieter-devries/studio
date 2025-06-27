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

// Simple transcription prompt - just get timing, no complex processing
const simpleTranscribePrompt = ai.definePrompt({
  name: 'simpleTranscribePrompt',
  model: 'googleai/gemini-2.5-flash',
  input: { schema: SimpleTranscriptionInputSchema },
  output: { schema: SimpleTranscriptionOutputSchema },
  prompt: `You are a simple audio transcription system. Your job is to transcribe the audio and provide basic timing information in SRT format.

AUDIO FILE TO TRANSCRIBE:
{{media url=audioDataUri}}

INSTRUCTIONS:
1. Listen to the entire audio file carefully
2. Transcribe all spoken/sung words you can hear
3. Provide timing information in standard SRT format
4. Focus on accuracy of timing - this will be reviewed by a human
5. Don't worry about perfect word-level timing, just get phrase/line timing right
6. Include instrumental sections as gaps in the SRT

OUTPUT REQUIREMENTS:
- Standard SRT format with sequential numbering
- Timestamps in HH:MM:SS,mmm format
- Reasonable line breaks for readability
- Cover the entire audio duration
- Be conservative with timing - better to be slightly early than late

Example SRT format:
1
00:00:15,500 --> 00:00:18,000
First line of lyrics

2
00:00:20,000 --> 00:00:25,000
Second line of lyrics

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
    
    const { srtContent, audioDuration, segmentCount } = result.output;
    
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