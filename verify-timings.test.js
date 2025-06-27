/**
 * @fileoverview A test script to verify the accuracy of the AI-powered lyric synchronization by calling the function directly.
 */

import { config } from 'dotenv';
config();

import {promises as fs} from 'fs';
import path from 'path';

const AUDIO_FILE_PATH = path.resolve(process.cwd(), 'docs/Heartland Anthem.mp3');
const LYRICS_FILE_PATH = path.resolve(process.cwd(), 'docs/structured-lyrics.txt');
const MANUAL_TIMINGS_PATH = path.resolve(process.cwd(), 'docs/manual-timings-corrected.json');
const TOLERANCE_MS = 2500; // Allowable difference of 2.5 seconds

async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    console.error(`❌ Error reading file: ${filePath}`, err);
    process.exit(1);
  }
}

async function getAudioDataUri(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const mimeType = 'audio/mpeg';
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  } catch (err)
  {
    console.error(`❌ Error reading or encoding audio file: ${filePath}`, err);
    process.exit(1);
  }
}

/**
 * The main test execution function.
 */
async function main() {
  console.log('🚀 Starting lyric timing verification test...');

  // Import the function dynamically
  const { syncLyricsWithAudio } = await import('./src/ai/flows/sync-lyrics-with-audio.ts');

  // --- 1. Load all required data ---
  console.log('   - Loading audio, lyrics, and manual timings...');
  const [audioDataUri, lyrics, manualTimingsStr] = await Promise.all([
    getAudioDataUri(AUDIO_FILE_PATH),
    readFile(LYRICS_FILE_PATH),
    readFile(MANUAL_TIMINGS_PATH),
  ]);
  const manualTimings = JSON.parse(manualTimingsStr);

  // --- 2. Run the AI synchronization flow directly ---
  console.log('   - Running AI lyric synchronization (this may take a minute)...');
  
  const flowInput = { audioDataUri, lyrics };
  let generatedOutput;

  try {
    // Call the function directly instead of using CLI
    generatedOutput = await syncLyricsWithAudio(flowInput);
  } catch (error) {
    console.error('❌ AI flow execution failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
  
  const { syncedLyrics: generatedLyrics } = generatedOutput;

  // --- 3. Compare generated timings with manual timings ---
  console.log('   - Comparing generated timings against manual "ground truth"...');
  
  if (generatedLyrics.length !== manualTimings.length) {
    console.error(`❌ Mismatch in line count! Manual: ${manualTimings.length}, Generated: ${generatedLyrics.length}`);
    console.log('\n--- Manual Lines ---');
    manualTimings.forEach(l => console.log(`- "${l.line}"`));
    console.log('\n--- Generated Lines ---');
    generatedLyrics.forEach(l => console.log(`- "${l.line}"`));
    process.exit(1);
  }

  console.log('\n✅ Line counts match. Proceeding with timing comparison.');
  console.log('-----------------------------------------------------------');
  console.log('                           RESULTS                         ');
  console.log('-----------------------------------------------------------');
  console.log(
    'Line'.padEnd(4),
    'Manual (s)'.padEnd(12),
    'Generated (s)'.padEnd(15),
    'Difference (ms)'.padEnd(18),
    'Status'.padEnd(8),
    'Lyric Text'
  );
  console.log('-'.repeat(100));

  let totalDifference = 0;
  let outliers = 0;

  generatedLyrics.forEach((generatedLyric, index) => {
    const manualLyric = manualTimings[index];
    
    const manualLine = manualLyric.line.trim().replace(/’/g, "'");
    const generatedLine = generatedLyric.line.trim().replace(/’/g, "'");

    if (manualLine !== generatedLine) {
        console.warn(`\n⚠️  Warning: Line text mismatch at index ${index}`);
        console.warn(`   - Manual:    "${manualLine}"`);
        console.warn(`   - Generated: "${generatedLine}"`);
    }

    const manualTimeMs = manualLyric.time * 1000;
    const generatedTimeMs = generatedLyric.startTime;
    const difference = generatedTimeMs - manualTimeMs;
    const isPass = Math.abs(difference) <= TOLERANCE_MS;

    if (!isPass) {
      outliers++;
    }
    totalDifference += Math.abs(difference);

    console.log(
      String(index + 1).padEnd(4),
      (manualTimeMs / 1000).toFixed(2).padEnd(12),
      (generatedTimeMs / 1000).toFixed(2).padEnd(15),
      String(difference).padEnd(18),
      isPass ? '✅ PASS' : '❌ FAIL',
      `"${generatedLyric.line.substring(0, 40)}..."`
    );
  });
  
  console.log('-'.repeat(100));
  const averageDifference = totalDifference / generatedLyrics.length;
  console.log('\n--- Test Summary ---');
  console.log(`- Total Lines Compared: ${generatedLyrics.length}`);
  console.log(`- Average Time Difference: ${averageDifference.toFixed(2)} ms`);
  console.log(`- Outliers (>${TOLERANCE_MS}ms): ${outliers}`);
  
  if (outliers > 0) {
    console.error(`\n❌ TEST FAILED: Found ${outliers} timing(s) outside the ${TOLERANCE_MS}ms tolerance.`);
    process.exit(1);
  } else {
    console.log('\n✅ TEST PASSED: All lyric timings are within the acceptable tolerance.');
  }
}

main();