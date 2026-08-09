const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8000;
const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'output');
const PUBLIC_DIR = path.join(__dirname, '..');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const jobs = {};

function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', err => reject(err));
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Health
  if (pathname === '/health' && req.method === 'GET') {
    return sendJSON(res, 200, { status: 'ok', version: '1.0' });
  }

  // Config / Env Keys endpoint for Railway environment variables
  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJSON(res, 200, {
      groq: process.env.GROQ_API_KEY || process.env.GROQ_KEY || '',
      deepgram: process.env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_KEY || '',
      openrouter: process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '',
      ytClientId: process.env.YOUTUBE_CLIENT_ID || '',
      ytClientSecret: process.env.YOUTUBE_CLIENT_SECRET || ''
    });
  }

  // AI Proxy Endpoint (Bypasses all browser CORS restrictions)
  if (pathname === '/api/ai-proxy' && req.method === 'POST') {
    const body = await parseJSONBody(req);
    const { provider, model, systemPrompt, userPrompt, apiKey } = body;
    const https = require('https');
    
    try {
      if (provider === 'groq') {
        const key = apiKey || process.env.GROQ_API_KEY || process.env.GROQ_KEY || '';
        if (!key) return sendJSON(res, 400, { error: 'Groq API key missing' });
        const postData = JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature: 0.7,
          max_tokens: 4096
        });
        const gRes = await new Promise((resolve, reject) => {
          const req = https.request('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`,
              'Content-Length': Buffer.byteLength(postData)
            }
          }, r => {
            let data = '';
            r.on('data', c => data += c);
            r.on('end', () => {
              try { resolve({ status: r.statusCode, data: JSON.parse(data) }); }
              catch(e) { resolve({ status: r.statusCode, data: {} }); }
            });
          });
          req.on('error', reject);
          req.write(postData);
          req.end();
        });
        if (gRes.status === 200 && gRes.data?.choices?.[0]?.message?.content) {
          return sendJSON(res, 200, { text: gRes.data.choices[0].message.content });
        }
        return sendJSON(res, gRes.status || 500, { error: `Groq error ${gRes.status}` });
      }

      if (provider === 'openrouter') {
        const key = apiKey || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '';
        if (!key) return sendJSON(res, 400, { error: 'OpenRouter API key missing' });
        const postData = JSON.stringify({
          model: model || 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: 4096
        });
        const oRes = await new Promise((resolve, reject) => {
          const req = https.request('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`,
              'HTTP-Referer': 'https://manwaforge.up.railway.app',
              'X-Title': 'ManhwaForge',
              'Content-Length': Buffer.byteLength(postData)
            }
          }, r => {
            let data = '';
            r.on('data', c => data += c);
            r.on('end', () => {
              try { resolve({ status: r.statusCode, data: JSON.parse(data) }); }
              catch(e) { resolve({ status: r.statusCode, data: {} }); }
            });
          });
          req.on('error', reject);
          req.write(postData);
          req.end();
        });
        if (oRes.status === 200 && oRes.data?.choices?.[0]?.message?.content) {
          return sendJSON(res, 200, { text: oRes.data.choices[0].message.content });
        }
        return sendJSON(res, oRes.status || 500, { error: `OpenRouter error ${oRes.status}` });
      }

      if (provider === 'pollinations') {
        const pollUrl = `https://text.pollinations.ai/${encodeURIComponent(userPrompt.substring(0, 1500))}?model=${model || 'openai-large'}&system=${encodeURIComponent(systemPrompt.substring(0, 500))}`;
        const pText = await new Promise((resolve, reject) => {
          https.get(pollUrl, r => {
            let data = '';
            r.on('data', c => data += c);
            r.on('end', () => resolve(data));
          }).on('error', reject);
        });
        if (pText && pText.trim()) {
          return sendJSON(res, 200, { text: pText });
        }
        return sendJSON(res, 500, { error: 'Pollinations empty response' });
      }

      if (provider === 'apifreellm') {
        const postData = JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
        });
        const aRes = await new Promise((resolve, reject) => {
          const req = https.request('https://apifreellm.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
          }, r => {
            let data = '';
            r.on('data', c => data += c);
            r.on('end', () => {
              try { resolve({ status: r.statusCode, data: JSON.parse(data) }); }
              catch(e) { resolve({ status: r.statusCode, data: {} }); }
            });
          });
          req.on('error', reject);
          req.write(postData);
          req.end();
        });
        if (aRes.status === 200 && aRes.data?.choices?.[0]?.message?.content) {
          return sendJSON(res, 200, { text: aRes.data.choices[0].message.content });
        }
        return sendJSON(res, aRes.status || 500, { error: `APIFreeLLM error ${aRes.status}` });
      }

      if (provider === 'enally') {
        const postData = JSON.stringify({ system: systemPrompt, prompt: userPrompt });
        const eText = await new Promise((resolve, reject) => {
          const req = https.request('https://ai.enally.in/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
          }, r => {
            let data = '';
            r.on('data', c => data += c);
            r.on('end', () => resolve(data));
          });
          req.on('error', reject);
          req.write(postData);
          req.end();
        });
        if (eText && eText.trim()) {
          return sendJSON(res, 200, { text: eText });
        }
        return sendJSON(res, 500, { error: 'Enally AI empty response' });
      }

      return sendJSON(res, 400, { error: 'Unknown provider' });
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // Scrape stories
  if (pathname === '/api/scrape-stories' && req.method === 'GET') {
    const site = parsedUrl.searchParams.get('site') || 'Webtoons';
    const stories = [
      {
        title: 'The Solo Necromancer King',
        genre: 'System Action',
        synopsis: `An F-rank miner unlocks a forbidden class on ${site}.`,
        url: `https://www.${site.toLowerCase()}.com/solo-necromancer`,
        chapter_count: 150,
        site: site.toLowerCase(),
        author: 'Shadow Studio',
        rating: 4.9
      },
      {
        title: 'Reincarnated as the Villainess Knight',
        genre: 'Romance Fantasy',
        synopsis: 'Sworn to protect the villainess, he uses modern tactical warfare.',
        url: `https://www.${site.toLowerCase()}.com/villainess-knight`,
        chapter_count: 90,
        site: site.toLowerCase(),
        author: 'Luna',
        rating: 4.8
      },
      {
        title: 'Return of the 9th Circle Mage',
        genre: 'Regression Magic',
        synopsis: 'Betrayed at peak power, he regresses 30 years with all spells.',
        url: `https://www.${site.toLowerCase()}.com/9th-circle-mage`,
        chapter_count: 200,
        site: site.toLowerCase(),
        author: 'Archmage',
        rating: 4.95
      }
    ];
    return sendJSON(res, 200, stories);
  }

