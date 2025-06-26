# LyroVideo - AI-Powered Music Video Generator

LyroVideo is an intelligent music video generator that automatically creates stunning lyric videos from MP3 files and lyrics. Using advanced AI models, it generates dynamic backgrounds, synchronizes lyrics with audio timing, and applies cinematic effects to produce professional-quality music videos.

## 🎯 **Core Features**

- **🎵 Audio Analysis**: Upload MP3 files for automatic processing
- **📝 Lyric Synchronization**: AI-powered word-level timing with vocal detection
- **🖼️ Dynamic Backgrounds**: Auto-generated images with Ken Burns effects every 30-60 seconds  
- **🎬 Music Video Manager**: Single orchestrator coordinates all operations
- **🔍 Quality Assurance**: Automatic validation and iterative improvement system
- **📱 Real-time Preview**: Live preview with precise audio-video synchronization
- **💾 Video Export**: High-quality MP4 export (1280x720, 30fps)
- **🔒 Secure Configuration**: Environment-based API key management

## 🎯 Features

### Core Functionality
- **Automatic Background Generation**: Creates unique background images every 10-15 seconds based on song lyrics and mood
- **Ken Burns Effect**: Applies smooth pan and zoom animations to background images for cinematic movement
- **Lyric Synchronization**: Intelligently syncs lyrics with audio timing using AI analysis
- **Word-Level Highlighting**: Highlights individual words as they are sung with smooth color transitions
- **Real-time Preview**: Interactive video player with playback controls and timeline scrubbing
- **Video Export**: Export high-quality MP4 videos with customizable settings

### Technical Features
- **AI-Powered Analysis**: Uses Google's Gemini models for audio analysis and image generation
- **Responsive Design**: Modern UI built with Next.js, Tailwind CSS, and Radix UI components
- **Type Safety**: Full TypeScript implementation with comprehensive type definitions
- **Server-Side Processing**: Efficient AI workflows using Genkit framework
- **Real-time Rendering**: Canvas-based video rendering with 60fps playback
- **Secure API Management**: Environment-based API key configuration with validation

## 🏗️ Architecture

### Music Video Manager with Quality Assurance
The app uses a centralized "Music Video Manager" that orchestrates the entire video creation process with automatic quality validation and iterative improvement:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Input Form    │───▶│  Video Manager   │───▶│  Video Preview  │
│ (MP3 + Lyrics)  │    │   (Orchestrator) │    │   (Player)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   AI Workflows   │
                    │                  │
                    │ • Sync Lyrics    │
                    │ • Generate BGs   │
                    │ • Quality Check  │
                    │ • Auto-Fix Loop  │
                    └──────────────────┘
```

### Quality Assurance System
The orchestrator now includes an intelligent QA system that:

1. **Initial Generation**: Runs background and lyric sync agents in parallel
2. **Quality Assessment**: Analyzes output for timing and accuracy issues
3. **Iterative Improvement**: Automatically requests fixes from agents when issues are detected
4. **Validation Loop**: Repeats until quality standards are met (up to 3 iterations)

**Quality Criteria:**
- 🖼️ **Background Scenes**: No gaps > 90 seconds between changes
- 🎵 **Lyric Sync**: 90%+ accuracy target with proper vocal timing
- 🎯 **Overall Score**: 85+ quality score required to pass

### AI Workflows

#### 1. **Lyric Synchronization** (`sync-lyrics-with-audio.ts`)
   - Analyzes audio file to detect vocal start timing
   - Maps lyrics to precise timestamps with word-level accuracy
   - Handles instrumental intros and breaks properly

#### 2. **Background Generation** (`generate-dynamic-background.ts`)
   - Creates scene prompts based on lyrics and audio analysis
   - Generates 6-10 cinematic images using Gemini 2.0 Flash
   - Distributes scenes evenly across song duration (30-60s intervals)

#### 3. **Quality Assurance Agent** (New!)
   - Validates background scene timing distribution
   - Checks lyric synchronization accuracy
   - Identifies specific problem areas with time ranges
   - Provides actionable recommendations for fixes

#### 4. **Video Orchestration** (`orchestrate-video-creation.ts`)
   - Coordinates all AI workflows with parallel processing
   - Manages quality assurance feedback loop
   - Automatically retries with improvements until quality standards are met

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

1. **Upload Audio**: Select an MP3 file from your device
2. **Add Lyrics**: Paste the song lyrics in the text area
3. **Generate**: Click "Generate Video" to start the AI processing
4. **Quality Assurance**: The system automatically validates and improves the output
5. **Preview**: Watch the generated video with playback controls
6. **Export**: Download the final MP4 video file

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
