import { config } from 'dotenv';
config();

import '@/ai/flows/sync-lyrics-with-audio.ts';
import '@/ai/flows/transcribe-and-align-lyrics.ts';
import '@/ai/flows/generate-dynamic-background.ts';