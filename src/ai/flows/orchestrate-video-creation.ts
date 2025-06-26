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
import { BackgroundSceneSchema, SyncedLyricSchema } from '@/ai/schema';

// Input schema for the main orchestration flow
const OrchestrateVideoCreationInputSchema = z.object({
  audioDataUri: z.string().describe('The audio file as a data URI.'),
  lyrics: z.string().describe('The lyrics of the song.'),
  title: z.string().describe('The title of the song.'),
});
export type OrchestrateVideoCreationInput = z.infer<
  typeof OrchestrateVideoCreationInputSchema
>;

// Output schema that the frontend will receive
const OrchestrateVideoCreationOutputSchema = z.object({
  audioUrl: z.string(),
  backgroundScenes: z.array(BackgroundSceneSchema),
  syncedLyrics: z.array(SyncedLyricSchema),
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

const orchestrateVideoCreationFlow = ai.defineFlow(
  {
    name: 'orchestrateVideoCreationFlow',
    inputSchema: OrchestrateVideoCreationInputSchema,
    outputSchema: OrchestrateVideoCreationOutputSchema,
  },
  async ({audioDataUri, lyrics, title}) => {
    // In parallel, sync lyrics and generate backgrounds.
    const [syncedLyricsResult, backgroundResult] =
      await Promise.all([
        syncLyricsWithAudio({audioDataUri, lyrics}),
        generateDynamicBackground({audioDataUri, lyrics}),
      ]);

    if (!syncedLyricsResult?.syncedLyrics || !backgroundResult?.scenes) {
      throw new Error('Failed to get complete data from AI flows. Please try again.');
    }

    // Combine the generated assets into the final video data object.
    return {
      audioUrl: audioDataUri,
      backgroundScenes: backgroundResult.scenes,
      syncedLyrics: syncedLyricsResult.syncedLyrics,
      title,
    };
  }
);
