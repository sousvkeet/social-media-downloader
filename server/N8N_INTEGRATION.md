# n8n Integration Guide

The server endpoints now return binary file data directly, making them compatible with n8n workflows.

## Endpoints for n8n

### 1. Download Video (Binary Output)
**POST** `/api/download`

Returns the downloaded video file as binary data.

**Request Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "format": "best"
}
```

**Response:**
- Binary video file
- Headers: `Content-Disposition: attachment; filename="video_title.mp4"`
- Content-Type: `application/octet-stream`

### 2. Download MP3 (Binary Output)
**POST** `/api/download-mp3`

Returns the converted MP3 audio file as binary data.

**Request Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
- Binary MP3 file
- Headers: `Content-Disposition: attachment; filename="audio_title.mp3"`
- Content-Type: `audio/mpeg`

## n8n Workflow Configuration

### HTTP Request Node Settings

1. **Method**: POST
2. **URL**: `http://localhost:7000/api/download-mp3`
3. **Body Content Type**: JSON
4. **JSON Body**:
   ```json
   {
     "url": "{{ $json.videoUrl }}"
   }
   ```
5. **Response Format**: File
6. **Binary Property**: `data` (or your preferred name)

### Example n8n Workflow

```json
{
  "nodes": [
    {
      "parameters": {
        "url": "http://localhost:7000/api/download-mp3",
        "method": "POST",
        "jsonParameters": true,
        "options": {
          "response": {
            "response": {
              "responseFormat": "file",
              "outputPropertyName": "data"
            }
          }
        },
        "bodyParametersJson": "={{ { \"url\": $json.videoUrl } }}"
      },
      "name": "Download YouTube MP3",
      "type": "n8n-nodes-base.httpRequest",
      "position": [250, 300]
    },
    {
      "parameters": {
        "operation": "upload",
        "binaryPropertyName": "data",
        "path": "/downloads"
      },
      "name": "Save to Drive",
      "type": "n8n-nodes-base.googleDrive",
      "position": [450, 300]
    }
  ]
}
```

## cURL Examples for Testing

### Download Video as Binary
```bash
curl -X POST http://localhost:7000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/VIDEO_ID", "format": "best"}' \
  --output video.mp4
```

### Download MP3 as Binary
```bash
curl -X POST http://localhost:7000/api/download-mp3 \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/VIDEO_ID"}' \
  --output audio.mp3
```

### With Authentication (if API_KEY is set)
```bash
curl -X POST http://localhost:7000/api/download-mp3 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"url": "https://youtu.be/VIDEO_ID"}' \
  --output audio.mp3
```

## Features

✅ **Binary Response**: Files are returned as binary data, not JSON
✅ **Auto-Cleanup**: Downloaded files are automatically deleted after sending
✅ **Proper Headers**: Includes Content-Disposition with original filename
✅ **Cookie Support**: Uses Brave browser cookies from environment variable
✅ **Configurable**: All settings from `.env` file
✅ **n8n Compatible**: Works seamlessly with n8n's binary data handling

## Environment Variables

All configuration is done via `.env`:

```env
# Required
PORT=7000
HOST=localhost
YTDLP_OUTPUT_PATH=./downloads

# Optional
YTDLP_COOKIES_FROM_BROWSER=brave
YTDLP_MAX_FILE_SIZE=500M
YTDLP_RATE_LIMIT=5M
DOWNLOAD_TIMEOUT=300000
```

## Error Handling

If download fails, returns JSON error:
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Supported Formats

### Video Formats
- `best` - Best quality (video+audio)
- `bestvideo+bestaudio` - Separate best video and audio
- `worst` - Lowest quality
- `22` - 720p
- `18` - 360p
- Format codes from yt-dlp

### Audio Format
- Always converts to MP3 (320kbps by default)

## Limitations

⚠️ **YouTube Bot Protection**: YouTube may block downloads with 403 errors even with cookies. Solutions:
- Log into YouTube in Brave browser first
- Try different videos
- Use OAuth authentication
- Test with other platforms (TikTok, Instagram, etc.)

## Testing the Binary Response

```bash
# Test if file is actually binary
curl -X POST http://localhost:7000/api/download-mp3 \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/VIDEO_ID"}' \
  --output test.mp3

# Check file type
file test.mp3

# Check file size
ls -lh test.mp3

# Play the file (if downloaded successfully)
ffplay test.mp3
```

## n8n Binary Data Node

After receiving the binary data in n8n, you can:

1. **Save to disk** using Write Binary File node
2. **Upload to cloud** using Google Drive, S3, Dropbox nodes
3. **Send via email** as attachment
4. **Process further** with FFmpeg or other tools
5. **Store in database** as BLOB

## Troubleshooting

### File not found after download
- Check if download actually completed (check logs)
- Verify `YTDLP_OUTPUT_PATH` directory exists
- Check disk space

### Getting JSON instead of binary
- Ensure n8n HTTP Request node has "Response Format: File" selected
- Check that download didn't fail (would return JSON error)

### 403 Forbidden errors
- Log into YouTube in Brave browser
- Ensure cookies are accessible
- Try updating yt-dlp: `sudo yt-dlp -U`

## Support for Other Platforms

Works with any platform supported by yt-dlp:
- YouTube
- TikTok
- Instagram
- Facebook
- Twitter/X
- Vimeo
- And 1000+ more sites
