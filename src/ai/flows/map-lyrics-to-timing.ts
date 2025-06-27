// import { z } from 'zod';

// // Schema for the lyric mapping function
// const LyricMappingInputSchema = z.object({
//   srtContent: z.string(),
//   structuredLyrics: z.string(),
//   timingOffset: z.number(), // ms offset from verification
// });

// const SyncedLyricSchema = z.object({
//   line: z.string(),
//   startTime: z.number(),
//   endTime: z.number(),
//   words: z.array(z.object({
//     text: z.string(),
//     startTime: z.number(),
//     endTime: z.number()
//   })).optional()
// });

// const LyricMappingOutputSchema = z.object({
//   syncedLyrics: z.array(SyncedLyricSchema),
//   mappingQuality: z.object({
//     totalLines: z.number(),
//     mappedLines: z.number(),
//     coverage: z.number()
//   })
// });

// export type LyricMappingInput = z.infer<typeof LyricMappingInputSchema>;
// export type LyricMappingOutput = z.infer<typeof LyricMappingOutputSchema>;
// export type SyncedLyric = z.infer<typeof SyncedLyricSchema>;

// // Helper function to validate and fix SRT timestamp format
// function validateAndFixTimestamp(timeStr: string): string | null {
//   try {
//     const originalTimeStr = timeStr;
//     timeStr = timeStr.trim();
    
//     // Handle non-standard format where AI uses colons instead of comma for milliseconds
//     // Pattern: "00:06:587" means 0 hours, 6.587 seconds = "00:00:06,587"
//     // Pattern: "00:27:17" means 0 hours, 27.17 seconds = "00:00:27,170" 
//     // Pattern: "01:44:47" means 0 hours, 104.47 seconds = "00:01:44,470"
//     const parts = timeStr.split(':');
    
//     if (parts.length === 3 && !timeStr.includes(',')) {
//       const hours = parseInt(parts[0]);
//       const minutesAndSeconds = parts[1];
//       const fractionalPart = parts[2];
      
//       // Convert the non-standard format to seconds
//       const totalSeconds = hours * 3600 + parseInt(minutesAndSeconds) + (parseInt(fractionalPart) / 1000);
      
//       // Convert back to proper HH:MM:SS,mmm format
//       const finalHours = Math.floor(totalSeconds / 3600);
//       const finalMinutes = Math.floor((totalSeconds % 3600) / 60);
//       const finalSecondsWhole = Math.floor(totalSeconds % 60);
//       const finalMilliseconds = Math.round((totalSeconds % 1) * 1000);
      
//       timeStr = `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}:${finalSecondsWhole.toString().padStart(2, '0')},${finalMilliseconds.toString().padStart(3, '0')}`;
      
//       console.log(`🔧 [SRT] Converted non-standard format: "${originalTimeStr}" → "${timeStr}"`);
//     }
    
//     // Now validate the standard format
//     if (!timeStr.includes(',')) {
//       console.log(`⚠️ [SRT] Invalid timestamp format (no comma): "${originalTimeStr}"`);
//       return null;
//     }
    
//     const [timePart, msPart] = timeStr.split(',');
    
//     // Validate milliseconds part (should be 3 digits)
//     let ms = msPart;
//     if (ms.length > 3) {
//       // Truncate if too long (e.g., "2560" -> "256")
//       ms = ms.substring(0, 3);
//     } else if (ms.length < 3) {
//       // Pad if too short (e.g., "96" -> "960", "5" -> "500")
//       ms = ms.padEnd(3, '0');
//     }
    
//     // Validate time part (should be HH:MM:SS)
//     const timeParts = timePart.split(':');
//     if (timeParts.length !== 3) {
//       console.log(`⚠️ [SRT] Invalid time format: "${timePart}"`);
//       return null;
//     }
    
//     const [hours, minutes, seconds] = timeParts.map(Number);
    
//     // Validate ranges
//     if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(Number(ms))) {
//       console.log(`⚠️ [SRT] Non-numeric values in timestamp: "${originalTimeStr}"`);
//       return null;
//     }
    
//     if (minutes >= 60 || seconds >= 60) {
//       console.log(`⚠️ [SRT] Invalid time values: ${minutes}m ${seconds}s`);
//       return null;
//     }
    
