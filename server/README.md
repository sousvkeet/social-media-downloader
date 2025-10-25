# Backend Server with yt-dlp

This is the backend server for the social media downloader that uses yt-dlp with Brave browser cookies.

## Prerequisites

1. **yt-dlp installed**: Install yt-dlp on your system
   ```bash
   # Linux/macOS
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   sudo chmod a+rx /usr/local/bin/yt-dlp
   
   # Or using pip
   pip install yt-dlp
   ```

2. **Brave Browser**: Make sure Brave browser is installed with active cookies

## Environment Variables

All configuration is done via environment variables in the `.env` file:

```env
# Server Configuration
PORT=7000                              # Server port
HOST=localhost                         # Server host
NODE_ENV=development                   # Environment (development/production)

# CORS Configuration
CORS_ORIGIN=http://localhost:5173      # Frontend URL for CORS

# yt-dlp Configuration
YTDLP_COOKIES_FROM_BROWSER=brave       # Browser to extract cookies from (brave/chrome/firefox/etc)
YTDLP_OUTPUT_PATH=./downloads          # Download directory path
YTDLP_MAX_FILE_SIZE=500M               # Maximum file size to download
YTDLP_RATE_LIMIT=5M                    # Download rate limit (5MB/s)

# Download Configuration
MAX_CONCURRENT_DOWNLOADS=3             # Maximum concurrent downloads
DOWNLOAD_TIMEOUT=300000                # Timeout in milliseconds (5 minutes)
```

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   - Copy `.env.example` to `.env`
   - Update values as needed

3. **Start the server**:
   ```bash
   npm run server
   ```

   Or with auto-reload (requires nodemon):
   ```bash
   npm run server:dev
   ```

## API Endpoints

### GET `/api/health`
Health check endpoint
```bash
curl http://localhost:7000/api/health
```

### GET `/api/config`
View current environment configuration
```bash
curl http://localhost:7000/api/config
```

### POST `/api/video-info`
Get video information without downloading (Returns JSON)
```bash
curl -X POST http://localhost:7000/api/video-info \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID"}'
```

### POST `/api/download`
Download video (Returns binary file)
```bash
curl -X POST http://localhost:7000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID", "format": "best"}' \
  --output video.mp4
```

### POST `/api/download-mp3`
Download as MP3 audio (Returns binary file)
```bash
curl -X POST http://localhost:7000/api/download-mp3 \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID"}' \
  --output audio.mp3
```

**Note**: Download endpoints return binary file data directly, making them compatible with n8n and other automation tools. See [N8N_INTEGRATION.md](./N8N_INTEGRATION.md) for details.

## How Browser Cookies Work

The server uses `--cookies-from-browser` flag with yt-dlp to extract cookies from your Brave browser. This is useful for:

- Downloading age-restricted content
- Accessing private/member-only videos
- Bypassing geographic restrictions

The cookies are extracted directly from your browser, so make sure you're logged into the necessary accounts in Brave.

## Troubleshooting

### yt-dlp not found
Make sure yt-dlp is installed and in your PATH:
```bash
which yt-dlp
yt-dlp --version
```

### Browser cookies not working
- Make sure Brave is installed
- Try logging into the website in Brave first
- Close Brave browser before running yt-dlp (sometimes required)
- Check if you have the correct browser name in `YTDLP_COOKIES_FROM_BROWSER`

### Download fails
- Check the video URL is valid
- Verify your internet connection
- Check server logs for detailed error messages
- Increase `DOWNLOAD_TIMEOUT` if needed

## Supported Browsers

You can use cookies from any of these browsers by changing `YTDLP_COOKIES_FROM_BROWSER`:
- brave
- chrome
- chromium
- edge
- firefox
- opera
- safari
- vivaldi

## Security Notes

- Keep your `.env` file secure and never commit it to version control
- The server extracts cookies from your browser - only use on trusted systems
- Be aware of the terms of service of the platforms you're downloading from
