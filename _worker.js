export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathParts = url.pathname.substring(1).split('/');
    
    let pathToken = "";
    let action = "";

    // Route logic
    if (pathParts[0] === 'credit') {
        action = 'credit';
        pathToken = pathParts[1];
    } else {
        pathToken = pathParts[0];
        action = pathParts[1]; // e.g. "catchup.mpd"
    }

    const workerBase = `${url.origin}/${pathToken}`;

    if (!pathToken) {
      return new Response("Token required. Format: /<token> or /credit/<token>", { status: 400 });
    }

    // 1. Verify Access Token
    try {
      const accessReq = await fetch("https://raw.githubusercontent.com/Ayush8481Lab/Sar/refs/heads/main/app/data/access.json", {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const accessData = await accessReq.json();      
      if (!accessData.tokens || !accessData.tokens.includes(pathToken)) {
        return new Response("Unauthorized: Invalid Token.", { status: 401 });
      }
    } catch (err) {
      return new Response("Error validating access token.", { status: 500 });
    }

    // --- Helper function for fetching and caching generic cookies ---
    // Safely handles '__hdnea__=' formatting to prevent duplicates like '?hdnea=__hdnea__='
    const getCachedCookie = async (fetchUrl, cacheKeyUrl, prefix) => {
      const cache = caches.default;
      const req = new Request(cacheKeyUrl);
      const cachedRes = await cache.match(req);
      if (cachedRes) return await cachedRes.text();
      
      try {
          const res = await fetch(fetchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (res.ok) {
              const data = await res.json();
              let cookieStr = "";
              if (Array.isArray(data)) {
                  const cookieObj = data.find(item => item.cookie);
                  if (cookieObj) cookieStr = cookieObj.cookie;
              }
              if (cookieStr) {
                  // Clean missing tildes (~)
                  cookieStr = cookieStr.replace(/exp=/g, '~exp=').replace(/acl=/g, '~acl=').replace(/hmac=/g, '~hmac=').replace(/~~/g, '~');
                  
                  // Strip any existing prefixes to prevent duplication, then strictly apply the requested prefix
                  cookieStr = cookieStr.replace(/^(hdnea=|__hdnea__=|\?|&)+/, '');
                  cookieStr = prefix + cookieStr;

                  const match = /exp=(\d+)/.exec(cookieStr);
                  if (match && match[1]) {
                      const expTimestamp = parseInt(match[1], 10);
                      const currentSec = Math.floor(Date.now() / 1000);
                      const ttl = (expTimestamp - 3000) - currentSec; // 50 mins before expiry
                      
                      if (ttl > 0) {
                          ctx.waitUntil(cache.put(req, new Response(cookieStr, { headers: { "Cache-Control": `max-age=${ttl}` } })));
                      }
                  }
                  return cookieStr;
              }
          }
      } catch (e) {}
      return "";
    };

    // --- Helper function for fetching, rotating, and caching SonyLiv cookies ---
    const getSonyLivCookie = async () => {
      const cache = caches.default;
      const req = new Request("https://dummy.internal.local/cookie/sonyliv");
      const cachedRes = await cache.match(req);
      if (cachedRes) return await cachedRes.text();

      const idReq = new Request("https://dummy.internal.local/state/sonylivid");
      let nextId = "1090542909";
      const idRes = await cache.match(idReq);
      if (idRes) nextId = await idRes.text();

      try {
          const res = await fetch(`https://ayushlivser.onrender.com/api/https://apiv2.sonyliv.com/AGL/5.0/A/ENG/MWEB/IN/UP/CONTENT/VIDEOURL/VOD/${nextId}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (res.ok) {
              const data = await res.json();
              const videoUrl = data?.resultObj?.videoURL || "";
              
              const match = /hdnea=(exp=\d+~acl=[^~]+~.*?hmac=[a-f0-9]+)/.exec(videoUrl);
              if (match) {
                  const cookieStr = "hdnea=" + match[1];
                  const expMatch = /exp=(\d+)/.exec(cookieStr);
                  if (expMatch && expMatch[1]) {
                      const expTimestamp = parseInt(expMatch[1], 10);
                      const currentSec = Math.floor(Date.now() / 1000);
                      const ttl = (expTimestamp - 3000) - currentSec; 
                      
                      if (ttl > 0) {
                          ctx.waitUntil(cache.put(req, new Response(cookieStr, { headers: { "Cache-Control": `max-age=${ttl}` } })));
                          
                          const nextNextId = (nextId === "1090542909") ? "1090545339" : "1090542909";
                          ctx.waitUntil(cache.put(idReq, new Response(nextNextId, { headers: { "Cache-Control": `max-age=31536000` } })));
                      }
                  }
                  return cookieStr;
              }
          }
      } catch (e) {}
      return "";
    };

    // 2. Track Request Count (Rate Limits Removed)
    const nowMs = Date.now();
    const istDateObj = new Date(nowMs + 19800000); // UTC to IST shift
    const istDateString = istDateObj.toISOString().split('T')[0]; 
    const rlCacheUrl = new URL(`https://dummy.internal.local/ratelimit/${pathToken}/${istDateString}`);
    const rlRequest = new Request(rlCacheUrl.href);
    const cache = caches.default;
    let reqCount = 0;
    
    const cachedLimit = await cache.match(rlRequest);
    if (cachedLimit) {
      reqCount = parseInt(await cachedLimit.text(), 10) || 0;
    }

    // 3. Credit Endpoint 
    if (action === "credit") {
        return new Response(`${reqCount} / Unlimited`, { 
            status: 200, 
            headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" } 
        });
    }

    // 4. Catchup Redirect Handler (JioTV Catchup ONLY)
    if (action === "catchup.mpd" || action === "catchup") {
      const targetUrl = url.searchParams.get("url");
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");

      if (!targetUrl) return new Response("Missing url parameter", { status: 400 });

      let startSec = parseInt(start, 10);
      let endSec = parseInt(end, 10);
      const currentSec = Math.floor(Date.now() / 1000);
      
      // Clamp future timestamps to current time (Live/In-Progress Catchup fix)
      if (endSec > currentSec) endSec = currentSec;
      if (startSec > endSec) startSec = endSec - 3600; 

      // Format JioTV UTC Timestamps
      let finalCatchupUrl = targetUrl;
      const getUTCString = (utcSeconds) => {
        const d = new Date(utcSeconds * 1000); 
        const pad = (n) => (n < 10 ? '0' + n : n);
        return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
      };
      
      finalCatchupUrl += `?begin=${getUTCString(startSec)}&end=${getUTCString(endSec)}`;

      // Fetch Catchup Cookie and append using strict "__hdnea__=" format
      const cpCookie = await getCachedCookie("https://ayushsupercompro.onrender.com/cookies/cp.json", "https://dummy.internal.local/cookie/cp", "__hdnea__=");
      if (cpCookie) finalCatchupUrl += `&${cpCookie}`;

      return Response.redirect(finalCatchupUrl, 302);
    }

    // 5. Determine if it is a Browser
    const acceptHeader = (request.headers.get('accept') || '').toLowerCase();
    const secFetchDest = request.headers.get('sec-fetch-dest');
    const isBrowser = (secFetchDest === 'document') || acceptHeader.includes('text/html');

    // 6. Fetch Core Data
    const fetchJson = async (target) => {
      try {
        const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) return null;
        return await res.json();
      } catch (err) { return null; }
    };
    
    const ts = Date.now();
    const [
      mbCookie,
      slivCookie,
      standardData,
      dictUrlsData,
      catchupData,
      jioStbData,
      customPlaylistData
    ] = await Promise.all([
      getCachedCookie("https://ayushsupercompro.onrender.com/cookies/mb.json", "https://dummy.internal.local/cookie/mb", "__hdnea__="),
      getSonyLivCookie(),
      fetchJson(`https://raw.githubusercontent.com/Ayush8481Lab/Mm/refs/heads/main/Forayush.json?t=${ts}`),
      fetchJson(`https://raw.githubusercontent.com/live4wap/links/refs/heads/main/jiomb?t=${ts}`),
      fetchJson(`https://raw.githubusercontent.com/Ayush8481Lab/Mm/refs/heads/main/AyushCatchup.json?t=${ts}`),
      fetchJson(`https://ayushsup.onrender.com/jiostb.json`),
      fetchJson(`https://raw.githubusercontent.com/Ayush8481pro/NULL/refs/heads/main/playlist/${pathToken}.json?t=${ts}`)
    ]);

    let masterToken = mbCookie || "";
    
    // Parse URL Overrides
    const urlsDict = new Map();
    if (dictUrlsData) {
      const parseUrls = (res, isFailed) => {
        (Array.isArray(res) ? res : []).forEach(item => {
          const id = String(item.channel_id || "");
          const name = String(item.channel_name || "").toLowerCase();
          const fUrl = isFailed ? item.error_details?.final_url : item.result_details?.final_url;
          if (fUrl) { if (id) urlsDict.set(id, fUrl); if (name) urlsDict.set(name, fUrl); }
        });
      };
      parseUrls(dictUrlsData.failed_results, true);
      parseUrls(dictUrlsData.successful_results, false);
    }

    // Parse Catchup Dictionary
    const catchupDict = new Map();
    if (catchupData && Array.isArray(catchupData)) {
        catchupData.forEach(item => {
            if (item.id && item.baseUrl) catchupDict.set(String(item.id), item.baseUrl);
        });
    }

    // Parse JioSTB API Response
    const jioStbDict = new Map();
    if (jioStbData && Array.isArray(jioStbData)) {
        jioStbData.forEach(item => {
            if (item.channel_id && item.url) jioStbDict.set(String(item.channel_id), item.url);
        });
    }

    let rawChannels = [];
    if (standardData && Array.isArray(standardData)) rawChannels.push(...standardData);
   
    let finalChannels = [];
    rawChannels.forEach(c => {
      const cid = String(c.id || c.channel_id || "");
      const cname = String(c.name || "").toLowerCase();
      if (c.stream_url && !c.url) c.url = c.stream_url;
      if (c.key_id && !c.keyId) c.keyId = c.key_id;
      
      // JIO STB Overrides (Only if base domain is jiotvpllive)
      if (c.url && c.url.includes('jiotvpllive.cdn.jio.com')) {
          if (jioStbDict.has(cid)) c.url = jioStbDict.get(cid);
      }

      // External Dictionary URL overrides
      const overrideUrl = urlsDict.get(cid) || urlsDict.get(cname);
      if (overrideUrl) c.url = overrideUrl;
      
      let finalUrl = c.url || "";
      
      // SonyLiv Domain Cookie logic
      if (finalUrl.includes('dishmt.slivcdn.com')) {
          c.isSonyLiv = true;
          if (slivCookie) finalUrl += (finalUrl.includes('?') ? '&' : '?') + slivCookie;
      } 
      // General JioTV Cookie logic (Ensures no duplicate token is appended)
      else if (masterToken && finalUrl.includes('.jio.com') && !finalUrl.includes('st=') && !finalUrl.includes('hdnea')) {
          const cleanToken = masterToken.startsWith('?') ? masterToken.substring(1) : masterToken;
          finalUrl = finalUrl + (finalUrl.includes('?') ? '&' : '?') + cleanToken;
      }
      c.url = finalUrl;

      if (c.url) {
        finalChannels.push({ ...c });
      }
    });

    // 7. Apply Custom Playlist Sorting & Filtering
    if (customPlaylistData && Array.isArray(customPlaylistData) && customPlaylistData.length > 0) {
        const channelMap = new Map();
        finalChannels.forEach(c => channelMap.set(String(c.id || c.channel_id), c));
        
        const sortedChannels = [];
        customPlaylistData.forEach(item => {
            const cid = String(item.Id);
            if (channelMap.has(cid)) {
                const matchedChannel = { ...channelMap.get(cid) };
                if (item.Cat) matchedChannel.category = item.Cat; 
                sortedChannels.push(matchedChannel);
            }
        });
        if (sortedChannels.length > 0) finalChannels = sortedChannels;
    }

    // 8. Generate Final M3U Playlist
    let m3u = `#EXTM3U x-tvg-url="https://epg.ayush848694.workers.dev/${pathToken}"\n\n`;
    
    finalChannels.forEach(c => {
      const name = (c.name || "Unknown Channel").replace(/"/g, '');
      const group = c.category || c.group || c.group_title || "Others";
      
      let extinf = `#EXTINF:-1 tvg-id="${c.id || ''}" tvg-name="${name}" tvg-logo="${c.logo || ''}" group-title="${group}"`;

      // Catchup Parameters Configuration
      if (c.isSonyLiv) {
          // Direct URL construction inside M3U for SonyLiv (NO REDIRECT needed)
          const parts = c.url.split('?');
          const baseUrl = parts[0];
          const queryParams = parts[1] || '';
          
          const catchupBase = baseUrl.replace('master.m3u8', 'master-archive.m3u8');
          const catchupSource = `${catchupBase}?startTime={utc}&endTime={utcend}${queryParams ? '&' + queryParams : ''}`;
          
          extinf += ` catchup="default" catchup-days="8" catchup-source="${catchupSource}"`;
      } else {
          // Standard JioTV uses Worker Redirect to calculate pure UTC strings safely
          const catchupUrl = catchupDict.get(String(c.id));
          if (catchupUrl) {
              const encUrl = encodeURIComponent(catchupUrl);
              const catchupSource = `${workerBase}/catchup.mpd?url=${encUrl}&start={utc}&end={utcend}`;
              extinf += ` catchup="default" catchup-days="8" catchup-source="${catchupSource}"`;
          }
      }
      
      m3u += `${extinf},${name}\n`;

      // ---------------------------------------------------------------
      // Apply DRM configurations (UPDATED: supports multiple formats)
      //   1. c.licenseurl -> Widevine license URL (com.widevine.alpha)
      //   2. c.license    -> ClearKey JWK JSON string (multi-key, preferred)
      //   3. c.keys[]     -> array of "kid:key" strings (multi-key)
      //   4. c.keyId + c.key -> legacy single key "kid:key"
      // ---------------------------------------------------------------
      let licenseKey = "";
      let licenseType = "clearkey";
      let hasLicense = false;

      // Priority 1: Widevine license URL
      if (c.licenseurl && typeof c.licenseurl === "string" && c.licenseurl.trim() !== "" && c.licenseurl !== "null") {
          licenseKey = c.licenseurl.trim();
          licenseType = "com.widevine.alpha";
          hasLicense = true;
      }
      // Priority 2: New "license" field (ClearKey JWK JSON string or comma-separated string)
      else if (c.license && typeof c.license === "string" && c.license.trim() !== "" && c.license !== "null") {
          licenseKey = c.license.trim();
          hasLicense = true;
      }
      // Priority 3: Array of "kid:key" pairs
      else if (Array.isArray(c.keys) && c.keys.length > 0) {
          licenseKey = c.keys.join(",");
          hasLicense = true;
      }
      // Priority 4: Legacy single keyId:key (or comma-separated pair list already present)
      else if (c.keyId && c.key && c.keyId !== "null" && c.key !== "null" && c.keyId !== "" && c.key !== "") {
          licenseKey = `${c.keyId}:${c.key}`;
          hasLicense = true;
      }

      if (hasLicense) {
        if (c.url.includes('.mpd')) m3u += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
        m3u += `#KODIPROP:inputstream.adaptive.license_type=${licenseType}\n`;
        m3u += `#KODIPROP:inputstream.adaptive.license_key=${licenseKey}\n`;
      }

      // Inject strict User-Agent for specific domains
      if (c.url && c.url.includes("liveserverayush2.onrender.com")) {
        m3u += `#EXTVLCOPT:http-user-agent=com.graymatrix.did;Android TV;5.82.6(203230929);Android(10);Xiaomi(Redmi Note 8 Pro)\n`;
      }

      // Restrict direct URL exposure in browsers
      if (isBrowser) {
        const random5Digit = Math.floor(10000 + Math.random() * 90000);
        m3u += `${workerBase}?stream=${random5Digit}\n\n`;
      } else {
        m3u += `${c.url}\n\n`;
      }
    });    

    // 9. Track usage count
    const nextCount = reqCount + 1;
    const nextMidnightIST = new Date(istDateObj);
    nextMidnightIST.setUTCHours(23, 59, 59, 999);
    const secondsToMidnight = Math.floor((nextMidnightIST.getTime() - istDateObj.getTime()) / 1000);
    
    ctx.waitUntil(cache.put(rlRequest, new Response(nextCount.toString(), {
      headers: { "Cache-Control": `max-age=${secondsToMidnight}` }
    })));

    // 10. Return Response
    const responseHeaders = {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": "attachment; filename=\"Ayush@8481.m3u\""
    };
    
    if (isBrowser) {
        responseHeaders["Cache-Control"] = "public, max-age=259200"; // 3 Days
    } else {
        responseHeaders["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
    
    return new Response(m3u, {
      headers: responseHeaders
    });
  }
};
