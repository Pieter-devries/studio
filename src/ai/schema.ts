import {z} from 'genkit';

// From generate-dynamic-background.ts
export const BackgroundSceneSchema = z.object({
  startTime: z
    .number()
    .describe('The time in milliseconds when this background should start.'),
  backgroundImageDataUri: z
    .string()
    .describe(
      'The generated background image as a data URI that must include a MIME type and use Base64 encoding. Expected format: data:<mimetype>;base64,<encoded_data>.'
    ),
});

// From sync-lyrics-with-audio.ts
export const WordSchema = z.object({
  text: z.string().describe('The word.'),
  startTime: z
    .number()
    .describe('The start time of the word in milliseconds.'),
});

export const SyncedLyricSchema = z.object({
  line: z.string().describe('The full text of the lyric line.'),
  startTime: z
    .number()
    .describe('The start time of the lyric line in milliseconds.'),
  words: z
    .array(WordSchema)
    .describe('An array of synchronized words in the line.'),
});
