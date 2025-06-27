# LyroVideo - AI-Powered Music Video Generator

LyroVideo is an intelligent music video generator that automatically creates stunning lyric videos from audio files (MP3 or WAV) and lyrics. Using advanced AI models, it generates dynamic backgrounds, synchronizes lyrics with audio timing, and applies cinematic effects to produce professional-quality music videos.

## 🎯 **Core Features**

- **🎵 Audio Analysis**: Upload audio files (MP3 or WAV) for automatic processing
- **📝 Lyrics-Aware Transcription**: Advanced SRT-based timing that accurately synchronizes with provided lyrics
- **🖼️ Dynamic Backgrounds**: Auto-generated images with Ken Burns effects every 30-60 seconds  
- **🎬 Music Video Manager**: Single orchestrator coordinates all operations
- **🔍 Human Verification**: Manual timing verification and adjustment interface
- **🎥 High-Quality Export**: Professional 1080p MP4/WebM export with 12 Mbps video + 320 kbps audio
- **🛡️ Memory-Safe Export**: Chunked processing prevents memory leaks and browser crashes
- **🚫 Cancellable Export**: Users can stop export process at any time
- **⚡ Optimized Rendering**: Dynamic font scaling and high-quality text rendering

## ✅ **Current Working Features**
- **Lyrics-Aware Transcription**: Accurate SRT generation using provided lyrics as context for timing
- **Human Timing Verification**: Manual interface to review and adjust timing with offset controls
- **Background Generation**: Dynamic image generation with Ken Burns effects
- **Video Preview & Export**: Full 1080p video rendering and MP4/WebM export
- **Timing Synchronization**: Precise audio-lyrics sync with millisecond accuracy

## ✅ Current Status (Working Features)

### ✅ Fully Functional
- **Audio Upload & Processing**: Upload audio files (MP3 or WAV) and extract audio data
- **Lyrics-Aware Transcription**: AI transcribes audio while being aware of provided lyrics for better accuracy
- **Human Timing Verification**: Manual interface to review and adjust timing with offset controls
- **Background Generation**: Creates unique cinematic background images based on lyrics
- **Video Preview**: Real-time video player with lyrics synchronized to audio
- **Video Export**: Export high-quality MP4 videos
- **Timing Synchronization**: Accurate lyrics timing with manual adjustment capabilities

### 🚧 TODO: Features to Reincorporate
- **Word-Level Highlighting**: Individual word highlighting as they are sung with smooth color transitions
  - Currently shows full lyric lines without word-by-word highlighting
  - Need to reimplement the word timing distribution and visual highlighting effects
  - Previous implementation had timing calculation issues that were resolved by simplifying to line-level display

## 🏗️ Architecture

### Two-Stage Lyrics Processing with Human Verification
The app uses a streamlined approach that combines AI transcription with human verification:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Input Form    │───▶│ Lyrics-Aware     │───▶│ Timing          │
│(Audio + Lyrics) │    │ Transcription    │    │ Verification    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │ Background       │───▶│ Video Preview   │
                    │ Generation       │    │ & Export        │
                    └──────────────────┘    └─────────────────┘
```

### AI Workflows

#### 1. **Lyrics-Aware Transcription** (`lyrics-aware-transcription.ts`)
   - Transcribes audio to SRT format while being aware of provided lyrics
   - Produces more accurate timing by leveraging lyric structure
   - Generates proper SRT format with millisecond precision
   - Handles instrumental sections naturally

#### 2. **Human Timing Verification** (`TimingVerification.tsx`)
   - Manual review interface with audio playback controls
   - Adjustable timing offset with real-time preview
   - Visual feedback showing current lyric segment
   - Fine-tuning capabilities for perfect synchronization

#### 3. **Background Generation** (`generate-dynamic-background.ts`)
   - Creates scene prompts based on lyrics and audio analysis
   - Generates 6-10 cinematic images using Gemini 2.0 Flash
   - Distributes scenes evenly across song duration (30-60s intervals)
   - Ken Burns effect for smooth pan and zoom animations

#### 4. **Video Rendering** (`VideoPreview.tsx`)
   - Canvas-based real-time rendering
   - Simplified timing system using basic audio.currentTime
   - Full-line lyric display (word highlighting to be added)
   - MP4 export with MediaRecorder API

## 🔐 Security & API Key Management

### Secure Configuration
The app uses a secure configuration system that:
- ✅ Validates required environment variables on startup
- ✅ Sanitizes API keys in logs (shows only first/last 4 characters)
- ✅ Prevents API keys from being committed to version control
- ✅ Provides clear error messages for missing configuration

### Environment Variables
Create a `.env.local` file in the root directory with your API keys:

```env
# Required: Google AI API Key
# Get your API key from: https://aistudio.google.com/app/apikey
GOOGLE_AI_API_KEY=your_actual_api_key_here

