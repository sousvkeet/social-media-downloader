import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json());

// Environment variable validation
const requiredEnvVars = ['PORT', 'YTDLP_OUTPUT_PATH'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
}

// Log loaded environment variables
console.log('\n📋 Environment Configuration:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`🌐 HOST:                      ${process.env.HOST}`);
console.log(`🔌 PORT:                      ${process.env.PORT}`);
console.log(`🌍 NODE_ENV:                  ${process.env.NODE_ENV}`);
console.log(`🔗 SERVER_URL:                ${process.env.SERVER_URL || 'Not set (will use HOST:PORT)'}`);
console.log(`🔗 CORS_ORIGIN:               ${process.env.CORS_ORIGIN}`);
console.log(`🍪 YTDLP_COOKIES_FROM_BROWSER: ${process.env.YTDLP_COOKIES_FROM_BROWSER}`);
console.log(`📁 YTDLP_OUTPUT_PATH:         ${process.env.YTDLP_OUTPUT_PATH}`);
console.log(`📦 YTDLP_MAX_FILE_SIZE:       ${process.env.YTDLP_MAX_FILE_SIZE}`);
console.log(`⚡ YTDLP_RATE_LIMIT:          ${process.env.YTDLP_RATE_LIMIT}`);
console.log(`🔢 MAX_CONCURRENT_DOWNLOADS:  ${process.env.MAX_CONCURRENT_DOWNLOADS}`);
console.log(`⏱️  DOWNLOAD_TIMEOUT:          ${process.env.DOWNLOAD_TIMEOUT}ms`);
console.log(`🧹 FILE_CLEANUP_INTERVAL:     ${process.env.FILE_CLEANUP_INTERVAL} minutes`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Create downloads directory
const downloadsPath = path.resolve(process.cwd(), process.env.YTDLP_OUTPUT_PATH);
await fs.mkdir(downloadsPath, { recursive: true });

// Helper function to sanitize filename for HTTP headers
function sanitizeFilename(filename) {
    return filename
        .replace(/[^\x20-\x7E]/g, '') // Remove non-ASCII characters
        .replace(/["\\]/g, '') // Remove quotes and backslashes
        .replace(/[|<>:]/g, '-') // Replace problematic characters with dash
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .substring(0, 200); // Limit length
}

// Auto cleanup function
async function cleanupOldFiles() {
    try {
        console.log('🧹 Starting automatic file cleanup...');
        
        const files = await fs.readdir(downloadsPath);
        let deletedCount = 0;
        let errorCount = 0;

        for (const file of files) {
            try {
                const filePath = path.join(downloadsPath, file);
                const stats = await fs.stat(filePath);
                
                // Delete files older than cleanup interval
                const fileAge = Date.now() - stats.mtimeMs;
                const cleanupInterval = parseInt(process.env.FILE_CLEANUP_INTERVAL) || 30;
                const maxAge = cleanupInterval * 60 * 1000; // Convert minutes to milliseconds
                
                if (fileAge > maxAge) {
                    await fs.unlink(filePath);
                    deletedCount++;
                    console.log(`   ✓ Deleted: ${file} (age: ${Math.round(fileAge / 60000)} minutes)`);
                }
            } catch (err) {
                errorCount++;
                console.warn(`   ✗ Failed to delete ${file}:`, err.message);
            }
        }
        
        console.log(`🧹 Cleanup complete: ${deletedCount} files deleted, ${errorCount} errors, ${files.length - deletedCount} files remaining\n`);
    } catch (error) {
        console.error('❌ Cleanup error:', error.message);
    }
}

// Schedule automatic cleanup
const cleanupInterval = parseInt(process.env.FILE_CLEANUP_INTERVAL);
if (cleanupInterval > 0) {
    const intervalMs = cleanupInterval * 60 * 1000; // Convert minutes to milliseconds
    console.log(`🕐 Auto cleanup enabled: Every ${cleanupInterval} minutes\n`);
    
    // Run cleanup immediately on startup
    cleanupOldFiles();
    
    // Schedule periodic cleanup
    setInterval(cleanupOldFiles, intervalMs);
} else {
    console.log('🕐 Auto cleanup disabled (set FILE_CLEANUP_INTERVAL > 0 to enable)\n');
}

// Test endpoint to verify environment variables
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: {
            host: process.env.HOST,
            port: process.env.PORT,
            nodeEnv: process.env.NODE_ENV,
            serverUrl: process.env.SERVER_URL,
            corsOrigin: process.env.CORS_ORIGIN,
            ytdlpCookiesFromBrowser: process.env.YTDLP_COOKIES_FROM_BROWSER,
            ytdlpOutputPath: process.env.YTDLP_OUTPUT_PATH,
            ytdlpMaxFileSize: process.env.YTDLP_MAX_FILE_SIZE,
            ytdlpRateLimit: process.env.YTDLP_RATE_LIMIT,
            maxConcurrentDownloads: process.env.MAX_CONCURRENT_DOWNLOADS,
            downloadTimeout: process.env.DOWNLOAD_TIMEOUT,
            fileCleanupInterval: process.env.FILE_CLEANUP_INTERVAL,
        }
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// Video info endpoint
app.post('/api/video-info', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ 
                success: false, 
                error: 'URL is required' 
            });
        }

        console.log(`📹 Fetching video info for: ${url}`);

        let command = `yt-dlp --dump-json --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`;
        if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
            command += ` --cookies-from-browser ${process.env.YTDLP_COOKIES_FROM_BROWSER}`;
        }
        command += ` "${url}"`;
        
        const { stdout, stderr } = await execPromise(command, {
            timeout: parseInt(process.env.DOWNLOAD_TIMEOUT) || 30000
        });

        if (stderr) {
            console.warn('⚠️  Warning:', stderr);
        }

        const videoInfo = JSON.parse(stdout);

        res.json({
            success: true,
            data: {
                title: videoInfo.title,
                duration: videoInfo.duration,
                thumbnail: videoInfo.thumbnail,
                uploader: videoInfo.uploader,
                description: videoInfo.description,
                formats: videoInfo.formats?.map(f => ({
                    format_id: f.format_id,
                    ext: f.ext,
                    quality: f.quality,
                    filesize: f.filesize,
                })),
            }
        });

    } catch (error) {
        console.error('❌ Error fetching video info:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Download video endpoint
app.post('/api/download', async (req, res) => {
    try {
        const { url, format = 'best' } = req.body;

        if (!url) {
            return res.status(400).json({ 
                success: false, 
                error: 'URL is required' 
            });
        }

        console.log(`⬇️  Downloading: ${url}`);

        const timestamp = Date.now();
        const outputTemplate = path.join(downloadsPath, `${timestamp}_%(title)s.%(ext)s`);
        
        let command = `yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`;
        if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
            command += ` --cookies-from-browser ${process.env.YTDLP_COOKIES_FROM_BROWSER}`;
        }
        command += ` -o "${outputTemplate}"`;
        
        if (process.env.YTDLP_MAX_FILE_SIZE) {
            command += ` --max-filesize ${process.env.YTDLP_MAX_FILE_SIZE}`;
        }
        
        if (process.env.YTDLP_RATE_LIMIT) {
            command += ` --limit-rate ${process.env.YTDLP_RATE_LIMIT}`;
        }
        
        command += ` -f ${format} "${url}"`;

        const { stdout, stderr } = await execPromise(command, {
            timeout: parseInt(process.env.DOWNLOAD_TIMEOUT) || 300000
        });

        if (stderr) {
            console.warn('⚠️  Warning:', stderr);
        }

        console.log('✅ Download completed');

        // Find the downloaded file
        const files = await fs.readdir(downloadsPath);
        const downloadedFile = files.find(f => f.startsWith(timestamp.toString()));
        
        if (!downloadedFile) {
            throw new Error('Downloaded file not found');
        }

        const filePath = path.join(downloadsPath, downloadedFile);
        const fileName = downloadedFile.replace(`${timestamp}_`, '');
        const safeFileName = sanitizeFilename(fileName);
        
        // Get file stats for Content-Length
        const stats = await fs.stat(filePath);
        
        // Send file as binary stream
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
        res.setHeader('Content-Length', stats.size);
        
        // Use streaming instead of loading entire file in memory
        const readStream = createReadStream(filePath);
        readStream.pipe(res);
        
        // Delete file after streaming completes
        readStream.on('end', async () => {
            await fs.unlink(filePath).catch(err => console.warn('Could not delete file:', err));
        });

    } catch (error) {
        console.error('❌ Error downloading video:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Download audio (MP3) endpoint
app.post('/api/download-mp3', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ 
                success: false, 
                error: 'URL is required' 
            });
        }

        console.log(`🎵 Downloading MP3: ${url}`);

        const timestamp = Date.now();
        const outputTemplate = path.join(downloadsPath, `${timestamp}_%(title)s.%(ext)s`);
        
        let command = `yt-dlp`;
        if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
            command += ` --cookies-from-browser ${process.env.YTDLP_COOKIES_FROM_BROWSER}`;
        }
        command += ` --extractor-args "youtube:player_client=android"`;
        command += ` -o "${outputTemplate}"`;
        command += ` -x --audio-format mp3`;
        
        if (process.env.YTDLP_MAX_FILE_SIZE) {
            command += ` --max-filesize ${process.env.YTDLP_MAX_FILE_SIZE}`;
        }
        
        if (process.env.YTDLP_RATE_LIMIT) {
            command += ` --limit-rate ${process.env.YTDLP_RATE_LIMIT}`;
        }
        
        command += ` "${url}"`;

        const { stdout, stderr } = await execPromise(command, {
            timeout: parseInt(process.env.DOWNLOAD_TIMEOUT) || 300000
        });

        if (stderr) {
            console.warn('⚠️  Warning:', stderr);
        }

        console.log('✅ MP3 download completed');

        // Find the downloaded file
        const files = await fs.readdir(downloadsPath);
        const downloadedFile = files.find(f => f.startsWith(timestamp.toString()));
        
        if (!downloadedFile) {
            throw new Error('Downloaded file not found');
        }

        const filePath = path.join(downloadsPath, downloadedFile);
        const fileName = downloadedFile.replace(`${timestamp}_`, '');
        const safeFileName = sanitizeFilename(fileName);
        
        // Get file stats for Content-Length
        const stats = await fs.stat(filePath);
        
        // Send file as binary stream
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
        res.setHeader('Content-Length', stats.size);
        
        // Use streaming instead of loading entire file in memory
        const readStream = createReadStream(filePath);
        readStream.pipe(res);
        
        // Delete file after streaming completes
        readStream.on('end', async () => {
            await fs.unlink(filePath).catch(err => console.warn('Could not delete file:', err));
        });

    } catch (error) {
        console.error('❌ Error downloading MP3:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Download with URL response (n8n friendly for large files)
app.post('/api/download-url', async (req, res) => {
    try {
        const { url, format = 'best' } = req.body;

        if (!url) {
            return res.status(400).json({ 
                success: false, 
                error: 'URL is required' 
            });
        }

        console.log(`⬇️  Downloading (URL mode): ${url}`);

        const timestamp = Date.now();
        const outputTemplate = path.join(downloadsPath, `${timestamp}_%(title)s.%(ext)s`);
        
        let command = `yt-dlp --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`;
        if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
            command += ` --cookies-from-browser ${process.env.YTDLP_COOKIES_FROM_BROWSER}`;
        }
        command += ` -o "${outputTemplate}"`;
        
        if (process.env.YTDLP_MAX_FILE_SIZE) {
            command += ` --max-filesize ${process.env.YTDLP_MAX_FILE_SIZE}`;
        }
        
        if (process.env.YTDLP_RATE_LIMIT) {
            command += ` --limit-rate ${process.env.YTDLP_RATE_LIMIT}`;
        }
        
        command += ` -f ${format} "${url}"`;

        const { stdout, stderr } = await execPromise(command, {
            timeout: parseInt(process.env.DOWNLOAD_TIMEOUT) || 300000
        });

        if (stderr) {
            console.warn('⚠️  Warning:', stderr);
        }

        // Find the downloaded file
        const files = await fs.readdir(downloadsPath);
        const downloadedFile = files.find(f => f.startsWith(timestamp.toString()));
        
        if (!downloadedFile) {
            throw new Error('Downloaded file not found');
        }

        const stats = await fs.stat(path.join(downloadsPath, downloadedFile));
        const fileName = downloadedFile.replace(`${timestamp}_`, '');

        console.log('✅ Download completed');

        // Get server URL from env or construct from HOST:PORT
        const serverUrl = process.env.SERVER_URL || `http://${HOST}:${PORT}`;
        const encodedFileName = encodeURIComponent(downloadedFile);

        // Return download URL instead of binary
        res.json({
            success: true,
            downloadUrl: `${serverUrl}/downloads/${encodedFileName}`,
            fileName: fileName,
            fileSize: stats.size,
            message: 'File ready for download'
        });

    } catch (error) {
        console.error('❌ Error downloading video:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Download MP3 with URL response (n8n friendly for large files)
app.post('/api/download-mp3-url', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ 
                success: false, 
                error: 'URL is required' 
            });
        }

        console.log(`🎵 Downloading MP3 (URL mode): ${url}`);

        const timestamp = Date.now();
        const outputTemplate = path.join(downloadsPath, `${timestamp}_%(title)s.%(ext)s`);
        
        let command = `yt-dlp`;
        if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
            command += ` --cookies-from-browser ${process.env.YTDLP_COOKIES_FROM_BROWSER}`;
        }
        command += ` --extractor-args "youtube:player_client=android"`;
        command += ` -o "${outputTemplate}"`;
        command += ` -x --audio-format mp3`;
        
        if (process.env.YTDLP_MAX_FILE_SIZE) {
            command += ` --max-filesize ${process.env.YTDLP_MAX_FILE_SIZE}`;
        }
        
        if (process.env.YTDLP_RATE_LIMIT) {
            command += ` --limit-rate ${process.env.YTDLP_RATE_LIMIT}`;
        }
        
        command += ` "${url}"`;

        const { stdout, stderr } = await execPromise(command, {
            timeout: parseInt(process.env.DOWNLOAD_TIMEOUT) || 300000
        });

        if (stderr) {
            console.warn('⚠️  Warning:', stderr);
        }

        // Find the downloaded file
        const files = await fs.readdir(downloadsPath);
        const downloadedFile = files.find(f => f.startsWith(timestamp.toString()));
        
        if (!downloadedFile) {
            throw new Error('Downloaded file not found');
        }

        const stats = await fs.stat(path.join(downloadsPath, downloadedFile));
        const fileName = downloadedFile.replace(`${timestamp}_`, '');

        console.log('✅ MP3 download completed');

        // Get server URL from env or construct from HOST:PORT
        const serverUrl = process.env.SERVER_URL || `http://${HOST}:${PORT}`;
        const encodedFileName = encodeURIComponent(downloadedFile);

        // Return download URL instead of binary
        res.json({
            success: true,
            downloadUrl: `${serverUrl}/downloads/${encodedFileName}`,
            fileName: fileName,
            fileSize: stats.size,
            message: 'File ready for download'
        });

    } catch (error) {
        console.error('❌ Error downloading MP3:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Serve downloaded files
app.use('/downloads', express.static(downloadsPath));

// Cleanup endpoint to delete specific file
app.delete('/api/cleanup/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(downloadsPath, filename);
        
        await fs.unlink(filePath);
        
        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Manual cleanup endpoint to trigger cleanup immediately
app.post('/api/cleanup-all', async (req, res) => {
    try {
        console.log('🧹 Manual cleanup triggered via API');
        await cleanupOldFiles();
        
        res.json({
            success: true,
            message: 'Cleanup completed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Server is running on http://${HOST}:${PORT}`);
    console.log(`📡 API endpoints available:`);
    console.log(`   - GET  /api/health`);
    console.log(`   - GET  /api/config`);
    console.log(`   - POST /api/video-info`);
    console.log(`   - POST /api/download (binary)`);
    console.log(`   - POST /api/download-mp3 (binary)`);
    console.log(`   - POST /api/download-url (returns URL)`);
    console.log(`   - POST /api/download-mp3-url (returns URL)`);
    console.log(`   - GET  /downloads/:filename`);
    console.log(`   - POST /api/cleanup-all`);
    console.log(`   - DELETE /api/cleanup/:filename\n`);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled Rejection:', error);
});