const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');

function runFFmpeg(args) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-y', ...args], (err) => {
      if (err) resolve(false);
      else resolve(true);
    });
  });
}

function downloadImage(url, destPath) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith('http')) return resolve(false);
    const httpLib = url.startsWith('https') ? require('https') : require('http');
    const file = fs.createWriteStream(destPath);
    httpLib.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(() => resolve(true)); });
    }).on('error', () => {
      fs.unlink(destPath, () => {});
      resolve(false);
    });
  });
}

async function processRealVideoJob(jobId, body) {
  try {
    const panels = body.panels || [];
    const storyTitle = body.story_title || 'Manhwa Story';
    const clips = [];
    
    // Create title clip
    const titleOut = path.join(TEMP_DIR, `${jobId}_title.mp4`);
    const safeTitle = storyTitle.replace(/'/g, '').replace(/:/g, '');
    await runFFmpeg([
      '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=2',
      '-vf', `drawtext=text='${safeTitle}':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', titleOut
    ]);
    if (fs.existsSync(titleOut)) clips.push(titleOut);

    // Process panel clips
    const total = panels.length || 1;
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const imgUrl = p.image_url || p.url || p.imageUrl;
      const dur = p.duration || 11.0;
      const imgFile = path.join(TEMP_DIR, `${jobId}_panel_${i}.jpg`);
      const clipOut = path.join(TEMP_DIR, `${jobId}_clip_${i}.mp4`);
      
      const downloaded = await downloadImage(imgUrl, imgFile);
      const inputPath = downloaded ? imgFile : titleOut;
      const zoomEffect = i % 2 === 0 ? "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.0015,1.3)':d=275:s=1920x1080" : "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.3':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=275:s=1920x1080";
      
      await runFFmpeg([
        '-loop', '1', '-i', inputPath,
        '-vf', zoomEffect,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-t', String(dur), '-pix_fmt', 'yuv420p', '-r', '25',
        clipOut
      ]);

      if (fs.existsSync(clipOut)) clips.push(clipOut);
      if (jobs[jobId]) jobs[jobId].progress = Math.min(90, Math.floor(((i + 1) / total) * 80));
    }

    // Create Outro clip
    const outroOut = path.join(TEMP_DIR, `${jobId}_outro.mp4`);
    await runFFmpeg([
      '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:d=4',
      '-vf', "drawtext=text='Subscribe for Episode 2':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2",
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', outroOut
    ]);
    if (fs.existsSync(outroOut)) clips.push(outroOut);

    // Concatenate clips
    const listFile = path.join(TEMP_DIR, `${jobId}_list.txt`);
    const listContent = clips.map(c => `file '${c.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const finalVideoPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
    await runFFmpeg([
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      finalVideoPath
    ]);

    if (jobs[jobId]) {
      jobs[jobId].status = 'completed';
      jobs[jobId].progress = 100;
      jobs[jobId].videoPath = finalVideoPath;
    }
  } catch (err) {
    if (jobs[jobId]) {
      jobs[jobId].status = 'failed';
      jobs[jobId].error = err.message;
    }
  }
}

  // Create Video
  if (pathname === '/api/create-video' && req.method === 'POST') {
    const body = await parseJSONBody(req);
    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    jobs[jobId] = { status: 'processing', progress: 5, videoPath: null, error: null };

    // Process real FFmpeg video job async
    processRealVideoJob(jobId, body);

    return sendJSON(res, 200, { jobId });
  }

  // Video status
  if (pathname.startsWith('/api/video-status/') && req.method === 'GET') {
    const jobId = pathname.replace('/api/video-status/', '');
    if (!jobs[jobId]) return sendJSON(res, 404, { detail: 'Job not found' });
    return sendJSON(res, 200, jobs[jobId]);
  }

  // Download video
  if (pathname.startsWith('/api/download-video/') && req.method === 'GET') {
    const jobId = pathname.replace('/api/download-video/', '');
    if (!jobs[jobId] || !jobs[jobId].videoPath || !fs.existsSync(jobs[jobId].videoPath)) {
      return sendJSON(res, 404, { detail: 'Video not found' });
    }
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${jobId}.mp4"`,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(jobs[jobId].videoPath).pipe(res);
    return;
  }

  // TTS
  if (pathname === '/api/tts' && req.method === 'POST') {
    const body = await parseJSONBody(req);
    const text = body.text || 'Sample speech';
    const sampleAudio = Buffer.alloc(100);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': 'attachment; filename="tts.mp3"',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(sampleAudio);
    return;
  }

  // YT Refresh Token proxy
  if (pathname === '/api/yt-refresh-token' && req.method === 'POST') {
    const body = await parseJSONBody(req);
    const https = require('https');
    const postData = JSON.stringify({
      client_id: body.client_id || '',
      client_secret: body.client_secret || '',
      refresh_token: body.refresh_token || '',
      grant_type: 'refresh_token'
    });
    try {
      const googleRes = await new Promise((resolve, reject) => {
        const greq = https.request('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, gres => {
          let d = '';
          gres.on('data', c => d += c);
          gres.on('end', () => resolve(JSON.parse(d)));
        });
        greq.on('error', reject);
        greq.write(postData);
        greq.end();
      });
      return sendJSON(res, 200, googleRes);
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // Exchange OAuth2 authorization code for tokens
  if (pathname === '/api/yt-exchange-code' && req.method === 'POST') {
    const body = await parseJSONBody(req);
    const https = require('https');
    const postData = JSON.stringify({
      client_id: body.client_id || '',
      client_secret: body.client_secret || '',
      code: body.code || '',
      redirect_uri: body.redirect_uri || 'http://localhost:3333/oauth2callback',
      grant_type: 'authorization_code'
    });
    try {
      const googleRes = await new Promise((resolve, reject) => {
        const greq = https.request('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, gres => {
          let d = '';
          gres.on('data', c => d += c);
          gres.on('end', () => resolve(JSON.parse(d)));
        });
        greq.on('error', reject);
        greq.write(postData);
        greq.end();
      });
      return sendJSON(res, 200, googleRes);
    } catch (e) {
      return sendJSON(res, 500, { error: e.message });
    }
  }

  // Upload assets
  if (pathname === '/api/upload-assets' && req.method === 'POST') {
    return sendJSON(res, 200, { paths: [path.join(TEMP_DIR, 'uploaded_file.png')] });
  }

  // Logs catcher
  if (pathname === '/api/logs' && req.method === 'POST') {
    const body = await parseJSONBody(req);
    const time = new Date().toISOString().replace('T', ' ').substr(0, 19);
    const level = (body.level || 'INFO').toUpperCase();
    const source = body.source || 'Frontend';
    const message = typeof body.message === 'object' ? JSON.stringify(body.message) : body.message;
    console.log(`[${time}] [FRONTEND] [${source}] [${level}] ${message}`);
    return sendJSON(res, 200, { ok: true });
  }

  // Static file serving for Frontend dashboard (Railway single-service deploy)
  let reqPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.wav': 'audio/wav'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Fallback 404
  return sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});
