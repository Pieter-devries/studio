'use server';

/**
 * @fileOverview A flow to generate a dynamic background based on the audio and lyrics of a song.
 *
 * - generateDynamicBackground - A function that generates a dynamic background for a song.
 * - GenerateDynamicBackgroundInput - The input type for the generateDynamicBackground function.
 * - GenerateDynamicBackgroundOutput - The return type for the generateDynamicBackground function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateDynamicBackgroundInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio data URI of the song (MP3 format), as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  lyrics: z.string().describe('The lyrics of the song.'),
});
export type GenerateDynamicBackgroundInput = z.infer<typeof GenerateDynamicBackgroundInputSchema>;

const GenerateDynamicBackgroundOutputSchema = z.object({
  backgroundImageDataUri: z
    .string()
    .describe(
      'The generated background image as a data URI that must include a MIME type and use Base64 encoding. Expected format: data:<mimetype>;base64,<encoded_data>.'
    ),
});
export type GenerateDynamicBackgroundOutput = z.infer<typeof GenerateDynamicBackgroundOutputSchema>;

export async function generateDynamicBackground(
  input: GenerateDynamicBackgroundInput
): Promise<GenerateDynamicBackgroundOutput> {
  return generateDynamicBackgroundFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateDynamicBackgroundPrompt',
  input: {schema: GenerateDynamicBackgroundInputSchema},
  output: {schema: GenerateDynamicBackgroundOutputSchema},
  prompt: `Given the following song lyrics and audio, generate a background image that reflects the mood and theme of the song. The background should be dynamic and visually interesting.

Lyrics: {{{lyrics}}}
Audio: {{media url=audioDataUri}}

Please provide the image as a data URI.
`,
});

const generateDynamicBackgroundFlow = ai.defineFlow(
  {
    name: 'generateDynamicBackgroundFlow',
    inputSchema: GenerateDynamicBackgroundInputSchema,
    outputSchema: GenerateDynamicBackgroundOutputSchema,
  },
  async input => {
    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-preview-image-generation',
      prompt: [
        {text: `Generate a background image that reflects the mood and theme of the song. Lyrics: ${input.lyrics}`},
        {media: {url: input.audioDataUri}},
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
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

    if (!media?.url) {
      throw new Error('No background image was generated.');
    }

    return {backgroundImageDataUri: media.url};
  }
);
