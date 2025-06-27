/**
 * Secure configuration management for API keys and environment variables
 */

interface Config {
  googleAI: {
    apiKey: string;
  };
  app: {
    url: string;
    environment: string;
  };
  firebase?: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  };
}

/**
 * Validates that required environment variables are present
 */
function validateEnvironment(): void {
  const requiredVars = ['GOOGLE_AI_API_KEY'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env.local file or environment configuration.'
    );
  }
}

/**
 * Sanitizes API keys for logging (shows only first and last 4 characters)
 */
export function sanitizeApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return '[INVALID]';
  return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
}

/**
 * Gets the application configuration with proper validation
 */
export function getConfig(): Config {
  // Validate environment in development
  if (process.env.NODE_ENV === 'development') {
    validateEnvironment();
  }

  const config: Config = {
    googleAI: {
      apiKey: process.env.GOOGLE_AI_API_KEY || '',
    },
    app: {
      url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002',
      environment: process.env.NODE_ENV || 'development',
    },
  };

  // Optional Firebase configuration
  if (process.env.FIREBASE_API_KEY) {
    config.firebase = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    };
  }

  return config;
}

/**
 * Logs configuration status (without exposing sensitive data)
 */
export function logConfigStatus(): void {
  const config = getConfig();
  
  console.log('🔧 Configuration Status:');
  console.log(`  Environment: ${config.app.environment}`);
  console.log(`  App URL: ${config.app.url}`);
  console.log(`  Google AI: ${config.googleAI.apiKey ? `Configured (${sanitizeApiKey(config.googleAI.apiKey)})` : 'Not configured'}`);
  console.log(`  Firebase: ${config.firebase ? 'Configured' : 'Not configured'}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Environment validation passed');
  }
} 