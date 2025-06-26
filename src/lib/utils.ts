import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface SyncedLyric {
  time: number; // in milliseconds
  text: string;
}

// Parses the string output from the AI lyric sync flow.
// Assumes the AI returns a JSON string representing an array of {time, text} objects.
export function parseSyncedLyrics(lyricsString: string): SyncedLyric[] {
  try {
    // Clean up potential markdown code blocks from AI output.
    const cleanedString = lyricsString
      .trim()
      .replace(/^```json\s*/, '')
      .replace(/\s*```$/, '');

    const parsed = JSON.parse(cleanedString);

    if (Array.isArray(parsed)) {
      // Filter and validate each item to ensure it matches the SyncedLyric interface.
      return parsed.filter(
        (item): item is SyncedLyric =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.time === 'number' &&
          typeof item.text === 'string' &&
          isFinite(item.time)
      );
    }
  } catch (error) {
    console.error("Failed to parse synced lyrics JSON:", error);
    // Fallback for LRC-like format: [time_in_ms] Text
    const lrcRegex = /\[(\d+)\]\s*(.*)/;
    const lines = lyricsString.split('\n');
    const lrcParsed = lines.map(line => {
      const match = line.match(lrcRegex);
      if (match) {
        return { time: parseInt(match[1], 10), text: match[2].trim() };
      }
      return null;
    }).filter((item): item is SyncedLyric => item !== null);

    if (lrcParsed.length > 0) {
      return lrcParsed;
    }
  }

  return []; // Return an empty array if parsing fails.
}
