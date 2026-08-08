const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 8000;
const TEMP_DIR = path.join(__dirname, 'temp');
const OUTPUT_DIR = path.join(__dirname, 'output');

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

  // Create Video
  if (pathname === '/api/create-video' && req.method === 'POST') {
    const body = await parseJSONBody(req);
    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    jobs[jobId] = { status: 'processing', progress: 10, videoPath: null, error: null };

    // Simulate async creation update
    setTimeout(() => { if (jobs[jobId]) jobs[jobId].progress = 50; }, 1000);
    setTimeout(() => {
      if (jobs[jobId]) {
        const dummyPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);
        fs.writeFileSync(dummyPath, 'SIMULATED_VIDEO_DATA');
        jobs[jobId].status = 'completed';
        jobs[jobId].progress = 100;
        jobs[jobId].videoPath = dummyPath;
      }
    }, 2500);

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

  // Fallback 404
  return sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});