# Optional: Firebase Configuration (if using Firebase features)
# FIREBASE_API_KEY=your_firebase_api_key
# FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
# FIREBASE_PROJECT_ID=your_project_id
# FIREBASE_STORAGE_BUCKET=your_project.appspot.com
# FIREBASE_MESSAGING_SENDER_ID=your_sender_id
# FIREBASE_APP_ID=your_app_id

# Development Configuration
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:9002
```

### Getting Your Google AI API Key
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the generated key
5. Add it to your `.env.local` file

### Security Best Practices
- 🔒 **Never commit API keys** to version control
- 🔒 **Use environment variables** for all sensitive data
- 🔒 **Rotate API keys** regularly
- 🔒 **Monitor API usage** in Google AI Studio
- 🔒 **Use different keys** for development and production

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Google AI API key (for Gemini models)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd studio
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Copy the example environment file
   cp env.example .env.local
   
   # Edit .env.local and add your API keys
   nano .env.local
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Start the AI development server** (in a separate terminal)
   ```bash
   npm run genkit:dev
   ```

The app will be available at `http://localhost:9002`

### Verification
When you start the app, you should see configuration status in the console:
```
🔧 Configuration Status:
  Environment: development
  App URL: http://localhost:9002
  Google AI API Key: AIza...abcd
  Firebase: Not configured
✅ Environment validation passed
```

## 📖 Usage

### Creating a Music Video

1. **Upload Audio**: Select an audio file (MP3 or WAV) from your device
2. **Add Lyrics**: Paste the song lyrics in the text area
3. **Generate**: Click "Generate Video" to start the AI processing
4. **Quality Assurance**: The system automatically validates and improves the output
5. **Preview**: Watch the generated video with playback controls
6. **Export**: Download the final MP4 video file

### Advanced Two-Stage Lyric Synchronization

Our improved synchronization system uses a two-stage approach to handle complex timing scenarios:

#### Stage 1: Audio Transcription
- Transcribes the entire audio file to SRT (SubRip) format
- Creates natural gaps during instrumental sections
- Provides accurate timestamps for all vocal segments
- Handles repeated sections (choruses, verses) properly

#### Stage 2: Lyric Alignment  
- Maps structured lyrics to SRT timestamps
- Preserves exact lyric formatting and line structure
- Uses only existing SRT timestamps (no estimation)
- Maintains natural instrumental gaps from transcription

#### Benefits
- ✅ **Eliminates timing drift** in long instrumental sections
- ✅ **Natural gap handling** - no more massive 6-second delays
- ✅ **Accurate repeated sections** - choruses sync to their actual timing
- ✅ **Robust fallback** - automatically falls back to direct sync if needed

#### Debug Logging
The system provides detailed logging for troubleshooting:
- `🎵 [SYNC]` - Shows which stage is running
- `📝 [SRT FULL CONTENT]` - Complete SRT transcription
- `⏰ [SRT]` - Extracted timestamps and segments
- `📊 [SYNC]` - Final alignment results

### What Happens During Generation

The system now uses an intelligent quality assurance process:

```
🎬 Initial Generation
├── 🎵 Lyric sync agent analyzes audio and creates word-level timing
├── 🖼️ Background agent generates 6-10 cinematic scenes
└── ⏱️ Parallel processing for optimal speed

🔍 Quality Assessment
├── 📊 Validates background scene distribution
├── 🎯 Checks lyric synchronization accuracy
├── 📈 Calculates overall quality score (target: 85+)
└── 🎪 Identifies specific improvement areas

🔧 Iterative Improvement (if needed)
├── 🖼️ Re-generate backgrounds if gaps > 90 seconds
├── 🎵 Re-sync lyrics if accuracy < 90%
├── 🔄 Repeat validation up to 3 times
└── ✅ Proceed when quality standards are met
```

