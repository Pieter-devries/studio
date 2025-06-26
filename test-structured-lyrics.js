#!/usr/bin/env node

/**
 * Test script for structured lyrics with Heartland Anthem
 * This tests the enhanced lyric synchronization system
 */

const fs = require('fs');
const path = require('path');

async function testStructuredLyrics() {
  console.log('🧪 Testing Structured Lyrics Synchronization');
  console.log('===========================================\n');

  // Read the structured lyrics
  const lyricsPath = path.join(__dirname, 'docs', 'structured-lyrics.txt');
  const lyrics = fs.readFileSync(lyricsPath, 'utf8');
  
  console.log('📝 Structured Lyrics Loaded:');
  console.log(lyrics);
  console.log('\n' + '='.repeat(50) + '\n');

  // Check if MP3 file exists
  const mp3Path = '/home/pieter/Downloads/Heartland Anthem.mp3';
  
  if (!fs.existsSync(mp3Path)) {
    console.error('❌ MP3 file not found at:', mp3Path);
    console.log('Please ensure the file exists and try again.');
    process.exit(1);
  }

  console.log('🎵 MP3 file found:', mp3Path);
  console.log('📊 File size:', (fs.statSync(mp3Path).size / 1024 / 1024).toFixed(2) + ' MB');
  
  // Convert MP3 to data URI (simplified - in real app this would be done properly)
  console.log('\n🔄 To test this properly, you would:');
  console.log('1. Upload the MP3 file through the web interface');
  console.log('2. Copy the structured lyrics from docs/structured-lyrics.txt');
  console.log('3. Paste them into the lyrics field');
  console.log('4. Click "Generate Video"');
  console.log('5. Watch for the enhanced console output');
  
  console.log('\n🎯 Expected Improvements:');
  console.log('✅ First chorus should end cleanly');
  console.log('✅ [Guitar Solo] section should be skipped');
  console.log('✅ Second chorus should start at correct timing');
  console.log('✅ No "runaway" lyrics during instrumental break');
  console.log('✅ Bridge and outro should be properly timed');
  
  console.log('\n📋 Look for this in console output:');
  console.log('🔍 Performing simple quality analysis...');
  console.log('🎵 Lyric Analysis:');
  console.log('  📍 First lyric: "Yeah... let\'s ride." at X.Xs');
  console.log('  📍 Last lyric: "Made in the USA..." at Y.Ys');
  console.log('  📝 Sample lyrics timing:');
  console.log('    1. [0:XX] "Yeah... let\'s ride."');
  console.log('    2. [0:XX] "Sunrise paints the heartland gold..."');
  console.log('    3. [1:XX] "Yeah, we\'re singing \'bout freedom..." (first chorus)');
  console.log('    4. [2:XX] "Yeah, we\'re singing \'bout freedom..." (second chorus)');
  
  console.log('\n🚀 Ready for testing!');
}

// Run the test
testStructuredLyrics().catch(console.error); 