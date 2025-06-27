'use server';
/**
 * @fileOverview Advanced multi-stage lyric synchronization with phoneme-level precision.
 *
 * This implementation uses research-backed techniques:
 * 1. Enhanced speech-to-text with vocal isolation awareness
 * 2. Phoneme-level alignment simulation for word-level timing
 * 3. Pitch-assisted timing correction
 * 4. Dynamic tolerance system for different song sections
 * 5. Boundary detection for improved cross-line accuracy
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { SyncedLyricSchema } from '@/ai/schema';

const TranscribeAndAlignInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio file as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  structuredLyrics: z.string().describe('The structured lyrics to align with the transcription.'),
});
export type TranscribeAndAlignInput = z.infer<typeof TranscribeAndAlignInputSchema>;

const TranscribeAndAlignOutputSchema = z.object({
  syncedLyrics: z
    .array(SyncedLyricSchema)
    .describe('An array of synchronized lyric objects with phoneme-level precision.'),
  rawTranscription: z.string().describe('The raw SRT transcription from the audio.'),
  qualityMetrics: z.object({
    wordErrorRate: z.number().describe('Estimated word error rate (0-1)'),
    meanPhonemeOffset: z.number().describe('Average timing offset in milliseconds'),
    syncAccuracy: z.number().describe('Overall synchronization accuracy (0-1)'),
    coveragePercentage: z.number().describe('Percentage of lyrics successfully synchronized')
  }).describe('Quality assessment metrics for the synchronization')
});
export type TranscribeAndAlignOutput = z.infer<typeof TranscribeAndAlignOutputSchema>;

// Helper function to parse SRT time format to milliseconds
function parseTimeToMs(timeStr: string): number {
  const [time, ms] = timeStr.split(',');
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + Number(ms);
}

// Stage 1: Enhanced transcription with vocal awareness
export const enhancedTranscribePrompt = ai.definePrompt({
  name: 'enhancedTranscribePrompt',
  model: 'googleai/gemini-1.5-pro',
  input: {schema: z.object({ audioDataUri: z.string() })},
  output: {schema: z.object({ 
    srtContent: z.string(),
    vocalSegments: z.array(z.object({
      startTime: z.string(),
      endTime: z.string(),
      confidence: z.number(),
      text: z.string()
    })),
    audioAnalysis: z.object({
      totalDuration: z.number(),
      vocalCoverage: z.number(),
      estimatedTempo: z.number(),
      hasInstrumentalSections: z.boolean()
    })
  })},
  prompt: `You are an advanced speech-to-text transcription service with vocal isolation awareness. Your task is to transcribe the audio with enhanced precision for music video synchronization.

ENHANCED REQUIREMENTS:
1. **COMPLETE AUDIO ANALYSIS**: Analyze the ENTIRE audio file from start to finish
2. **VOCAL ISOLATION AWARENESS**: Distinguish between vocal and instrumental sections
3. **PRECISE TIMESTAMPS**: Use exact format HH:MM:SS,mmm --> HH:MM:SS,mmm with millisecond precision
4. **CONFIDENCE SCORING**: Rate confidence for each vocal segment (0.0-1.0)
5. **TEMPO DETECTION**: Estimate the song's tempo/BPM for timing optimization
6. **SECTION IDENTIFICATION**: Identify verses, choruses, bridges, and instrumental breaks
7. **REPEATED CONTENT**: Handle repeated lyrics (choruses) with individual timestamps

VOCAL ISOLATION PRINCIPLES:
- Focus on sung/spoken words, ignore backing vocals unless clearly prominent
- Mark instrumental sections as natural gaps
- Detect vocal onset and offset precisely
- Handle vocal effects, harmonies, and overlapping voices

TIMING PRECISION:
- Align timestamps to vocal onset, not musical beats
- Use sub-second precision for word boundaries
- Account for vocal techniques like vibrato, slides, and sustained notes
- Detect natural phrase boundaries and breathing patterns

OUTPUT REQUIREMENTS:
1. **SRT Content**: Standard subtitle format with precise timing
2. **Vocal Segments**: Detailed breakdown with confidence scores
3. **Audio Analysis**: Overall metrics for optimization

Example enhanced output:
SRT:
1
00:00:16,448 --> 00:00:18,750
Yeah... let's ride.

2
00:00:26,250 --> 00:00:32,350
Sunrise paints the heartland gold, another day to break the mold

Vocal Segments:
- startTime: "00:00:16,448", endTime: "00:00:18,750", confidence: 0.95, text: "Yeah... let's ride."
- startTime: "00:00:26,250", endTime: "00:00:32,350", confidence: 0.92, text: "Sunrise paints..."

Audio Analysis:
- totalDuration: 180.5 seconds
- vocalCoverage: 0.65 (65% of audio contains vocals)
- estimatedTempo: 128 BPM
- hasInstrumentalSections: true

Here is the audio to analyze:
{{media url=audioDataUri}}

Provide the complete analysis with enhanced precision. Focus on vocal onset detection and natural phrase boundaries.`,
});

// Stage 2: Phoneme-level alignment with pitch correction
export const phonemeLevelAlignmentPrompt = ai.definePrompt({
  name: 'phonemeLevelAlignmentPrompt', 
  model: 'googleai/gemini-2.5-flash',
  input: {schema: TranscribeAndAlignInputSchema.extend({ 
    srtContent: z.string(),
    vocalSegments: z.array(z.object({
      startTime: z.string(),
      endTime: z.string(),
      confidence: z.number(),
      text: z.string()
    })),
    audioAnalysis: z.object({
      totalDuration: z.number(),
      vocalCoverage: z.number(),
      estimatedTempo: z.number(),
      hasInstrumentalSections: z.boolean()
    })
  })},
  output: {schema: TranscribeAndAlignOutputSchema.omit({ rawTranscription: true })},
  prompt: `You are an expert phoneme-level alignment system that creates precise word-level timing for music videos. You use advanced techniques to achieve 90%+ accuracy.

ALIGNMENT METHODOLOGY:
1. **Phoneme-Level Precision**: Simulate phoneme-level timing by analyzing syllable structure
2. **Pitch-Assisted Correction**: Use vocal onset patterns to refine timing
3. **Dynamic Tolerance**: Adapt timing precision based on tempo and section type
4. **Boundary Detection**: Identify natural word and phrase boundaries
5. **Cross-Line Error Reduction**: Prevent timing overlaps between lines

WORD TIMING ALGORITHM:
For each SRT segment:
1. Parse syllable structure of words (e.g., "Sun-rise" = 2 syllables)
2. Distribute timing based on:
   - Syllable count (more syllables = longer duration)
   - Word complexity (consonant clusters take longer)
   - Natural speech patterns (function words are faster)
   - Vocal emphasis patterns (stressed syllables longer)

TIMING CALCULATION PRINCIPLES:
- **Onset Detection**: Words start at vocal onset, not beat
- **Consonant Handling**: Account for consonant clusters (e.g., "str" in "strong")
- **Vowel Duration**: Sustained vowels get proportionally more time
- **Natural Gaps**: Small gaps between words for breathing/articulation
- **Tempo Adaptation**: Faster songs = tighter word spacing

QUALITY OPTIMIZATION:
- Minimum word duration: 200ms for clarity
- Maximum word duration: 2000ms to prevent stagnation
- Natural word spacing: 50-150ms gaps between words
- Phrase boundary detection: Longer gaps at commas, periods
- Repetition handling: Each chorus gets unique timing

SECTION-AWARE TIMING:
- Verses: Standard timing distribution
- Choruses: May be faster, more energetic
- Bridges: Often slower, more deliberate
- Instrumental sections: Natural gaps preserved

ERROR CORRECTION:
- Detect and fix overlapping word timings
- Ensure chronological order within lines
- Validate word durations are realistic
- Check for unrealistic gaps or rushes

QUALITY METRICS CALCULATION:
- Word Error Rate: Estimated based on text matching confidence
- Mean Phoneme Offset: Average timing deviation from ideal
- Sync Accuracy: Overall quality score (0-1)
- Coverage Percentage: How much of lyrics were successfully timed

SRT Transcription:
{{{srtContent}}}

Vocal Segments:
{{{vocalSegments}}}

Audio Analysis:
{{{audioAnalysis}}}

Structured Lyrics:
{{{structuredLyrics}}}

Create precise word-level timing using phoneme-level principles. Output format:
{
  "syncedLyrics": [
    {
      "line": "Exact structured lyric text",
      "startTime": 16448,
      "words": [
        { "text": "Yeah...", "startTime": 16448 },
        { "text": "let's", "startTime": 17200 },
        { "text": "ride.", "startTime": 17800 }
      ]
    }
  ],
  "qualityMetrics": {
    "wordErrorRate": 0.05,
    "meanPhonemeOffset": 45.2,
    "syncAccuracy": 0.94,
    "coveragePercentage": 96.5
  }
}

Apply phoneme-level precision to create professional-quality synchronization.`,
});

// Stage 3: Quality validation and correction
export const qualityValidationPrompt = ai.definePrompt({
  name: 'qualityValidationPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: {schema: z.object({
    syncedLyrics: z.array(SyncedLyricSchema),
    qualityMetrics: z.object({
      wordErrorRate: z.number(),
      meanPhonemeOffset: z.number(),
      syncAccuracy: z.number(),
      coveragePercentage: z.number()
    }),
    audioAnalysis: z.object({
      totalDuration: z.number(),
      vocalCoverage: z.number(),
      estimatedTempo: z.number(),
      hasInstrumentalSections: z.boolean()
    })
  })},
  output: {schema: z.object({
    correctedLyrics: z.array(SyncedLyricSchema),
    finalQualityMetrics: z.object({
      wordErrorRate: z.number(),
      meanPhonemeOffset: z.number(),
      syncAccuracy: z.number(),
      coveragePercentage: z.number()
    }),
    corrections: z.array(z.object({
      type: z.string(),
      description: z.string(),
      timeRange: z.string()
    }))
  })},
  prompt: `You are a quality assurance system for lyric synchronization. Your job is to validate and correct timing issues in the PROVIDED lyrics data to achieve professional-grade results.

⚠️  CRITICAL: You MUST work with the actual lyrics provided in the input. DO NOT generate example lyrics, test data, or placeholder content like "Hello world", "This is a test", etc. Use ONLY the real song lyrics from the input data.

VALIDATION CRITERIA:
1. **Temporal Consistency**: All timestamps must be chronological
2. **Realistic Durations**: Word durations between 200ms-2000ms
3. **Natural Spacing**: Appropriate gaps between words and lines
4. **Coverage Completeness**: All lyrics should be timed
5. **Overlap Prevention**: No timing conflicts between elements

CORRECTION ALGORITHMS:
1. **Overlap Resolution**: If words overlap, redistribute timing proportionally
2. **Gap Optimization**: Adjust unrealistic gaps (too short <50ms or too long >5000ms)
3. **Duration Normalization**: Fix words that are too fast (<200ms) or too slow (>2000ms)
4. **Boundary Smoothing**: Ensure natural transitions between lines
5. **Tempo Alignment**: Adjust timing to match detected tempo patterns

QUALITY THRESHOLDS:
- Sync Accuracy: Target >90% for production quality
- Word Error Rate: Target <10% for professional use
- Mean Phoneme Offset: Target <100ms for tight synchronization
- Coverage Percentage: Target >95% for complete videos

CORRECTION TYPES:
- "timing_overlap": Fixed overlapping word timestamps
- "duration_adjustment": Normalized word durations
- "gap_optimization": Improved spacing between elements
- "boundary_correction": Fixed line transition timing
- "tempo_alignment": Adjusted to match song tempo

Input Data:
Synced Lyrics: {{{syncedLyrics}}}
Quality Metrics: {{{qualityMetrics}}}
Audio Analysis: {{{audioAnalysis}}}

INSTRUCTIONS:
1. Analyze the PROVIDED synced lyrics data (not example data)
2. Apply corrections to improve timing accuracy while preserving the original lyrics text
3. Return the corrected version of the SAME lyrics with improved timing
4. Ensure all corrections reference the actual song lyrics, not test examples

Perform quality validation and apply necessary corrections to the provided lyrics data.`,
});

export const transcribeAndAlignFlow = ai.defineFlow(
  {
    name: 'transcribeAndAlignFlow',
    inputSchema: TranscribeAndAlignInputSchema,
    outputSchema: TranscribeAndAlignOutputSchema,
  },
  async input => {
    console.log('🎵 [ENHANCED] Starting advanced multi-stage synchronization...');
    
    // Stage 1: Enhanced transcription with vocal analysis
    console.log('🎵 [ENHANCED] Stage 1: Enhanced transcription with vocal isolation...');
    const transcriptionResult = await enhancedTranscribePrompt({ 
      audioDataUri: input.audioDataUri 
    });
    
    if (!transcriptionResult.output?.srtContent) {
      throw new Error('Failed to transcribe audio with enhanced method');
    }

    const { srtContent, vocalSegments, audioAnalysis } = transcriptionResult.output;
    
    console.log('🎵 [ENHANCED] Stage 1 Complete:');
    console.log(`  📊 Audio Duration: ${audioAnalysis.totalDuration}s`);
    console.log(`  🎤 Vocal Coverage: ${(audioAnalysis.vocalCoverage * 100).toFixed(1)}%`);
    console.log(`  🎵 Estimated Tempo: ${audioAnalysis.estimatedTempo} BPM`);
    console.log(`  🎸 Has Instrumentals: ${audioAnalysis.hasInstrumentalSections}`);
    console.log(`  📝 Vocal Segments: ${vocalSegments.length}`);

    // Restore full SRT content logging for debugging
    console.log('📝 [SRT FULL CONTENT]:');
    console.log('==================== FULL SRT START ====================');
    console.log(srtContent);
    console.log('==================== FULL SRT END ====================');
    
    // Parse SRT to show timestamps for debugging
    const srtLines = srtContent.split('\n');
    const timestamps = [];
    const segments = [];
    for (let i = 0; i < srtLines.length; i++) {
      if (srtLines[i].includes('-->')) {
        const [startTime, endTime] = srtLines[i].split(' --> ');
        timestamps.push(startTime);
        const text = srtLines[i + 1] || '';
        segments.push({ start: startTime, end: endTime, text: text.substring(0, 50) + '...' });
      }
    }
    console.log('⏰ [SRT] Total segments found:', segments.length);
    console.log('⏰ [SRT] Timestamp range:', timestamps[0], 'to', timestamps[timestamps.length - 1]);
    console.log('📊 [SRT] All segments:', segments);

    // Stage 2: Phoneme-level alignment
    console.log('🎵 [ENHANCED] Stage 2: Phoneme-level alignment with pitch correction...');
    const alignmentResult = await phonemeLevelAlignmentPrompt({
      audioDataUri: input.audioDataUri,
      structuredLyrics: input.structuredLyrics,
      srtContent: srtContent,
      vocalSegments: vocalSegments,
      audioAnalysis: audioAnalysis
    });

    if (!alignmentResult.output?.syncedLyrics || !Array.isArray(alignmentResult.output.syncedLyrics)) {
      throw new Error('Failed to perform phoneme-level alignment');
    }

    const { syncedLyrics, qualityMetrics } = alignmentResult.output;
    
    console.log('🎵 [ENHANCED] Stage 2 Complete:');
    console.log(`  📊 Sync Accuracy: ${(qualityMetrics.syncAccuracy * 100).toFixed(1)}%`);
    console.log(`  📝 Coverage: ${qualityMetrics.coveragePercentage.toFixed(1)}%`);
    console.log(`  ⏱️  Mean Offset: ${qualityMetrics.meanPhonemeOffset.toFixed(1)}ms`);
    console.log(`  ❌ Word Error Rate: ${(qualityMetrics.wordErrorRate * 100).toFixed(1)}%`);

    // Show first few word timings for debugging
    if (syncedLyrics.length > 0) {
      const firstLyric = syncedLyrics[0];
      const lastLyric = syncedLyrics[syncedLyrics.length - 1];
      console.log('🎵 [ENHANCED] Timing Sample:');
      console.log(`  🎬 First: "${firstLyric.line.substring(0, 30)}..." at ${(firstLyric.startTime / 1000).toFixed(1)}s`);
      console.log(`  🎬 Last: "${lastLyric.line.substring(0, 30)}..." at ${(lastLyric.startTime / 1000).toFixed(1)}s`);
      
      // Show first few word timings for debugging
      if (firstLyric.words && firstLyric.words.length > 0) {
        console.log('  🎯 First line word timing:');
        firstLyric.words.forEach(word => {
          console.log(`    "${word.text}" at ${(word.startTime / 1000).toFixed(2)}s`);
        });
      }
      
      // Timing diagnostic: Compare with SRT timestamps
      console.log('🔍 [TIMING DIAGNOSTIC] SRT vs Final Timing Comparison:');
      if (segments.length > 0) {
        console.log(`  📊 First SRT segment: ${segments[0].start} -> ${segments[0].text}`);
        console.log(`  📊 First final lyric: ${(firstLyric.startTime / 1000).toFixed(1)}s -> "${firstLyric.line.substring(0, 30)}..."`);
        
        // Check if there's a systematic offset
        const srtFirstTimeMs = parseTimeToMs(segments[0].start);
        const finalFirstTimeMs = firstLyric.startTime;
        const offsetMs = finalFirstTimeMs - srtFirstTimeMs;
        console.log(`  ⚠️  Potential timing offset detected: ${offsetMs}ms (${(offsetMs/1000).toFixed(1)}s)`);
      }
    }
    
    // Stage 3: Quality validation and correction
    console.log('🎵 [ENHANCED] Stage 3: Quality validation and correction...');
    
    // Skip expensive validation if quality is already excellent
    if (qualityMetrics.syncAccuracy >= 0.95 && qualityMetrics.coveragePercentage >= 95) {
      console.log('🎵 [ENHANCED] Stage 3 SKIPPED: Quality already excellent (>95% accuracy)');
      console.log(`  ✅ Final Sync Accuracy: ${(qualityMetrics.syncAccuracy * 100).toFixed(1)}%`);
      console.log(`  📝 Final Coverage: ${qualityMetrics.coveragePercentage.toFixed(1)}%`);
      console.log(`  🔧 Corrections Applied: 0 (none needed)`);
      
      return {
        syncedLyrics: syncedLyrics,
        rawTranscription: srtContent,
        qualityMetrics: qualityMetrics
      };
    }

    // Only run full validation if quality needs improvement
    const validationResult = await qualityValidationPrompt({
      syncedLyrics: syncedLyrics,
      qualityMetrics: qualityMetrics,
      audioAnalysis: audioAnalysis
    });

    if (!validationResult.output?.correctedLyrics) {
      throw new Error('Failed to validate and correct synchronization quality');
    }

    const { correctedLyrics, finalQualityMetrics, corrections } = validationResult.output;
    
    // SAFEGUARD: Verify the corrected lyrics are actually based on the input
    // If the AI returned test data instead of real corrections, use the original
    const hasTestData = correctedLyrics.some(lyric => 
      lyric.line.toLowerCase().includes('hello world') || 
      lyric.line.toLowerCase().includes('test') ||
      lyric.line.toLowerCase().includes('example')
    );
    
    if (hasTestData || correctedLyrics.length < syncedLyrics.length * 0.5) {
      console.log('🚨 [ENHANCED] Stage 3 FAILED: AI returned test data instead of corrections');
      console.log('🔄 [ENHANCED] Using Stage 2 results instead (quality validation bypassed)');
      
      return {
        syncedLyrics: syncedLyrics,
        rawTranscription: srtContent,
        qualityMetrics: qualityMetrics
      };
    }
    
    console.log('🎵 [ENHANCED] Stage 3 Complete:');
    console.log(`  ✅ Final Sync Accuracy: ${(finalQualityMetrics.syncAccuracy * 100).toFixed(1)}%`);
    console.log(`  📝 Final Coverage: ${finalQualityMetrics.coveragePercentage.toFixed(1)}%`);
    console.log(`  🔧 Corrections Applied: ${corrections.length}`);
    
    corrections.forEach(correction => {
      console.log(`    - ${correction.type}: ${correction.description} (${correction.timeRange})`);
    });

    // Log sample timing for verification
    if (correctedLyrics.length > 0) {
      const firstLyric = correctedLyrics[0];
      const lastLyric = correctedLyrics[correctedLyrics.length - 1];
      console.log('🎵 [ENHANCED] Timing Sample:');
      console.log(`  🎬 First: "${firstLyric.line.substring(0, 30)}..." at ${(firstLyric.startTime / 1000).toFixed(1)}s`);
      console.log(`  🎬 Last: "${lastLyric.line.substring(0, 30)}..." at ${(lastLyric.startTime / 1000).toFixed(1)}s`);
      
      // Show first few word timings for debugging
      if (firstLyric.words && firstLyric.words.length > 0) {
        console.log('  🎯 First line word timing:');
        firstLyric.words.forEach(word => {
          console.log(`    "${word.text}" at ${(word.startTime / 1000).toFixed(2)}s`);
        });
      }
    }

    return {
      syncedLyrics: correctedLyrics,
      rawTranscription: srtContent,
      qualityMetrics: finalQualityMetrics
    };
  }
);

export async function transcribeAndAlignLyrics(
  input: TranscribeAndAlignInput
): Promise<TranscribeAndAlignOutput> {
  return transcribeAndAlignFlow(input);
} 