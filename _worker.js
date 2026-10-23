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

    // ============================================================
    // IST DATE / TIME + LOGGING HELPERS
    // ============================================================
    const nowMs = Date.now();
    const istDateObj = new Date(nowMs + 19800000); // UTC -> IST (represented as fake UTC)
    const istDateString = istDateObj.toISOString().split('T')[0];

    const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    // Read logs for a token/date. Prefers KV (global), falls back to Cache API.
    const getLogsForDate = async (token, dateStr) => {
      try {
        if (env && env.LOGS_KV) {
          const v = await env.LOGS_KV.get(`logs/${token}/${dateStr}`);
          return v ? JSON.parse(v) : [];
        }
        const cache = caches.default;
        const res = await cache.match(new Request(`https://dummy.internal.local/logs/${token}/${dateStr}`));
        if (res) return await res.json();
      } catch (e) {}
      return [];
    };

    // Append a log entry (capped at 1000/day to keep storage bounded).
    const appendLog = async (token, dateStr, entry) => {
      const logs = await getLogsForDate(token, dateStr);
      logs.push(entry);
      if (logs.length > 1000) logs.splice(0, logs.length - 1000);
      const body = JSON.stringify(logs);
      try {
        if (env && env.LOGS_KV) {
          await env.LOGS_KV.put(`logs/${token}/${dateStr}`, body, { expirationTtl: 8 * 86400 });
        } else {
          const cache = caches.default;
          await cache.put(
            new Request(`https://dummy.internal.local/logs/${token}/${dateStr}`),
            new Response(body, { headers: { "Cache-Control": `max-age=${8 * 86400}` } })
          );
        }
      } catch (e) {}
    };

    // ------------------------------------------------------------
    // Build "[AS45609 Bharti Airtel Limited, Lucknow, Uttar Pradesh, IN]"
    // straight from Cloudflare's built-in `request.cf` — free, instant,
    // no rate limits, works for IPv6, no external API call.
    // ------------------------------------------------------------
    const buildGeoFromCF = (cf) => {
      if (!cf) return '';
      const asnNum = cf.asn;
      const asn = asnNum ? `AS${asnNum}` : '';
      const org = cf.asOrganization || '';
      const asnPart = [asn, org].filter(Boolean).join(' ');
      const parts = [asnPart, cf.city, cf.region, cf.countryCode].filter(Boolean);
      return parts.length ? `[${parts.join(', ')}]` : '';
    };

    const lookupIP = async (ip, cf) => {
      // 1) Cloudflare built-in geo (production — always populated, IPv4 + IPv6)
      const cfGeo = buildGeoFromCF(cf);
      if (cfGeo) return cfGeo;

      // 2) Fallback for local dev / cf-missing (ip-api.com is IPv6-safe and
      //    returns the full AS string in a single field).
      if (!ip || ip === 'unknown' || ip === '::1' || ip.startsWith('127.') || ip === 'localhost') return '';
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
          `http://ip-api.com/json/${ip}?fields=status,countryCode,regionName,city,as`,
          { signal: controller.signal }
        );
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success') {
            const parts = [data.as, data.city, data.regionName, data.countryCode].filter(Boolean);
            return parts.length ? `[${parts.join(', ')}]` : '';
          }
        }
      } catch (e) {}
      return '';
    };

    // Fire-and-forget logging. Skipped for the credit dashboard itself so
    // that refreshing the page doesn't inflate your usage logs.
    if (action !== 'credit') {
      const clientIP = request.headers.get('cf-connecting-ip')
        || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
      const ua = request.headers.get('user-agent') || 'Unknown';

      ctx.waitUntil((async () => {
        const geo = await lookupIP(clientIP, request.cf);
        const istNow = new Date(Date.now() + 19800000);
        const tsStr = istNow.toISOString().replace('T', ' ').substring(0, 19) + ' IST';
        await appendLog(pathToken, istDateString, {
          ts: tsStr,
          ua: ua,
          ip: clientIP,
          geo: geo
        });
      })());
    }

    // ============================================================
    // --- Helper: generic cached cookie ---
    // ============================================================
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
                  cookieStr = cookieStr.replace(/exp=/g, '~exp=').replace(/acl=/g, '~acl=').replace(/hmac=/g, '~hmac=').replace(/~~/g, '~');
                  cookieStr = cookieStr.replace(/^(hdnea=|__hdnea__=|\?|&)+/, '');
                  cookieStr = prefix + cookieStr;

                  const match = /exp=(\d+)/.exec(cookieStr);
                  if (match && match[1]) {
                      const expTimestamp = parseInt(match[1], 10);
                      const currentSec = Math.floor(Date.now() / 1000);
                      const ttl = (expTimestamp - 3000) - currentSec;
                      
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

    // ============================================================
    // --- Helper: SonyLiv rotating cookie ---
    // ============================================================
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
    const rlCacheUrl = new URL(`https://dummy.internal.local/ratelimit/${pathToken}/${istDateString}`);
    const rlRequest = new Request(rlCacheUrl.href);
    const cache = caches.default;
    let reqCount = 0;
    
    const cachedLimit = await cache.match(rlRequest);
    if (cachedLimit) {
      reqCount = parseInt(await cachedLimit.text(), 10) || 0;
    }

    // ============================================================
    // 3. Credit Endpoint — HTML dashboard with last-7-day logs
    // ============================================================
    if (action === "credit") {

      // Backward-compat: /credit/<token>?raw=1 -> plain text
      if (url.searchParams.get('raw') === '1') {
        return new Response(`${reqCount} / Unlimited`, {
          status: 200,
          headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
        });
      }

      const today = new Date(nowMs + 19800000);
      const dates = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today.getTime() - i * 86400000);
        dates.push(d.toISOString().split('T')[0]);
      }
      const allLogs = await Promise.all(dates.map(d => getLogsForDate(pathToken, d)));

      let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Usage Logs · ${escapeHtml(pathToken)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #0d1117; color: #c9d1d9; padding: 20px; margin: 0; line-height: 1.5; }
  h1 { color: #58a6ff; font-size: 22px; margin: 0 0 16px; }
  h2 { color: #58a6ff; font-size: 18px; margin: 28px 0 12px; }
  h3 { color: #79c0ff; font-size: 15px; margin: 0 0 10px; }
  .summary { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; }
  .summary div { margin: 4px 0; }
  .day { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
  .entry { font-size: 12.5px; padding: 6px 0; border-bottom: 1px solid #21262d; word-break: break-all; }
  .entry:last-child { border-bottom: none; }
  .ts { color: #79c0ff; }
  .ua { color: #ffa657; }
  .ip { color: #7ee787; }
  .geo { color: #d2a8ff; }
  .count { color: #ff7b72; font-weight: 600; }
  code { background: #21262d; padding: 2px 6px; border-radius: 4px; color: #c9d1d9; }
  .empty { color: #6e7681; font-style: italic; }
</style>
</head>
<body>
<h1>Usage Logs · <code>${escapeHtml(pathToken)}</code></h1>
<div class="summary">
  <div>Today's all requests (incl. credit views): <span class="count">${reqCount}</span> / Unlimited</div>
  <div>Today's logged calls (excl. credit views): <span class="count">${(allLogs[0] || []).length}</span></div>
</div>
<h2>Last 7 Days</h2>`;

      let totalLogs = 0;
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const logs = allLogs[i] || [];
        totalLogs += logs.length;
        html += `<div class="day"><h3>Date - ${date} - <span class="count">${logs.length} calls</span></h3>`;
        if (logs.length === 0) {
          html += `<div class="entry empty">No calls recorded.</div>`;
        } else {
          logs.slice().reverse().forEach(l => {
            html += `<div class="entry"><span class="ts">${escapeHtml(l.ts)}</span> · <span class="ua">${escapeHtml(l.ua || 'Unknown')}</span> · <span class="ip">${escapeHtml(l.ip)}</span> <span class="geo">${escapeHtml(l.geo || '')}</span></div>`;
          });
        }
        html += `</div>`;
      }
      html += `<div class="summary" style="margin-top:16px;"><div>7-day total logged calls: <span class="count">${totalLogs}</span></div></div>`;
      html += `</body></html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        }
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
      
      if (endSec > currentSec) endSec = currentSec;
      if (startSec > endSec) startSec = endSec - 3600; 

      let finalCatchupUrl = targetUrl;
      const getUTCString = (utcSeconds) => {
        const d = new Date(utcSeconds * 1000); 
        const pad = (n) => (n < 10 ? '0' + n : n);
        return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
      };
      
      finalCatchupUrl += `?begin=${getUTCString(startSec)}&end=${getUTCString(endSec)}`;

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

    const catchupDict = new Map();
    if (catchupData && Array.isArray(catchupData)) {
        catchupData.forEach(item => {
            if (item.id && item.baseUrl) catchupDict.set(String(item.id), item.baseUrl);
        });
    }

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
      
      if (c.url && c.url.includes('jiotvpllive.cdn.jio.com')) {
          if (jioStbDict.has(cid)) c.url = jioStbDict.get(cid);
      }

      const overrideUrl = urlsDict.get(cid) || urlsDict.get(cname);
      if (overrideUrl) c.url = overrideUrl;
      
      let finalUrl = c.url || "";
      
      if (finalUrl.includes('dishmt.slivcdn.com')) {
          c.isSonyLiv = true;
          if (slivCookie) finalUrl += (finalUrl.includes('?') ? '&' : '?') + slivCookie;
      } 
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

      if (c.isSonyLiv) {
          const parts = c.url.split('?');
          const baseUrl = parts[0];
          const queryParams = parts[1] || '';
          
          const catchupBase = baseUrl.replace('master.m3u8', 'master-archive.m3u8');
          const catchupSource = `${catchupBase}?startTime={utc}&endTime={utcend}${queryParams ? '&' + queryParams : ''}`;
          
          extinf += ` catchup="default" catchup-days="8" catchup-source="${catchupSource}"`;
      } else {
          const catchupUrl = catchupDict.get(String(c.id));
          if (catchupUrl) {
              const encUrl = encodeURIComponent(catchupUrl);
              const catchupSource = `${workerBase}/catchup.mpd?url=${encUrl}&start={utc}&end={utcend}`;
              extinf += ` catchup="default" catchup-days="8" catchup-source="${catchupSource}"`;
          }
      }
      
      m3u += `${extinf},${name}\n`;

      let licenseKey = "";
      let licenseType = "clearkey";
      let hasLicense = false;

      if (c.licenseurl && typeof c.licenseurl === "string" && c.licenseurl.trim() !== "" && c.licenseurl !== "null") {
          licenseKey = c.licenseurl.trim();
          licenseType = "com.widevine.alpha";
          hasLicense = true;
      }
      else if (c.license && typeof c.license === "string" && c.license.trim() !== "" && c.license !== "null") {
          licenseKey = c.license.trim();
          hasLicense = true;
      }
      else if (Array.isArray(c.keys) && c.keys.length > 0) {
          licenseKey = c.keys.join(",");
          hasLicense = true;
      }
      else if (c.keyId && c.key && c.keyId !== "null" && c.key !== "null" && c.keyId !== "" && c.key !== "") {
          licenseKey = `${c.keyId}:${c.key}`;
          hasLicense = true;
      }

      if (hasLicense) {
        if (c.url.includes('.mpd')) m3u += `#KODIPROP:inputstream.adaptive.manifest_type=mpd\n`;
        m3u += `#KODIPROP:inputstream.adaptive.license_type=${licenseType}\n`;
        m3u += `#KODIPROP:inputstream.adaptive.license_key=${licenseKey}\n`;
      }

      if (c.url && c.url.includes("liveserverayush2.onrender.com")) {
        m3u += `#EXTVLCOPT:http-user-agent=com.graymatrix.did;Android TV;5.82.6(203230929);Android(10);Xiaomi(Redmi Note 8 Pro)\n`;
      }

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
        responseHeaders["Cache-Control"] = "public, max-age=259200";
    } else {
        responseHeaders["Cache-Control"] = "no-cache, no-store, must-revalidate";
    }
    
    return new Response(m3u, {
      headers: responseHeaders
    });
  }
};