//     // Reconstruct the timestamp
//     const fixedTimestamp = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${ms}`;
    
//     if (fixedTimestamp !== timeStr && fixedTimestamp !== originalTimeStr) {
//       console.log(`🔧 [SRT] Fixed timestamp: "${originalTimeStr}" → "${fixedTimestamp}"`);
//     }
    
//     return fixedTimestamp;
//   } catch (error) {
//     console.log(`❌ [SRT] Failed to parse timestamp: "${timeStr}" - ${error}`);
//     return null;
//   }
// }

// // Helper function to parse SRT time to milliseconds with validation
// function parseTimeToMs(timeStr: string): number {
//   const validatedTimeStr = validateAndFixTimestamp(timeStr);
//   if (!validatedTimeStr) {
//     console.log(`❌ [SRT] Skipping invalid timestamp: "${timeStr}"`);
//     return NaN;
//   }
  
//   try {
//     const [time, ms] = validatedTimeStr.split(',');
//     const [hours, minutes, seconds] = time.split(':').map(Number);
    
//     const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + Number(ms);
    
//     if (isNaN(totalMs)) {
//       console.log(`❌ [SRT] Calculated NaN for timestamp: "${timeStr}"`);
//       return NaN;
//     }
    
//     return totalMs;
//   } catch (error) {
//     console.log(`❌ [SRT] Error parsing validated timestamp "${validatedTimeStr}": ${error}`);
//     return NaN;
//   }
// }

// // Parse SRT content into timing segments - EXACTLY as they are, with validation
// function parseSrtSegments(srtContent: string, timingOffset: number) {
//   const lines = srtContent.split('\n');
//   const segments = [];
//   let skippedCount = 0;
  
//   for (let i = 0; i < lines.length; i++) {
//     if (lines[i].includes('-->')) {
//       const [start, end] = lines[i].split(' --> ');
//       const text = lines[i + 1] || '';
      
//       // Only process segments that have actual text content
//       if (text.trim()) {
//         const startTime = parseTimeToMs(start.trim());
//         const endTime = parseTimeToMs(end.trim());
        
//         // Skip segments with invalid timestamps (NaN)
//         if (!isNaN(startTime) && !isNaN(endTime) && startTime < endTime) {
//           segments.push({
//             startTime: startTime + timingOffset,
//             endTime: endTime + timingOffset,
//             text: text.trim()
//           });
//         } else {
//           skippedCount++;
//           console.log(`⚠️ [SRT] Skipped invalid segment: "${start} --> ${end}" with text: "${text.trim()}"`);
//         }
//       } else {
//         skippedCount++;
//         console.log(`⚠️ [SRT] Skipped empty segment: "${start} --> ${end}"`);
//       }
//     }
//   }
  
//   if (skippedCount > 0) {
//     console.log(`⚠️ [SRT] Total skipped segments: ${skippedCount}`);
//   }
  
//   // Sort by start time to ensure chronological order
//   const sortedSegments = segments.sort((a, b) => a.startTime - b.startTime);
//   console.log(`✅ [SRT] Successfully parsed ${sortedSegments.length} valid segments`);
  
//   return sortedSegments;
// }

// // Parse structured lyrics into lines - keeping user's EXACT text
// function parseStructuredLyrics(structuredLyrics: string): string[] {
//   return structuredLyrics
//     .split('\n')
//     .map(line => line.trim())
//     .filter(line => line.length > 0 && !line.startsWith('[') && !line.startsWith('#'));
// }

// // Generate word-level timing for a line using EXACT SRT timing
// function generateWordTiming(line: string, startTime: number, endTime: number) {
//   const words = line.split(/\s+/).filter(word => word.length > 0);
//   if (words.length === 0) return [];
  
//   const totalDuration = endTime - startTime;
//   const avgWordDuration = totalDuration / words.length;
  
//   return words.map((word, index) => ({
//     text: word,
//     startTime: Math.round(startTime + (index * avgWordDuration)),
//     endTime: Math.round(startTime + ((index + 1) * avgWordDuration))
//   }));
// }