You'll see console output showing the quality assurance process, including:
- Quality scores and improvement iterations
- Specific issues found (e.g., "Max gap between scenes: 120s")
- Agent fixes being applied
- Final quality validation

### Controls
- **Play/Pause**: Control video playback
- **Timeline**: Scrub through the video timeline
- **Reset**: Start over with new audio/lyrics
- **Export**: Download the video as MP4

## 🔧 Configuration

### AI Models
The app uses Google's Gemini models:
- **Gemini 2.5 Flash**: Main orchestration and analysis
- **Gemini 2.0 Flash Image Generation**: Background image creation

### Video Settings
- **Frame Rate**: 30 FPS for export, 60 FPS for preview
- **Resolution**: 1280x720 (16:9 aspect ratio)
- **Background Cadence**: New scene every 10-15 seconds
- **Fade Duration**: 1 second transitions between scenes

## ✅ Recent Improvements (June 2025)

### 🔧 Major Fixes Implemented
1. **✅ Memory Leak Resolution**: Fixed endless animation loops when video is paused
2. **✅ Export Isolation**: Export now completely independent from preview (no more app freezing)
3. **✅ Enhanced Audio Timing**: Web Audio API integration for sample-level precision
4. **✅ Quality Assurance**: Automatic validation and iterative improvement system
5. **✅ Background Scene Timing**: Better distribution analysis and gap detection
6. **✅ Lyric Synchronization**: Improved vocal detection and word-level accuracy
7. **✅ Robust Word Highlighting**: Enhanced timing tolerance and duration-based highlighting

### 🎯 Quality Standards
The app now automatically ensures:
- **Background Scenes**: Evenly distributed with gaps <90 seconds
- **Lyric Accuracy**: 90%+ synchronization accuracy
- **Performance**: No memory leaks or blocking operations
- **User Experience**: Responsive during export with live preview

## 🐛 Known Issues & Future Improvements
3. **Highlighting Accuracy**: ~90% word highlighting accuracy - some words miss highlighting
4. **Scene Distribution**: Need better cadence from start to finish

### Planned Improvements
- [ ] Implement audio analysis to detect vocal start time
- [ ] Improve background scene distribution algorithm
- [ ] Enhance word-level timing accuracy
- [ ] Add more visual effects and transitions
- [ ] Support for different video aspect ratios
- [ ] Batch processing for multiple songs

## 🛠️ Development

### Project Structure
```
src/
├── ai/
│   ├── flows/           # AI workflow definitions
│   ├── genkit.ts        # AI configuration
│   └── schema.ts        # Type definitions
├── app/                 # Next.js app router
├── components/
│   ├── lyro/           # Music video components
│   └── ui/             # Reusable UI components
├── hooks/              # Custom React hooks
├── lib/
│   ├── config.ts       # Secure configuration management
│   └── utils.ts        # Utility functions
```

### Key Technologies
- **Frontend**: Next.js 15, React 18, TypeScript
- **Styling**: Tailwind CSS, Radix UI
- **AI**: Google Gemini, Genkit framework
- **Video**: HTML5 Canvas, Web Audio API
- **Build**: Turbopack, PostCSS
- **Security**: Environment-based configuration

### Development Scripts
```bash
npm run dev              # Start development server
npm run genkit:dev       # Start AI development server
npm run genkit:watch     # Watch mode for AI development
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint
npm run typecheck        # Run TypeScript checks
```

## 🚨 Troubleshooting

### Common Issues

**"Missing required environment variables"**
- Ensure you have a `.env.local` file in the root directory
- Verify your Google AI API key is correctly set
- Check that the API key is valid in Google AI Studio

**"API key validation failed"**
- Verify your API key format (should start with "AIza")
- Check your Google AI Studio quota and billing
- Ensure the API key has access to Gemini models

**"AI generation failed"**
- Check your internet connection
- Verify API key permissions
- Monitor your Google AI usage quotas

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Security Contributions
When contributing, please ensure:
- No API keys or sensitive data are included in commits
- Environment variables are properly documented
- Security best practices are followed

## 📞 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the documentation in the `/docs` folder
- Review the blueprint documentation for technical details

---

**Built with ❤️ using Next.js, Google AI, and Genkit**
