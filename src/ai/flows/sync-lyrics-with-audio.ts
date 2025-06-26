'use server';
/**
 * @fileOverview Synchronizes lyrics with audio using AI.
 *
 * - syncLyricsWithAudio - A function that handles the lyric synchronization process.
 * - SyncLyricsWithAudioInput - The input type for the syncLyricsWithAudio function.
 * - SyncLyricsWithAudioOutput - The return type for the syncLyricsWithAudio function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SyncLyricsWithAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio file as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  lyrics: z.string().describe('The lyrics of the song.'),
});
export type SyncLyricsWithAudioInput = z.infer<typeof SyncLyricsWithAudioInputSchema>;

const WordSchema = z.object({
  text: z.string().describe('The word.'),
  startTime: z
    .number()
    .describe('The start time of the word in milliseconds.'),
});

const SyncedLyricSchema = z.object({
  line: z.string().describe('The full text of the lyric line.'),
  startTime: z
    .number()
    .describe('The start time of the lyric line in milliseconds.'),
  words: z
    .array(WordSchema)
    .describe('An array of synchronized words in the line.'),
});

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
  input: {schema: SyncLyricsWithAudioInputSchema},
  output: {schema: SyncLyricsWithAudioOutputSchema},
  prompt: `You are an expert AI at synchronizing song lyrics with an audio file. Your task is to listen to the audio and determine the precise start time for each LINE and each WORD of the provided lyrics.

The output must be a valid JSON object. This JSON object must contain a single key, "syncedLyrics", which is an array of objects. Each object in the array represents a line of the lyrics and must have THREE keys:
1.  "line": The full text of the lyric line (as a string).
2.  "startTime": The start time of the lyric line in MILLISECONDS (as a number).
3.  "words": An array of word objects. Each word object must have two keys:
    a. "text": The individual word (as a string).
    b. "startTime": The start time of that specific word in MILLISECONDS (as a number).

CRITICAL TIMING INSTRUCTIONS:
- The timestamps MUST be distributed throughout the entire song's duration. They must directly correspond to when the words are actually sung in the audio.
- DO NOT cluster all timestamps at the beginning. This is a common failure mode and must be avoided.
- The 'startTime' for each line must be the 'startTime' of the first word in that line.
- Each word's 'startTime' must be greater than or equal to the previous word's 'startTime'.
- The first line's 'startTime' should be when the singing actually begins, which may not be 0ms.
- Before outputting the final JSON, double-check your work to ensure the timestamps are sequential and realistically spaced out across the song's full length.

Analyze the audio very carefully to ensure the timestamps are accurate and reflect the exact moment each line and word is sung.

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
    const {output} = await prompt(input);
    if (
      !output ||
      !output.syncedLyrics ||
      !Array.isArray(output.syncedLyrics)
    ) {
      throw new Error(
        'Failed to synchronize lyrics. The AI did not return valid data in the expected format.'
      );
    }
    return output;
  }
);
