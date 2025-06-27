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
import {transcribeAndAlignLyrics} from './transcribe-and-align-lyrics';
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
  qualityMetrics: z.object({
    wordErrorRate: z.number().describe('Estimated word error rate (0-1)'),
    meanPhonemeOffset: z.number().describe('Average timing offset in milliseconds'),
    syncAccuracy: z.number().describe('Overall synchronization accuracy (0-1)'),
    coveragePercentage: z.number().describe('Percentage of lyrics successfully synchronized')
  }).optional().describe('Quality assessment metrics for the synchronization')
});
export type OrchestrateVideoCreationOutput = z.infer<
  typeof OrchestrateVideoCreationOutputSchema
>;

// Quality assurance schemas
const QualityAssessmentSchema = z.object({
  backgroundSceneIssues: z.object({
    hasIssues: z.boolean(),
    maxGapBetweenScenes: z.number().describe('Maximum gap in seconds between scene changes'),
    problemAreas: z.array(z.object({
      gapStart: z.number().describe('Start time in seconds of the problematic gap'),
      gapEnd: z.number().describe('End time in seconds of the problematic gap'),
      gapDuration: z.number().describe('Duration of the gap in seconds')
    })),
    recommendation: z.string().describe('How to fix the background scene timing issues')
  }),
  lyricSyncIssues: z.object({
    hasIssues: z.boolean(),
    problemAreas: z.array(z.object({
      timeRange: z.string().describe('Time range where sync issues occur (e.g., "1:12-1:53")'),
      issueType: z.string().describe('Type of issue: "timing_gap", "word_timing", "missing_lyrics", etc.'),
      description: z.string().describe('Detailed description of the sync problem')
    })),
    overallAccuracy: z.number().min(0).max(100).describe('Estimated accuracy percentage'),
    recommendation: z.string().describe('How to fix the lyric synchronization issues')
  }),
  overallQuality: z.object({
    passesQualityCheck: z.boolean(),
    qualityScore: z.number().min(0).max(100),
    summary: z.string().describe('Summary of the overall quality assessment')
  })
});

export async function orchestrateVideoCreation(
  input: OrchestrateVideoCreationInput
): Promise<OrchestrateVideoCreationOutput> {
  return orchestrateVideoCreationFlow(input);
}

const qualityAssurancePrompt = ai.definePrompt({
  name: 'qualityAssurancePrompt',
  model: 'googleai/gemini-2.5-flash',
  input: {
    schema: z.object({
      audioDataUri: z.string(),
      lyrics: z.string(),
      backgroundScenes: z.array(BackgroundSceneSchema),
      syncedLyrics: z.array(SyncedLyricSchema),
    })
  },
  output: { schema: QualityAssessmentSchema },
  prompt: `You are a quality assurance specialist for music video generation. Analyze the provided music video components and assess their quality.

AUDIO FILE TO ANALYZE:
{{media url=audioDataUri}}

ORIGINAL LYRICS:
{{{lyrics}}}

BACKGROUND SCENES:
{{{backgroundScenes}}}

SYNCED LYRICS:
{{{syncedLyrics}}}

QUALITY ASSESSMENT CRITERIA:

**BACKGROUND SCENE ANALYSIS:**
1. Listen to the entire audio to determine exact song duration
2. Check if background scenes are well-distributed throughout the song
3. Ideal: Scene changes every 30-60 seconds
4. Problem: Gaps longer than 90 seconds between scene changes
5. Check if scenes cover the entire song duration adequately

**LYRIC SYNCHRONIZATION ANALYSIS:**
1. Verify lyrics start at the correct time (not necessarily 0:00)
2. Check for timing gaps where lyrics should be playing but aren't synced
3. Verify word-level timing accuracy
4. Check if all lyrics are included and properly timed
5. Look for issues like lyrics stopping mid-song, words with incorrect timing, etc.
6. Target accuracy: 90%+ for production quality

**ASSESSMENT INSTRUCTIONS:**
- Be thorough and critical - this is quality assurance
- Identify specific time ranges where problems occur
- Provide actionable recommendations for fixes
- A quality score below 85 means the output needs improvement
- Background gaps over 90 seconds are problematic
- Lyric accuracy below 90% needs fixing

Analyze the audio file and provided data to produce a comprehensive quality assessment.`,
});