// /**
//  * STRICT MAPPING APPROACH:
//  * 1. Use SRT timings EXACTLY as they are (no AI interpretation)
//  * 2. Map user's exact lyrics to SRT segments in chronological order
//  * 3. Don't skip any lyrics - map them all sequentially
//  * 4. Trust the human-verified SRT timing completely
//  */
// export async function mapLyricsToTiming(input: LyricMappingInput): Promise<LyricMappingOutput> {
//   console.log('📝 [MAPPING] Starting STRICT lyric-to-timing mapping (no AI interpretation)...');
  
//   const { srtContent, structuredLyrics, timingOffset } = input;
  
//   // Parse inputs - keep everything EXACTLY as provided
//   const srtSegments = parseSrtSegments(srtContent, timingOffset);
//   const lyricLines = parseStructuredLyrics(structuredLyrics);
  
//   console.log(`📝 [MAPPING] Found ${srtSegments.length} SRT timing segments and ${lyricLines.length} user lyric lines`);
//   console.log('📝 [MAPPING] Using STRICT sequential mapping - no similarity matching, no AI interpretation');
  
//   // STRICT SEQUENTIAL MAPPING: Map each lyric line to the next available SRT segment
//   const syncedLyrics: SyncedLyric[] = [];
//   let srtIndex = 0;
  
//   for (let lyricIndex = 0; lyricIndex < lyricLines.length; lyricIndex++) {
//     const lyricLine = lyricLines[lyricIndex];
    
//     // If we have an SRT segment available, use its EXACT timing
//     if (srtIndex < srtSegments.length) {
//       const srtSegment = srtSegments[srtIndex];
      
//       // Generate word-level timing using the EXACT SRT timing
//       const words = generateWordTiming(lyricLine, srtSegment.startTime, srtSegment.endTime);
      
//       syncedLyrics.push({
//         line: lyricLine, // Use user's EXACT lyrics
//         startTime: srtSegment.startTime, // Use EXACT SRT start time
//         endTime: srtSegment.endTime, // Use EXACT SRT end time
//         words
//       });
      
//       console.log(`📝 [MAPPING] Line ${lyricIndex + 1}: "${lyricLine.substring(0, 40)}..." → ${(srtSegment.startTime/1000).toFixed(1)}s-${(srtSegment.endTime/1000).toFixed(1)}s`);
      
//       srtIndex++;
//     } else {
//       // If we run out of SRT segments, create a timing after the last segment
//       const lastSegment = srtSegments[srtSegments.length - 1];
//       const estimatedStart = lastSegment ? lastSegment.endTime + 1000 : 0;
//       const estimatedEnd = estimatedStart + 3000; // 3 second default duration
      
//       const words = generateWordTiming(lyricLine, estimatedStart, estimatedEnd);
      
//       syncedLyrics.push({
//         line: lyricLine,
//         startTime: estimatedStart,
//         endTime: estimatedEnd,
//         words
//       });
      
//       console.log(`⚠️ [MAPPING] Line ${lyricIndex + 1}: "${lyricLine.substring(0, 40)}..." → ${(estimatedStart/1000).toFixed(1)}s (estimated - no more SRT segments)`);
//     }
//   }
  
//   // Final result - already sorted by start time due to sequential mapping
//   const mappingQuality = {
//     totalLines: lyricLines.length,
//     mappedLines: syncedLyrics.length,
//     coverage: syncedLyrics.length / lyricLines.length // Should always be 1.0 with this approach
//   };
  
//   console.log('📝 [MAPPING] STRICT mapping complete:');
//   console.log(`  📊 Total lyric lines: ${mappingQuality.totalLines}`);
//   console.log(`  ✅ Mapped with SRT timing: ${Math.min(srtSegments.length, lyricLines.length)}`);
//   console.log(`  📈 Total coverage: ${(mappingQuality.coverage * 100).toFixed(1)}%`);
//   console.log(`  🎯 SRT segments used: ${Math.min(srtIndex, srtSegments.length)}/${srtSegments.length}`);
  
//   if (srtIndex < srtSegments.length) {
//     console.log(`  ℹ️ Unused SRT segments: ${srtSegments.length - srtIndex} (user has fewer lyrics than transcribed segments)`);
//   }
  
//   if (lyricLines.length > srtSegments.length) {
//     console.log(`  ⚠️ Extra lyric lines: ${lyricLines.length - srtSegments.length} (estimated timing used)`);
//   }
  
//   return {
//     syncedLyrics,
//     mappingQuality
//   };
// } 