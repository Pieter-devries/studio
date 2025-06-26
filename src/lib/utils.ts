import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface Word {
  text: string;
  startTime: number; // in milliseconds
}

export interface SyncedLyric {
  line: string;
  startTime: number; // in milliseconds
  words: Word[];
}
