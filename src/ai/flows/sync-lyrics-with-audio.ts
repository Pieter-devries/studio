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

// The final output structure required by the frontend
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

// A simpler schema for the AI to generate, which we will process later.
const AIWordTimingSchema = z.object({
  words: z.array(
    z.object({
      text: z.string().describe('A single word from the lyrics.'),
      startTime: z
        .number()
        .describe('The start time of the word in milliseconds.'),
    })
  ),
});

export async function syncLyricsWithAudio(
  input: SyncLyricsWithAudioInput
): Promise<SyncLyricsWithAudioOutput> {
  return syncLyricsWithAudioFlow(input);
}

const prompt = ai.definePrompt({
  name: 'syncLyricsWithAudioPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: {schema: SyncLyricsWithAudioInputSchema},
  output: {schema: AIWordTimingSchema},
  prompt: `You are an expert AI at synchronizing song lyrics with an audio file. Your task is to listen to the ENTIRE audio file and determine the precise start time for EVERY SINGLE WORD of the provided lyrics.

The output must be a valid JSON object. This JSON object must contain a single key, "words", which is an array of objects. Each object in the array represents a single word and must have TWO keys:
1.  "text": The word from the lyrics (as a string).
2.  "startTime": The start time of that specific word in MILLISECONDS (as a number).

CRITICAL INSTRUCTIONS:
1.  First, analyze the ENTIRE audio file from beginning to end. This is mandatory.
2.  Create a timestamped word object for EVERY word in the lyrics. Do not skip any.
3.  The 'startTime' for each word MUST be sequential and must increase from the previous word's start time. The timestamps must be distributed realistically across the entire duration of the audio.
4.  FINAL CHECK: Before producing the output, you MUST re-read your generated JSON to confirm that you have created an entry for every word and that the timestamps continue to increase sequentially until the very end of the song. Any failure to timestamp the entire song is a critical error.

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
    // Step 1: Get the simple, flat list of timed words from the AI.
    const {output} = await prompt(input);
    if (!output || !output.words || !Array.isArray(output.words) || output.words.length === 0) {
      throw new Error(
        'Failed to synchronize lyrics. The AI did not return a valid word list.'
      );
    }
    const timedWords = output.words;

    // Step 2: Reconstruct the nested structure required by the frontend.
    const originalLines = input.lyrics.trim().split('\n').filter(line => line.trim() !== '');
    const syncedLyrics: z.infer<typeof SyncedLyricSchema>[] = [];
    let wordCursor = 0;

    for (const lineText of originalLines) {
        const wordsInLine = lineText.trim().split(/\s+/).filter(w => w.length > 0);
        if (wordsInLine.length === 0) continue;

        const lineWords: z.infer<typeof WordSchema>[] = [];
        
        if (wordCursor + wordsInLine.length > timedWords.length) {
            console.error('Mismatch between lyric word count and AI timed word count. Halting reconstruction.');
            break; 
        }

        for (let i = 0; i < wordsInLine.length; i++) {
            // We use the original word text to preserve punctuation and casing,
            // but the timing from the corresponding AI-generated word.
            lineWords.push({
                text: wordsInLine[i],
                startTime: timedWords[wordCursor].startTime
            });
            wordCursor++;
        }

        if (lineWords.length > 0) {
            syncedLyrics.push({
                line: lineText,
                startTime: lineWords[0].startTime,
                words: lineWords,
            });
        }
    }
    
    if (syncedLyrics.length === 0 && originalLines.length > 0) {
        throw new Error("Failed to reconstruct lyrics from AI output. The word list may have been empty or invalid.");
    }

    return { syncedLyrics };
  }
);
