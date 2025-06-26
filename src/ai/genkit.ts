import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {getConfig, logConfigStatus} from '@/lib/config';

// Initialize configuration and log status
const config = getConfig();
logConfigStatus();

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: config.googleAI.apiKey,
    }),
  ],
  model: 'googleai/gemini-2.5-flash',
});
