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
  model: 'googleai/gemini-2.5-flash',
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
5.  **DATA INTEGRITY:** Preserve original punctuation and capitalization for all text fields ("line" and "text"). Do not alter the lyrics. EXCLUDE section headers like [Verse], [Chorus], [Bridge] from the output - only sync actual sung lyrics.
6.  **ACCURATE TIMESTAMPS:** Provide a "startTime" in MILLISECONDS for every line and every word. The timestamps must be sequential and increase realistically throughout the song's duration.
7.  **VOCAL TIMING PRECISION:** If there are instrumental breaks, bridges, or pauses between verses, ensure the timing accurately reflects when each lyric section resumes.
8.  **SONG STRUCTURE AWARENESS:** Pay attention to song sections like [Verse], [Chorus], [Bridge], [Guitar Solo], [Outro]. These indicate song structure and help identify when lyrics pause for instrumental sections.
9.  **INSTRUMENTAL SECTIONS:** If you see sections like [Guitar Solo] or [Instrumental], these indicate NO VOCALS during that time. Skip ahead to the next vocal section and sync accordingly.
10. **REPEATED SECTIONS:** Choruses and verses may repeat with the same lyrics. Each repetition should be synced to when it's actually sung, not just the first occurrence.
11. **HANDLE INCOMPLETE LYRICS:** If the provided lyrics end before the song ends (common with instrumental outros), you MUST still sync all provided lyrics to their correct positions. Do NOT create or invent additional lyrics.
12. **SONG DURATION AWARENESS:** Listen to the full audio duration. If vocals continue after the provided lyrics end, sync only what was provided. If the song has instrumental sections after lyrics, that's normal.
13. **FINAL VERIFICATION (MANDATORY):** Before producing the final output, verify your work against these rules. Check: Are all *provided* lyrics transcribed with accurate timing? Does the *last provided word* have a timestamp that matches when it's actually sung? Is the first timestamp accurate to the vocal start (not 0:00 unless vocals truly start immediately)? Are all timestamps sequential and realistic?

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
    // Get the fully structured object from the AI.
    const {output} = await prompt(input);
    if (!output || !output.syncedLyrics || !Array.isArray(output.syncedLyrics) || output.syncedLyrics.length === 0) {
      throw new Error(
        'Failed to synchronize lyrics. The AI did not return a valid nested structure.'
      );
    }
    // No reconstruction needed! Just return the output.
    return output;
  }
);
