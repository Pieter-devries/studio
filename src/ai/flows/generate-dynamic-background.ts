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
import { BackgroundSceneSchema } from '@/ai/schema';

// Helper functions for fallback gradient generation
function getThemeGradient(prompt: string): [string, string] {
  const lowerPrompt = prompt.toLowerCase();
  
  // Theme-based color selection
  if (lowerPrompt.includes('sunset') || lowerPrompt.includes('gold') || lowerPrompt.includes('warm')) {
    return ['#FF7F50', '#FFD700']; // Orange to gold
  } else if (lowerPrompt.includes('mountain') || lowerPrompt.includes('sky') || lowerPrompt.includes('blue')) {
    return ['#4169E1', '#87CEEB']; // Royal blue to sky blue
  } else if (lowerPrompt.includes('field') || lowerPrompt.includes('green') || lowerPrompt.includes('nature')) {
    return ['#228B22', '#90EE90']; // Forest green to light green
  } else if (lowerPrompt.includes('night') || lowerPrompt.includes('dark') || lowerPrompt.includes('star')) {
    return ['#191970', '#4B0082']; // Midnight blue to indigo
  } else if (lowerPrompt.includes('desert') || lowerPrompt.includes('sand') || lowerPrompt.includes('dust')) {
    return ['#CD853F', '#F4A460']; // Peru to sandy brown
  } else {
    return ['#6A5ACD', '#9370DB']; // Slate blue to medium purple (default)
  }
}

function createGradientDataUri(colors: [string, string]): string {
  // Create a simple SVG gradient
  const [color1, color2] = colors;
  const svg = `
    <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
    </svg>
  `.trim();
  
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

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
  input: {schema: z.object({
    lyrics: z.string(),
    audioDataUri: z.string().describe('The audio file to analyze for duration and pacing'),
  })},
  output: {
    schema: z.object({
      prompts: z.array(ImagePromptSuggestionSchema),
    }),
  },
  prompt: `You are a music video director. Analyze the provided song audio and lyrics to create a series of detailed image generation prompts for a music video.

CRITICAL TIMING INSTRUCTIONS:
1. Listen to the ENTIRE audio file to determine the exact song duration
2. Create scenes that are evenly distributed throughout the song duration
3. Generate 6-10 scenes total (one scene every 30-60 seconds for optimal pacing)
4. The first scene MUST start at time 0
5. Distribute subsequent scenes evenly across the song length with consistent intervals
6. Ensure the last scene starts within the final 30 seconds of the song

For each scene, provide:
1. A "startTime" in MILLISECONDS based on actual audio duration analysis
2. A "prompt" that is a detailed, visually rich description for an image generation model

PROMPT REQUIREMENTS:
- Safe for all audiences, NO weapons, violence, or inappropriate content
- Focus on metaphorical and abstract concepts representing the song's mood
- Emphasize expansive landscapes, symbolic objects, and abstract visuals
- AVOID close-ups of people to prevent distorted features
- If people are included, they should be distant, out of focus, or silhouetted
- Each prompt MUST end with ", cinematic, 16:9 aspect ratio, high resolution"

Here is the audio file to analyze:
{{media url=audioDataUri}}

Lyrics for thematic inspiration:
{{{lyrics}}}

Generate ONLY the JSON output with evenly spaced scenes across the song duration.`,
});

const generateDynamicBackgroundFlow = ai.defineFlow(
  {
    name: 'generateDynamicBackgroundFlow',
    inputSchema: GenerateDynamicBackgroundInputSchema,
    outputSchema: GenerateDynamicBackgroundOutputSchema,
  },
  async input => {
    // Step 1: Generate prompts for each scene
    const {output} = await imagePromptsPrompt({
      lyrics: input.lyrics,
      audioDataUri: input.audioDataUri,
    });
    if (!output?.prompts || output.prompts.length === 0) {
      throw new Error('Could not generate image prompts from lyrics.');
    }

    // Step 2: Generate an image for each prompt in parallel with enhanced fallback and retry logic
    const imageGenerationPromises = output.prompts.map(async (scenePrompt, index) => {
      const maxRetries = 2;
      let lastError: any = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🖼️ [SCENE ${index + 1}] Generating image (attempt ${attempt}/${maxRetries})...`);
          
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
            throw new Error('No media URL returned from image generation');
          }

          console.log(`✅ [SCENE ${index + 1}] Image generated successfully`);
          return {
            startTime: scenePrompt.startTime,
            backgroundImageDataUri: media.url,
          };
        } catch (error) {
          lastError = error;
          console.warn(`❌ [SCENE ${index + 1}] Attempt ${attempt} failed:`, error instanceof Error ? error.message : String(error));
          
          // If this isn't the last attempt, wait before retrying
          if (attempt < maxRetries) {
            console.log(`🔄 [SCENE ${index + 1}] Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      // All attempts failed, use enhanced themed fallback
      console.warn(`🎨 [SCENE ${index + 1}] All generation attempts failed. Using themed gradient fallback.`);
      console.warn(`🔍 [SCENE ${index + 1}] Final error:`, lastError instanceof Error ? lastError.message : String(lastError));
      
      // Create themed gradient backgrounds based on prompt content
      const gradientColors = getThemeGradient(scenePrompt.prompt);
      const gradientDataUri = createGradientDataUri(gradientColors);
      
      console.log(`🌈 [SCENE ${index + 1}] Created gradient fallback: ${gradientColors[0]} → ${gradientColors[1]}`);
      
      return {
        startTime: scenePrompt.startTime,
        backgroundImageDataUri: gradientDataUri,
      };
    });

    const scenes = await Promise.all(imageGenerationPromises);

    return {scenes};
  }
);
