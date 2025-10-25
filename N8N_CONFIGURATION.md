# n8n Configuration for Large Binary Files

## The Issue

When downloading large video files (>30MB), n8n may throw this error:

```
Cannot create a string longer than 0x1fffffe8 characters
```

**Cause**: n8n's default binary data mode stores files in memory as strings, hitting Node.js string size limits.

## Solution: Configure n8n to Use Filesystem Mode

### Option 1: Environment Variables (Recommended)

Add these to n8n's environment configuration:

```env
N8N_BINARY_DATA_MODE=filesystem
N8N_BINARY_DATA_TTL=60
N8N_PATH=/home/n8n/.n8n
```

#### For Docker Compose:

```yaml
version: '3.8'
services:
  n8n:
    image: n8nio/n8n
    ports:
      - 5678:5678
    environment:
      - N8N_BINARY_DATA_MODE=filesystem
      - N8N_BINARY_DATA_TTL=60
      - N8N_PATH=/home/n8n/.n8n
    volumes:
      - n8n_data:/home/n8n/.n8n
```

#### For PM2 / Direct Install:

Create/edit n8n's `.env` file:

```bash
# /path/to/n8n/.env
N8N_BINARY_DATA_MODE=filesystem
N8N_BINARY_DATA_TTL=60
N8N_PATH=/home/n8n/.n8n
```

#### For Systemd Service:

Edit your n8n service file:

```bash
sudo nano /etc/systemd/system/n8n.service
```

Add environment variables:

```ini
[Service]
Environment="N8N_BINARY_DATA_MODE=filesystem"
Environment="N8N_BINARY_DATA_TTL=60"
Environment="N8N_PATH=/home/n8n/.n8n"
```

Reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart n8n
```

### Option 2: Server Configuration (Already Implemented)

The backend server now uses **streaming** instead of loading entire files into memory. This helps but n8n still needs filesystem mode for large files.

## Environment Variables Explained

| Variable | Description | Value |
|----------|-------------|-------|
| `N8N_BINARY_DATA_MODE` | How n8n stores binary data | `filesystem` |
| `N8N_BINARY_DATA_TTL` | Time to keep binary files (minutes) | `60` |
| `N8N_PATH` | Base path for n8n data | `/home/n8n/.n8n` |

## Verify Configuration

After restarting n8n, check the logs:

```bash
# Docker
docker logs n8n | grep -i binary

# PM2
pm2 logs n8n | grep -i binary

# Systemd
sudo journalctl -u n8n | grep -i binary
```

You should see:
```
Binary data mode: filesystem
```

## Server Improvements Made

The backend server now uses:
- ✅ **Streaming** - Files are streamed, not loaded entirely in memory
- ✅ **Content-Length header** - Proper file size information
- ✅ **Chunk processing** - Handles large files efficiently
- ✅ **Auto-cleanup** - Deletes files after streaming completes

## Testing Large Files

Test with a large video:

```bash
curl -X POST http://localhost:7000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/LARGE_VIDEO_ID"}' \
  --output large_video.mp4
```

## n8n Workflow Settings

### HTTP Request Node Options

1. **Response Format**: File
2. **Binary Property**: data
3. **Options > Timeout**: Increase for large files
   - Set to `300000` (5 minutes) or more

### Recommended Settings for Large Files

```json
{
  "method": "POST",
  "url": "http://localhost:7000/api/download-mp3",
  "options": {
    "timeout": 600000,
    "response": {
      "response": {
        "responseFormat": "file",
        "outputPropertyName": "data"
      }
    }
  }
}
```

## Alternative: Direct URL Download

For very large files, consider providing a download URL instead:

```bash
# Download to server first
curl -X POST http://localhost:7000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "VIDEO_URL", "keepFile": true}' 

# Returns: {"downloadUrl": "http://localhost:7000/downloads/file.mp4"}
```

This would require server modification to serve static files.

## Troubleshooting

### Still Getting Memory Errors?

1. **Verify n8n config**:
   ```bash
   # Check running process
   ps aux | grep n8n
   env | grep N8N
   ```

2. **Increase Node.js memory**:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   ```

3. **Check disk space**:
   ```bash
   df -h
   ```

4. **Monitor memory usage**:
   ```bash
   watch -n 1 'ps aux | grep n8n'
   ```

### File Too Large Errors?

Increase the server limit in `.env`:

```env
YTDLP_MAX_FILE_SIZE=2G  # Allow up to 2GB files
DOWNLOAD_TIMEOUT=900000  # 15 minutes timeout
```

### Streaming Not Working?

Restart the backend server to apply streaming changes:

```bash
# Kill and restart
pm2 restart medei-down

# Or manually
pkill -9 -f "node.*server"
npm run server
```

## Additional Resources

- [n8n Binary Data Documentation](https://docs.n8n.io/hosting/configuration/environment-variables/binary-data/)
- [n8n HTTP Request Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [Node.js Streaming Guide](https://nodejs.org/api/stream.html)

## Performance Tips

### For n8n:
- Use filesystem mode for files >10MB
- Set appropriate TTL to auto-cleanup old files
- Monitor disk space regularly

### For Backend:
- Streaming is now automatic
- Files auto-delete after sending
- Adjust `YTDLP_RATE_LIMIT` to control bandwidth

### For Downloads:
- Use MP3 for smaller files (audio only)
- Specify lower quality formats when appropriate
- Consider splitting large batches