const orchestrateVideoCreationFlow = ai.defineFlow(
  {
    name: 'orchestrateVideoCreationFlow',
    inputSchema: OrchestrateVideoCreationInputSchema,
    outputSchema: OrchestrateVideoCreationOutputSchema,
  },
  async ({audioDataUri, lyrics, title}) => {
    const MAX_ITERATIONS = 3; // Prevent infinite loops
    let iteration = 0;
    
    // Enhanced generation with new transcription method
    console.log('🎬 Starting enhanced video generation with phoneme-level alignment...');
    let [syncedLyricsResult, backgroundResult] = await Promise.all([
      transcribeAndAlignLyrics({audioDataUri, structuredLyrics: lyrics}),
      generateDynamicBackground({audioDataUri, lyrics}),
    ]);

    if (!syncedLyricsResult?.syncedLyrics || !backgroundResult?.scenes) {
      throw new Error('Failed to get complete data from enhanced AI flows. Please try again.');
    }

    // Enhanced quality reporting
    console.log('🔍 Enhanced quality analysis results:');
    console.log(`📊 Generated: ${backgroundResult.scenes.length} background scenes, ${syncedLyricsResult.syncedLyrics.length} lyric lines`);
    
    // Display quality metrics
    if (syncedLyricsResult.qualityMetrics) {
      const metrics = syncedLyricsResult.qualityMetrics;
      console.log('🎯 Synchronization Quality Metrics:');
      console.log(`  ✅ Sync Accuracy: ${(metrics.syncAccuracy * 100).toFixed(1)}%`);
      console.log(`  📝 Coverage: ${metrics.coveragePercentage.toFixed(1)}%`);
      console.log(`  ⏱️  Mean Timing Offset: ${metrics.meanPhonemeOffset.toFixed(1)}ms`);
      console.log(`  ❌ Word Error Rate: ${(metrics.wordErrorRate * 100).toFixed(1)}%`);
      
      // Quality assessment
      if (metrics.syncAccuracy >= 0.90) {
        console.log('  🌟 EXCELLENT: Professional-grade synchronization achieved!');
      } else if (metrics.syncAccuracy >= 0.80) {
        console.log('  ✅ GOOD: High-quality synchronization suitable for most uses');
      } else if (metrics.syncAccuracy >= 0.70) {
        console.log('  ⚠️  FAIR: Acceptable quality but may need manual review');
      } else {
        console.log('  ❌ POOR: Quality below recommended threshold, consider re-processing');
      }
    }
    
    // Analyze lyric timing with enhanced metrics
    if (syncedLyricsResult.syncedLyrics.length > 0) {
      const firstLyric = syncedLyricsResult.syncedLyrics[0];
      const lastLyric = syncedLyricsResult.syncedLyrics[syncedLyricsResult.syncedLyrics.length - 1];
      
      console.log('🎵 Enhanced Lyric Analysis:');
      console.log(`  📍 First lyric: "${firstLyric.line}" at ${(firstLyric.startTime / 1000).toFixed(1)}s`);
      console.log(`  📍 Last lyric: "${lastLyric.line}" at ${(lastLyric.startTime / 1000).toFixed(1)}s`);
      
      // Analyze word-level timing quality
      let totalWords = 0;
      let wordsWithTiming = 0;
      syncedLyricsResult.syncedLyrics.forEach(lyric => {
        if (lyric.words) {
          totalWords += lyric.words.length;
          wordsWithTiming += lyric.words.filter(word => word.startTime > 0).length;
        }
      });
      
      const wordTimingCoverage = totalWords > 0 ? (wordsWithTiming / totalWords * 100) : 0;
      console.log(`  🎯 Word-level timing coverage: ${wordTimingCoverage.toFixed(1)}% (${wordsWithTiming}/${totalWords} words)`);
      
      // Check for timing issues
      if (firstLyric.startTime === 0) {
        console.log(`  ⚠️  Note: First lyric starts at 0:00 - this may be correct or indicate early vocal start`);
      }
      
      // Sample word timing for first line
      if (firstLyric.words && firstLyric.words.length > 0) {
        console.log('  📝 First line word timing sample:');
        firstLyric.words.slice(0, 3).forEach((word, i) => {
          const timeStr = `${Math.floor(word.startTime / 60000)}:${String(Math.floor((word.startTime % 60000) / 1000)).padStart(2, '0')}.${String(word.startTime % 1000).padStart(3, '0')}`;
          console.log(`    ${i + 1}. [${timeStr}] "${word.text}"`);
        });
      }
    }
    
    // Analyze background scene distribution with enhanced metrics
    if (backgroundResult.scenes.length > 0) {
      console.log('🖼️ Enhanced Background Scene Analysis:');
      const sortedScenes = [...backgroundResult.scenes].sort((a, b) => a.startTime - b.startTime);
      
      sortedScenes.forEach((scene, i) => {
        const timeStr = `${Math.floor(scene.startTime / 60000)}:${String(Math.floor((scene.startTime % 60000) / 1000)).padStart(2, '0')}`;
        console.log(`  ${i + 1}. Scene at [${timeStr}]`);
      });
      
      // Enhanced gap analysis
      let totalGapTime = 0;
      let largeGaps = 0;
      for (let i = 1; i < sortedScenes.length; i++) {
        const gap = (sortedScenes[i].startTime - sortedScenes[i-1].startTime) / 1000;
        totalGapTime += gap;
        if (gap > 90) {
          largeGaps++;
          console.log(`  ⚠️  Large gap: ${gap.toFixed(1)}s between scenes ${i} and ${i+1}`);
        } else if (gap > 60) {
          console.log(`  ℹ️  Moderate gap: ${gap.toFixed(1)}s between scenes ${i} and ${i+1}`);
        }
      }
      
      const averageGap = sortedScenes.length > 1 ? totalGapTime / (sortedScenes.length - 1) : 0;
      console.log(`  📊 Average time between scenes: ${averageGap.toFixed(1)}s`);
      console.log(`  📊 Large gaps (>90s): ${largeGaps}`);
      
      if (largeGaps === 0) {
        console.log('  ✅ Excellent scene distribution - no large gaps detected');
      } else if (largeGaps <= 2) {
        console.log('  ⚠️  Acceptable scene distribution - few large gaps');
      } else {
        console.log('  ❌ Poor scene distribution - many large gaps may affect viewing experience');
      }
    }
    
    console.log('✅ Enhanced quality analysis complete - using advanced synchronization results');

    // Return the enhanced result
    const result = {
      audioUrl: audioDataUri,
      backgroundScenes: backgroundResult.scenes,
      syncedLyrics: syncedLyricsResult.syncedLyrics,
      title,
      qualityMetrics: syncedLyricsResult.qualityMetrics
    };

    console.log(`🎉 Video orchestration complete! Final output: ${backgroundResult.scenes.length} scenes, ${syncedLyricsResult.syncedLyrics.length} lyric lines`);
    
    return result;
  }
);
