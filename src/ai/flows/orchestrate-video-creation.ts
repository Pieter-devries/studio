'use server';
/**
 * @fileOverview Orchestrates the creation of a music video by coordinating various AI flows.
 *
 * - orchestrateVideoCreation - A function that handles the entire video creation process.
 * - OrchestrateVideoCreationInput - The input type for the orchestrateVideoCreation function.
 * - OrchestrateVideoCreationOutput - The return type for the orchestrateVideoCreation function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {generateDynamicBackground} from './generate-dynamic-background';
import {syncLyricsWithAudio} from './sync-lyrics-with-audio';

// Input schema for the main orchestration flow
export const OrchestrateVideoCreationInputSchema = z.object({
  audioDataUri: z.string().describe('The audio file as a data URI.'),
  lyrics: z.string().describe('The lyrics of the song.'),
  title: z.string().describe('The title of the song.'),
});
export type OrchestrateVideoCreationInput = z.infer<
  typeof OrchestrateVideoCreationInputSchema
>;

// Schema for the new expressive lyric animation
const WordAnimationSchema = z.object({
  text: z.string(),
  startTime: z.number(),
  animationStyle: z
    .enum(['glow', 'fade', 'zoom'])
    .describe('The animation style for the word.'),
  color: z.string().describe('A hex color code for the word.'),
});

const LineAnimationSchema = z.object({
  line: z.string().describe('The full text of the lyric line.'),
  startTime: z.number(),
  words: z.array(WordAnimationSchema),
});

// Output schema that the frontend will receive
export const OrchestrateVideoCreationOutputSchema = z.object({
  audioUrl: z.string(),
  backgroundScenes: z.array(
    z.object({
      startTime: z.number(),
      backgroundImageDataUri: z.string(),
    })
  ),
  animatedLyrics: z.array(LineAnimationSchema),
  title: z.string(),
});
export type OrchestrateVideoCreationOutput = z.infer<
  typeof OrchestrateVideoCreationOutputSchema
>;

export async function orchestrateVideoCreation(
  input: OrchestrateVideoCreationInput
): Promise<OrchestrateVideoCreationOutput> {
  return orchestrateVideoCreationFlow(input);
}

const lyricAnalysisPrompt = ai.definePrompt({
  name: 'analyzeLyricsForOrchestration',
  input: {schema: z.object({lyrics: z.string()})},
  prompt: `Analyze the themes, mood, and key visual elements of these lyrics. Provide a concise summary of the overall feeling and visual style.
        Lyrics:
        {{{lyrics}}}`,
});

const animatedLyricsPrompt = ai.definePrompt({
  name: 'generateLyricAnimationsPrompt',
  input: {
    schema: z.object({
      lyricAnalysis: z.string(),
      syncedLyricsJson: z.string(),
    }),
  },
  output: {
    schema: z.object({
      animatedLyrics: z.array(LineAnimationSchema),
    }),
  },
  prompt: `You are a creative director. Based on the song's themes, generate animation styles for each lyric word.
        Available styles: 'glow', 'fade', 'zoom'.
        Choose a hex color code for each word that fits the mood.

        Thematic Analysis: {{{lyricAnalysis}}}
        Synced Lyrics (JSON): {{{syncedLyricsJson}}}

        Your output must be a valid JSON object matching the requested schema. The root object must contain a single key, "animatedLyrics", which is an array of line objects. Each line object must contain the original "line" text.
        
        Produce ONLY the JSON output.`,
});

const orchestrateVideoCreationFlow = ai.defineFlow(
  {
    name: 'orchestrateVideoCreationFlow',
    inputSchema: OrchestrateVideoCreationInputSchema,
    outputSchema: OrchestrateVideoCreationOutputSchema,
  },
  async ({audioDataUri, lyrics, title}) => {
    // In parallel, sync lyrics, generate backgrounds, and analyze lyric themes.
    const [syncedLyricsData, backgroundData, analysisResponse] =
      await Promise.all([
        syncLyricsWithAudio({audioDataUri, lyrics}),
        generateDynamicBackground({audioDataUri, lyrics}),
        lyricAnalysisPrompt({lyrics}),
      ]);

    if (!syncedLyricsData || !backgroundData || !analysisResponse) {
      throw new Error('Failed to get initial data from AI flows.');
    }
    const lyricAnalysis = analysisResponse.text;
    const backgroundScenes = backgroundData.scenes;

    // Now, use the analysis and synced lyrics to generate the expressive animations.
    const animatedLyricsResult = await animatedLyricsPrompt({
      lyricAnalysis,
      syncedLyricsJson: JSON.stringify(syncedLyricsData.syncedLyrics),
    });

    if (!animatedLyricsResult.output?.animatedLyrics) {
      throw new Error('Failed to generate animated lyrics.');
    }
    const animatedLyrics = animatedLyricsResult.output.animatedLyrics;

    // Combine all the generated assets into the final video data object.
    return {
      audioUrl: audioDataUri,
      backgroundScenes,
      animatedLyrics,
      title,
    };
  }
);
