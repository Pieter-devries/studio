'use server';
/**
 * @fileOverview Synchronizes lyrics with audio using AI.
 *
 * - syncLyricsWithAudio - A function that handles the lyric synchronization process.
 * - SyncLyricsWithAudioInput - The input type for the syncLyricsWithaudio function.
 * - SyncLyricsWithAudioOutput - The return type for the syncLyricsWithAudio function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { SyncedLyricSchema } from '@/ai/schema';

const SyncLyricsWithAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio file as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  lyrics: z.string().describe('The lyrics of the song.'),
});
export type SyncLyricsWithAudioInput = z.infer<typeof SyncLyricsWithAudioInputSchema>;

// The final output structure required by the frontend
const SyncLyricsWithAudioOutputSchema = z.object({
  syncedLyrics: z
    .array(SyncedLyricSchema)
    .describe('An array of synchronized lyric objects.'),
});
export type SyncLyricsWithAudioOutput = z.infer<typeof SyncLyricsWithAudioOutputSchema>;


export async function syncLyricsWithAudio(
  input: SyncLyricsWithAudioInput
): Promise<SyncLyricsWithAudioOutput> {
  return syncLyricsWithAudioFlow(input);
}

const prompt = ai.definePrompt({
  name: 'syncLyricsWithAudioPrompt',
  model: 'googleai/gemini-2.5-pro',
  input: {schema: SyncLyricsWithAudioInputSchema},
  output: {schema: SyncLyricsWithAudioOutputSchema},
  prompt: `You are an expert AI at synchronizing song lyrics with an audio file. Your task is to listen to the ENTIRE audio file and determine the precise start time for EVERY line and EVERY WORD of the provided lyrics.

The output must be a valid JSON object matching this structure:
{
  "syncedLyrics": [
    {
      "line": "The full text of the lyric line.",
      "startTime": 1234,
      "words": [
        {
          "text": "The",
          "startTime": 1234
        }
      ]
    }
  ]
}

CRITICAL INSTRUCTIONS - FOLLOW THESE EXACTLY:
1.  **MANDATORY FULL ANALYSIS:** You MUST analyze the audio file from the absolute beginning to the absolute end. Do not stop early. Incomplete analysis is a failure.
2.  **DETECT VOCAL START:** Pay careful attention to instrumental introductions, silence, or music-only sections. The first lyric timestamp MUST be the exact moment vocals BEGIN, NOT at 0:00 unless vocals actually start immediately.
3.  **COMPLETE OUTPUT:** Your response MUST contain a timestamp for every single line and every single word from the provided lyrics. The final word of the song must have a timestamp. Missing a single word is a failure.
4.  **ACCURATE START TIME:** The \`startTime\` for the very first word MUST be the exact moment that word is sung, which may be several seconds or more after the audio file begins. Listen for instrumental intros, silence, or build-up before vocals start.
5.  **PRESERVE EXACT LINE STRUCTURE (CRITICAL):** The lyrics are already properly divided into lines. You MUST maintain the exact line structure as provided in the input. Do NOT split lines or combine lines under ANY circumstances. Each line in your output must exactly match a line from the input text, preserving all punctuation, capitalization, and spacing. For example, if the input has "Yeah... let's ride." as ONE line, your output must have "Yeah... let's ride." as ONE line - never split it into separate lines like "Yeah..." and "let's ride."
6.  **DATA INTEGRITY & SECTION HANDLING:** Any text within square brackets (e.g., [Verse], [Chorus], [Instrumental], [Guitar Solo]) denotes song structure or a non-lyrical section. These markers are crucial for timing and context, but they MUST be EXCLUDED from the final \`syncedLyrics\` array. Do not include bracketed text in the output.
7.  **ACCURATE TIMESTAMPS:** Provide a "startTime" in MILLISECONDS for every line and every word. The timestamps must be sequential and increase realistically throughout the song's duration.
8.  **VOCAL TIMING PRECISION:** If there are instrumental breaks, bridges, or pauses between verses, ensure the timing accurately reflects when each lyric section resumes.
9.  **HANDLING LONG INSTRUMENTAL SECTIONS:** Some songs have very long instrumental sections (30+ seconds, even 60+ seconds) between vocal parts. When you encounter bracketed markers like [Guitar Solo] or [Instrumental], expect a potentially very long period with no vocals. Listen carefully through the entire instrumental section to find when vocals resume. Do not rush or guess - wait for the actual vocal start.
10. **REPEATED SECTIONS:** Choruses and verses may repeat with the same lyrics. Each repetition should be synced to when it's actually sung, not just the first occurrence.
11. **HANDLE INCOMPLETE LYRICS:** If the provided lyrics end before the song ends (common with instrumental outros), you MUST still sync all provided lyrics to their correct positions. Do NOT create or invent additional lyrics.
12. **SONG DURATION AWARENESS:** Listen to the full audio duration. If vocals continue after the provided lyrics end, sync only what was provided. If the song has instrumental sections after lyrics, that's normal.
13. **FINAL VERIFICATION (MANDATORY):** Before producing the final output, verify your work against these rules. Check: Are all *provided* lyrics transcribed with accurate timing? Does the *last provided word* have a timestamp that matches when it's actually sung? Is the first timestamp accurate to the vocal start (not 0:00 unless vocals truly start immediately)? Are all timestamps sequential and realistic? Does each output line exactly match an input line? CRITICAL: Count the lines in your output - it MUST equal the number of non-bracketed lines in the input. If you have more or fewer lines, you made an error.

Here is the audio:
{{media url=audioDataUri}}

Here are the lyrics:
{{{lyrics}}}

Produce ONLY the JSON output, with no other text or explanation.`,
  config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
      },
    ],
  },
});

const syncLyricsWithAudioFlow = ai.defineFlow(
  {
    name: 'syncLyricsWithAudioFlow',
    inputSchema: SyncLyricsWithAudioInputSchema,
    outputSchema: SyncLyricsWithAudioOutputSchema,
  },
  async input => {
    // Use two-stage approach: transcribe first, then align
    console.log('🎵 [SYNC] Starting two-stage lyric synchronization...');
    
    // Stage 1: Transcribe audio to SRT
    console.log('🎵 [SYNC] Stage 1: Transcribing audio to SRT...');
    
    const transcribeToSrtPrompt = ai.definePrompt({
      name: 'transcribeToSrt_inline',
      model: 'googleai/gemini-1.5-pro',
      input: {schema: z.object({ audioDataUri: z.string() })},
      output: {schema: z.object({ srtContent: z.string() })},
      prompt: `You are an expert speech-to-text transcription service. Your task is to transcribe the ENTIRE audio file into SRT (SubRip Subtitle) format.

CRITICAL REQUIREMENTS:
1. **COMPLETE TRANSCRIPTION**: Listen to the ENTIRE audio file from start to finish - do not stop early
2. **ACCURATE TIMESTAMPS**: Use the exact format HH:MM:SS,mmm --> HH:MM:SS,mmm
3. **NATURAL GAPS**: When there are instrumental sections or silence, simply don't create entries - this naturally handles instrumentals
4. **PRECISE TIMING**: Start and end times should reflect exactly when words are spoken
5. **CLEAR TEXT**: Transcribe what you hear, don't worry about perfect grammar
6. **NO FABRICATION**: Only transcribe actual spoken/sung words, ignore background music
7. **FULL DURATION**: Continue transcribing until the very end of the audio file

IMPORTANT: The audio may have repeated sections (like choruses). Transcribe each occurrence separately with its actual timestamp.

Example SRT format:
1
00:00:06,900 --> 00:00:08,500
Yeah... let's ride.

2
00:00:14,500 --> 00:00:20,500
Sunrise paints the heartland gold, another day to break the mold

3
00:01:45,200 --> 00:01:51,800
Yeah, we're singing 'bout freedom, trucks, and guns

Here is the audio to transcribe:
{{media url=audioDataUri}}

Transcribe the COMPLETE audio file. Provide ONLY the SRT content, with no other text or explanation.`,
    });

    try {
      const transcriptionResult = await transcribeToSrtPrompt({ 
        audioDataUri: input.audioDataUri 
      });
      
      if (!transcriptionResult.output?.srtContent) {
        throw new Error('Failed to transcribe audio to SRT format');
      }

      const srtContent = transcriptionResult.output.srtContent;
      console.log('🎵 [SYNC] Stage 1 SUCCESS: Generated SRT content');
      console.log('📝 [SRT FULL CONTENT]:');
      console.log('==================== FULL SRT START ====================');
      console.log(srtContent);
      console.log('==================== FULL SRT END ====================');
      
      // Parse SRT to show timestamps for debugging
      const srtLines = srtContent.split('\n');
      const timestamps = [];
      const segments = [];
      for (let i = 0; i < srtLines.length; i++) {
        if (srtLines[i].includes('-->')) {
          const [startTime, endTime] = srtLines[i].split(' --> ');
          timestamps.push(startTime);
          const text = srtLines[i + 1] || '';
          segments.push({ start: startTime, end: endTime, text: text.substring(0, 30) + '...' });
        }
      }
      console.log('⏰ [SRT] Total segments found:', segments.length);
      console.log('⏰ [SRT] Timestamp range:', timestamps[0], 'to', timestamps[timestamps.length - 1]);
      console.log('📊 [SRT] All segments:', segments);

      // Stage 2: Align structured lyrics with transcription
      console.log('🎵 [SYNC] Stage 2: Aligning structured lyrics with SRT...');
      
             const alignTranscriptionPrompt = ai.definePrompt({
         name: 'alignTranscription_inline', 
         model: 'googleai/gemini-2.5-flash',
         input: {schema: z.object({ 
           audioDataUri: z.string(),
           structuredLyrics: z.string(),
           srtContent: z.string()
         })},
         output: {schema: z.object({
           syncedLyrics: z.array(SyncedLyricSchema)
         })},
         prompt: `You are a precise timestamp mapper. Your ONLY job is to map structured lyrics to SRT timestamps - NO ESTIMATION ALLOWED.

STEP-BY-STEP PROCESS:
1. **PARSE SRT**: Extract all timestamp segments from the SRT
2. **MATCH LYRICS**: For each structured lyric line (ignore [brackets]), find the best matching SRT segment by text similarity
3. **USE EXACT TIMESTAMPS**: Use ONLY the start timestamp from the matching SRT segment, converted to milliseconds
4. **NO CREATION**: Do NOT create new timestamps, do NOT estimate, do NOT interpolate

CRITICAL RULES:
- **ONLY SRT TIMESTAMPS**: Every startTime MUST come directly from an SRT segment
- **STRICT CONVERSION**: "00:00:08,827" = 8827 milliseconds exactly
- **TEXT MATCHING**: Match based on similar words/phrases between structured lyrics and SRT text
- **PRESERVE GAPS**: If SRT has gaps (instrumental sections), your output will naturally have gaps too
- **NO GUESSING**: If no good SRT match exists for a lyric line, skip it rather than guess

EXAMPLE MAPPING:
SRT: "00:00:08,827 --> 00:00:10,427\nYeah"
Structured: "Yeah... let's ride."
Result: Use 8827 as startTime for "Yeah... let's ride."

SRT: "00:00:14,927 --> 00:00:20,693\nSunrise paints the heartland gold"  
Structured: "Sunrise paints the heartland gold, another day to break the mold"
Result: Use 14927 as startTime for the structured line

WORD TIMING: Distribute words evenly within the SRT segment's duration.

Output format:
{
  "syncedLyrics": [
    {
      "line": "Exact structured lyric text",
      "startTime": 8827,
      "words": [
        { "text": "Yeah...", "startTime": 8827 },
        { "text": "let's", "startTime": 9200 },
        { "text": "ride.", "startTime": 9600 }
      ]
    }
  ]
}

SRT Transcription:
{{{srtContent}}}

Structured Lyrics:
{{{structuredLyrics}}}

Map ONLY to existing SRT timestamps. Produce ONLY the JSON output.`,
       });

      const alignmentResult = await alignTranscriptionPrompt({
        audioDataUri: input.audioDataUri,
        structuredLyrics: input.lyrics,
        srtContent: srtContent
      });

      if (!alignmentResult.output?.syncedLyrics || !Array.isArray(alignmentResult.output.syncedLyrics)) {
        throw new Error('Failed to align structured lyrics with transcription');
      }

      console.log('🎵 [SYNC] Stage 2 SUCCESS: Aligned lyrics generated');
      console.log('📊 [SYNC] Two-stage result: ' + alignmentResult.output.syncedLyrics.length + ' lyric lines');
      
      // Log timing sample for debugging
      const firstLyric = alignmentResult.output.syncedLyrics[0];
      const lastLyric = alignmentResult.output.syncedLyrics[alignmentResult.output.syncedLyrics.length - 1];
      console.log('⏰ [SYNC] First lyric timing: "' + firstLyric?.line.substring(0, 30) + '..." at ' + (firstLyric?.startTime / 1000).toFixed(1) + 's');
      console.log('⏰ [SYNC] Last lyric timing: "' + lastLyric?.line.substring(0, 30) + '..." at ' + (lastLyric?.startTime / 1000).toFixed(1) + 's');

      return {
        syncedLyrics: alignmentResult.output.syncedLyrics
      };
    } catch (error) {
      console.error('❌ [SYNC] Two-stage approach FAILED, falling back to direct approach:');
      console.error('❌ [SYNC] Error details:', error instanceof Error ? error.message : String(error));
      console.error('❌ [SYNC] Full error:', error);
      
      // Fallback to original approach if two-stage fails
      console.log('🔄 [SYNC] Using fallback direct synchronization...');
      const {output} = await prompt(input);
      if (!output || !output.syncedLyrics || !Array.isArray(output.syncedLyrics) || output.syncedLyrics.length === 0) {
        throw new Error(
          'Failed to synchronize lyrics. Both two-stage and direct approaches failed.'
        );
      }
      console.log('🔄 [SYNC] Fallback SUCCESS: ' + output.syncedLyrics.length + ' lyric lines from direct approach');
      return output;
    }
  }
);
