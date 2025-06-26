'use server';

/**
 * @fileOverview A flow to generate a dynamic background based on the audio and lyrics of a song.
 *
 * - generateDynamicBackground - A function that generates a dynamic background for a song.
 * - GenerateDynamicBackgroundInput - The input type for the generateDynamicBackground function.
 * - GenerateDynamicBackgroundOutput - The return type for the generateDynamicbackground function.
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

const BackgroundSceneSchema = z.object({
  startTime: z
    .number()
    .describe('The time in milliseconds when this background should start.'),
  backgroundImageDataUri: z
    .string()
    .describe(
      'The generated background image as a data URI that must include a MIME type and use Base64 encoding. Expected format: data:<mimetype>;base64,<encoded_data>.'
    ),
});

const GenerateDynamicBackgroundOutputSchema = z.object({
  scenes: z
    .array(BackgroundSceneSchema)
    .describe(
      'An array of background scenes, each with a start time and an image data URI.'
    ),
});
export type GenerateDynamicBackgroundOutput = z.infer<typeof GenerateDynamicBackgroundOutputSchema>;

export async function generateDynamicBackground(
  input: GenerateDynamicBackgroundInput
): Promise<GenerateDynamicBackgroundOutput> {
  return generateDynamicBackgroundFlow(input);
}

const ImagePromptSuggestionSchema = z.object({
  startTime: z
    .number()
    .describe(
      'The time in milliseconds in the song where this scene should begin.'
    ),
  prompt: z
    .string()
    .describe('A detailed prompt for an image generation model.'),
});

const imagePromptsPrompt = ai.definePrompt({
  name: 'generateImagePrompts',
  input: {schema: z.object({lyrics: z.string()})},
  output: {
    schema: z.object({
      prompts: z.array(ImagePromptSuggestionSchema),
    }),
  },
  prompt: `You are a music video director. Analyze the provided song lyrics and create a series of detailed image generation prompts for a music video.

Divide the song into 4-6 thematically distinct scenes. Each scene should last approximately 10-20 seconds.

For each scene, provide:
1.  A "startTime" in MILLISECONDS. The first scene must start at time 0.
2.  A "prompt" that is a detailed, visually rich description for an image generation model. IMPORTANT: The prompts must be safe for all audiences and must NOT include depictions of firearms, weapons, or violence. Instead of literal interpretations, focus on metaphorical or abstract concepts representing freedom, Americana, and the open road. For example, instead of a gun rack, describe a beautiful sunset over a vast, open landscape. Each prompt MUST end with the phrase ", cinematic, 16:9 aspect ratio, high resolution".

Lyrics:
{{{lyrics}}}

Generate ONLY the JSON output.`,
});

const generateDynamicBackgroundFlow = ai.defineFlow(
  {
    name: 'generateDynamicBackgroundFlow',
    inputSchema: GenerateDynamicBackgroundInputSchema,
    outputSchema: GenerateDynamicBackgroundOutputSchema,
  },
  async input => {
    // Step 1: Generate prompts for each scene
    const {output} = await imagePromptsPrompt({lyrics: input.lyrics});
    if (!output?.prompts || output.prompts.length === 0) {
      throw new Error('Could not generate image prompts from lyrics.');
    }

    // Step 2: Generate an image for each prompt in parallel
    const imageGenerationPromises = output.prompts.map(async scenePrompt => {
      const {media} = await ai.generate({
        model: 'googleai/gemini-2.0-flash-preview-image-generation',
        prompt: scenePrompt.prompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          safetySettings: [
            {category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE'},
            {category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE'},
            {category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE'},
            {category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE'},
          ],
        },
      });

      if (!media?.url) {
        // Fallback to a placeholder if generation fails
        console.warn(`Image generation failed for prompt: "${scenePrompt.prompt}". Using placeholder.`);
        return {
          startTime: scenePrompt.startTime,
          backgroundImageDataUri: 'https://placehold.co/1280x720.png',
        };
      }

      return {
        startTime: scenePrompt.startTime,
        backgroundImageDataUri: media.url,
      };
    });

    const scenes = await Promise.all(imageGenerationPromises);

    return {scenes};
  }
);
