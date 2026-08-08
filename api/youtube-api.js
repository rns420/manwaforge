/**
 * YouTubeAPI - Full OAuth2 flow using Google Client ID + Client Secret
 * Supports: token exchange via PKCE-style implicit flow (browser) 
 * OR full auth-code flow via the Python backend (recommended)
 *
 * USAGE:
 *  1. Set clientId and clientSecret in Settings modal
 *  2. Call window.YouTubeAPI.initiateOAuthFlow() → opens Google consent popup
 *  3. After user approves, token is saved to localStorage automatically
 *  4. uploadVideo(), scheduleVideo(), setThumbnail() all work with saved token
 */

class YouTubeAPI {
  constructor() {
    this.name = 'YouTubeAPI';
    this.SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube';
    this.TOKEN_KEY = 'mf_yt_access_token';
    this.EXPIRY_KEY = 'mf_yt_token_expiry';
    this.CLIENT_ID_KEY = 'mf_yt_client_id';
    this.CLIENT_SECRET_KEY = 'mf_yt_client_secret';
    this.REFRESH_TOKEN_KEY = 'mf_yt_refresh_token';
    this._authCallbackInstalled = false;
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get clientId() {
    return localStorage.getItem(this.CLIENT_ID_KEY) || '';
  }

  get clientSecret() {
    return localStorage.getItem(this.CLIENT_SECRET_KEY) || '';
  }

  set clientId(val) {
    localStorage.setItem(this.CLIENT_ID_KEY, val);
  }

  set clientSecret(val) {
    localStorage.setItem(this.CLIENT_SECRET_KEY, val);
  }

  getAccessToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getRefreshToken() {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  isTokenExpired() {
    const expiry = localStorage.getItem(this.EXPIRY_KEY);
    if (!expiry) return true;
    return Date.now() > parseInt(expiry) - 60000; // 1 min buffer
  }

  saveTokens({ access_token, refresh_token, expires_in }) {
    if (access_token) {
      localStorage.setItem(this.TOKEN_KEY, access_token);
      const expiresAt = Date.now() + (parseInt(expires_in || 3600) * 1000);
      localStorage.setItem(this.EXPIRY_KEY, String(expiresAt));
    }
    if (refresh_token) {
      localStorage.setItem(this.REFRESH_TOKEN_KEY, refresh_token);
    }
  }

  clearTokens() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.EXPIRY_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  // ── Authentication ────────────────────────────────────────────────────────

  async isAuthenticated() {
    const token = this.getAccessToken();
    if (!token) return false;
    if (this.isTokenExpired()) {
      const refreshed = await this.refreshAccessToken();
      return refreshed;
    }
    // Quick check: verify token is valid
    try {
      const res = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`,
        { signal: AbortSignal.timeout(5000) }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Initiate OAuth2 with implicit flow (no server needed)
   * Uses client_id only. Opens Google consent popup.
   * Token returned directly in URL fragment.
   */
  async initiateOAuthFlow() {
    if (!this.clientId) {
      throw new Error('YouTube Client ID is required. Go to Settings → YouTube Client ID.');
    }

    return new Promise((resolve, reject) => {
      // Install message listener ONCE
      if (!this._authCallbackInstalled) {
        this._authCallbackInstalled = true;
        window.addEventListener('message', (e) => {
          if (e.data && e.data.type === 'mf_youtube_auth') {
            if (e.data.error) {
              reject(new Error(e.data.error));
            } else {
              this.saveTokens({
                access_token: e.data.access_token,
                refresh_token: e.data.refresh_token,
                expires_in: e.data.expires_in || 3600
              });
              resolve({ success: true, access_token: e.data.access_token });
            }
          }
        });
      }

      // Build OAuth URL (implicit flow = response_type=token)
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: `${window.location.origin}/oauth-callback.html`,
        response_type: 'token',
        scope: this.SCOPES,
        prompt: 'consent',
        access_type: 'online',
        include_granted_scopes: 'true'
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      // Open in popup
      const popup = window.open(
        authUrl,
        'youtube_oauth',
        'width=600,height=700,left=200,top=100,scrollbars=yes'
      );

      if (!popup) {
        reject(new Error('Popup was blocked. Allow popups for this page and try again.'));
        return;
      }

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timed out. Please try again.'));
      }, 5 * 60 * 1000);

      // Poll for popup close without message (user cancelled)
      const pollClose = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClose);
          clearTimeout(timeout);
          // If still no token after popup closed, user cancelled
          if (!this.getAccessToken()) {
            reject(new Error('Authentication cancelled by user.'));
          }
        }
      }, 500);
    });
  }

  /**
   * Refresh access token using client_id + client_secret + refresh_token
   * Requires backend proxy to avoid CORS (or use backend /api/yt-refresh)
   */
  async refreshAccessToken() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken || !this.clientId || !this.clientSecret) return false;

    try {
      // Try via Python backend first (avoids CORS)
      const serverUrl = window.ManhwaConfig?.endpoints?.pythonServer || 'http://localhost:8000';
      const res = await fetch(`${serverUrl}/api/yt-refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        this.saveTokens(data);
        return true;
      }
    } catch {
      // Backend unavailable, try direct (may hit CORS)
    }

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        }).toString()
      });
      if (res.ok) {
        const data = await res.json();
        this.saveTokens(data);
        return true;
      }
    } catch {
      // Ignore
    }

    return false;
  }

  async getValidToken() {
    if (this.isTokenExpired()) {
      await this.refreshAccessToken();
    }
    const token = this.getAccessToken();
    if (!token) throw new Error('Not authenticated with YouTube. Click "Connect YouTube" in Settings.');
    return token;
  }

  async getChannelInfo() {
    const token = await this.getValidToken();
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Channel info failed: ${res.status}`);
    const data = await res.json();
    return data.items?.[0] || null;
  }

  // ── Video Upload ──────────────────────────────────────────────────────────

  /**
   * Upload video using resumable upload protocol.
   * videoBlob: Blob object OR a URL string (will fetch the blob from URL)
   */
  async uploadVideo(videoBlob, metadata) {
    const token = await this.getValidToken();

    // If given a URL string, fetch the blob
    if (typeof videoBlob === 'string') {
      const res = await fetch(videoBlob);
      if (!res.ok) throw new Error(`Failed to fetch video blob from URL: ${res.status}`);
      videoBlob = await res.blob();
    }

    const mimeType = videoBlob.type || 'video/webm';

    // Step 1: Initiate resumable upload session
    const initBody = {
      snippet: {
        title: metadata.title || 'Manhwa Recap',
        description: metadata.description || '',
        tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        categoryId: metadata.categoryId || '24',  // 24 = Entertainment
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en'
      },
      status: {
        privacyStatus: 'private',  // Always private first, schedule publish separately
        selfDeclaredMadeForKids: false,
        embeddable: true,
        publicStatsViewable: true
      }
    };

    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': videoBlob.size,
          'X-Upload-Content-Type': mimeType
        },
        body: JSON.stringify(initBody)
      }
    );

    if (!initRes.ok) {
      const err = await initRes.text();
      throw new Error(`Upload init failed (${initRes.status}): ${err}`);
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) throw new Error('No upload URL returned from YouTube API.');

    // Step 2: Upload the video bytes
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: videoBlob
    });

    if (!uploadRes.ok && uploadRes.status !== 308) {
      const err = await uploadRes.text();
      throw new Error(`Video upload failed (${uploadRes.status}): ${err}`);
    }

    const data = await uploadRes.json();
    const videoId = data.id;

    // Step 3: Upload thumbnail if provided
    if (metadata.thumbnailUrl && videoId) {
      try {
        await this.setThumbnailFromUrl(videoId, metadata.thumbnailUrl);
      } catch (e) {
        console.warn('Thumbnail upload failed:', e.message);
      }
    }

    return videoId;
  }

  async setThumbnail(videoId, imageBlob) {
    const token = await this.getValidToken();
    const res = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': imageBlob.type || 'image/jpeg'
        },
        body: imageBlob
      }
    );
    if (!res.ok) throw new Error(`Thumbnail upload failed: ${res.status}`);
    return await res.json();
  }

  async setThumbnailFromUrl(videoId, imageUrl) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch thumbnail image: ${res.status}`);
    const blob = await res.blob();
    return this.setThumbnail(videoId, blob);
  }

  // ── Scheduling ────────────────────────────────────────────────────────────

  async scheduleVideo(videoId, publishAtISO) {
    const token = await this.getValidToken();
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: videoId,
          status: {
            privacyStatus: 'private',
            publishAt: publishAtISO
          }
        })
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Scheduling failed (${res.status}): ${err}`);
    }
    return await res.json();
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  disconnect() {
    this.clearTokens();
    console.log('[YouTubeAPI] Disconnected and tokens cleared.');
  }
}

window.YouTubeAPI = new YouTubeAPI();
