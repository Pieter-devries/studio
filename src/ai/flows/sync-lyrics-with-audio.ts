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
  model: 'googleai/gemini-1.5-flash-latest',
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
2.  **COMPLETE OUTPUT:** Your response MUST contain a timestamp for every single line and every single word from the provided lyrics. The final word of the song must have a timestamp.
3.  **DATA INTEGRITY:** Preserve original punctuation and capitalization for all text fields ("line" and "text"). Do not alter the lyrics.
4.  **ACCURATE TIMESTAMPS:** Provide a "startTime" in MILLISECONDS for every line and every word. The timestamps must be sequential and increase realistically throughout the song's duration.
5.  **FINAL VERIFICATION:** Before producing the final output, mentally review your work. Check: Is the *entire* song transcribed? Does the *last word* of the song have a timestamp? Are all timestamps sequential? Any failure to timestamp the entire song is a critical error.

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
