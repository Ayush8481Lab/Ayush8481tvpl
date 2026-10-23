// ─── Diagnostic state (module-scope, resets on isolate restart) ───
let schemaReady = false;
let schemaError = null;
let lastInsertOk = null;
let lastInsertError = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathParts = url.pathname.substring(1).split('/');

    let pathToken = "";
    let action = "";

    if (pathParts[0] === 'credit') {
        action = 'credit';
        pathToken = pathParts[1];
    } else {
        pathToken = pathParts[0];
        action = pathParts[1];
    }

    const workerBase = `${url.origin}/${pathToken}`;

    if (!pathToken) {
      return new Response("Token required. Format: /<token> or /credit/<token>", { status: 400 });
    }

    // ============================================================
    // 1. Verify Access Token
    // ============================================================
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
    // 2. BLOCK DATA CENTER PROVIDERS (Amazon / Cloudflare / Google)
    //    Matches on request.cf.asOrganization by keyword — covers
    //    all of their ASNs (13335, 16509, 14618, 15169, 396982,
    //    19527, 8987, 38895, etc.) with one simple check.
    //    Add ?allow=1 to any URL to bypass (for trusted testing).
    // ============================================================
    const BLOCKED_KEYWORDS = ["amazon", "cloudflare", "google"];
    const asOrgRaw = (request.cf?.asOrganization || '').toLowerCase();
    const isBlockedOrg = BLOCKED_KEYWORDS.some(kw => asOrgRaw.includes(kw));
    const allowBypass = url.searchParams.get('allow') === '1';

    if (isBlockedOrg && !allowBypass) {
      return new Response(
        `Access denied. Requests from ${request.cf?.asOrganization || 'data centers'} are not permitted.`,
        {
          status: 403,
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // ============================================================
    // D1 BINDING CHECK + SCHEMA INIT
    // ============================================================
    const hasD1 = !!(env && env.LOGS_DB);
    if (hasD1 && !schemaReady) {
      try {
        await env.LOGS_DB.prepare(
          "CREATE TABLE IF NOT EXISTS logs (" +
          "id INTEGER PRIMARY KEY AUTOINCREMENT," +
          "token TEXT NOT NULL," +
          "date TEXT NOT NULL," +
          "ts TEXT NOT NULL," +
          "ua TEXT," +
          "ip TEXT," +
          "geo TEXT," +
          "action TEXT," +
          "colo TEXT" +
          ")"
        ).run();
        await env.LOGS_DB.prepare(
          "CREATE INDEX IF NOT EXISTS idx_logs_token_date ON logs(token, date)"
        ).run();
        await env.LOGS_DB.prepare(
          "CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date)"
        ).run();
        schemaReady = true;
        schemaError = null;
      } catch (e) {
        schemaError = String(e && e.message ? e.message : e);
      }
    }

    // ============================================================
    // CLIENT DETECTION
    // ============================================================
    const uaRaw = request.headers.get('user-agent') || '';
    const uaLower = uaRaw.toLowerCase();
    const acceptHeader = (request.headers.get('accept') || '').toLowerCase();
    const secFetchDest = request.headers.get('sec-fetch-dest');
    const isPlayerUA = /tivimate|exoplayer|vlc|kodi|iptv|smarters|player|mpv|ffmpeg|lavf|libvlc|miplay|xj/;
    const isBrowser = !isPlayerUA.test(uaLower) && ((secFetchDest === 'document') || acceptHeader.includes('text/html'));
    const forceNoCache = url.searchParams.get('nocache') === '1';
    const isDebug = url.searchParams.get('debug') === '1';

    // ============================================================
    // IST DATE / TIME
    // ============================================================
    const nowMs = Date.now();
    const istDateObj = new Date(nowMs + 19800000);
    const istDateString = istDateObj.toISOString().split('T')[0];

    const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    // ============================================================
    // LOG READ / WRITE
    // ============================================================
    const cacheKey = (token, date) => `https://dummy.internal.local/logs/${token}/${date}`;

    const getLogsForDate = async (token, dateStr) => {
      if (hasD1 && schemaReady) {
        try {
          const res = await env.LOGS_DB.prepare(
            "SELECT ts, ua, ip, geo, action, colo FROM logs WHERE token = ? AND date = ? ORDER BY id DESC LIMIT 1000"
          ).bind(token, dateStr).all();
          return res.results || [];
        } catch (e) {
          return [];
        }
      }
      try {
        const res = await caches.default.match(new Request(cacheKey(token, dateStr)));
        if (res) return (await res.json()).reverse();
      } catch (e) {}
      return [];
    };

    const appendLog = async (token, dateStr, entry) => {
      if (hasD1 && schemaReady) {
        try {
          const cutoff = new Date(Date.now() + 19800000 - 8 * 86400000).toISOString().split('T')[0];
          await env.LOGS_DB.batch([
            env.LOGS_DB.prepare(
              "INSERT INTO logs (token, date, ts, ua, ip, geo, action, colo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            ).bind(token, dateStr, entry.ts, entry.ua, entry.ip, entry.geo, entry.action, entry.colo),
            env.LOGS_DB.prepare("DELETE FROM logs WHERE date < ?").bind(cutoff)
          ]);
          lastInsertOk = Date.now();
          lastInsertError = null;
        } catch (e) {
          lastInsertError = String(e && e.message ? e.message : e);
          if (lastInsertError.toLowerCase().includes('no such table')) {
            schemaReady = false;
          }
        }
        return;
      }
      try {
        const logs = await getLogsForDate(token, dateStr);
        logs.unshift(entry);
        const capped = logs.slice(0, 1000);
        await caches.default.put(
          new Request(cacheKey(token, dateStr)),
          new Response(JSON.stringify(capped.slice().reverse()), {
            headers: { "Cache-Control": `max-age=${8 * 86400}` }
          })
        );
      } catch (e) {}
    };

    // ============================================================
    // IP → "[AS45609 Bharti Airtel Limited, Lucknow, Uttar Pradesh, IN]"
    // ============================================================
    const buildGeoFromCF = (cf) => {
      if (!cf) return '';
      const asn = cf.asn ? `AS${cf.asn}` : '';
      const org = cf.asOrganization || '';
      const asnPart = [asn, org].filter(Boolean).join(' ');
      const parts = [asnPart, cf.city, cf.region, cf.countryCode].filter(Boolean);
      return parts.length ? `[${parts.join(', ')}]` : '';
    };

    const lookupIP = async (ip, cf) => {
      const cfGeo = buildGeoFromCF(cf);
      if (cfGeo) return cfGeo;
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

    // ============================================================
    // LOG THE REQUEST (skip credit page + debug)
    // ============================================================
    if (action !== 'credit' && !isDebug) {
      const xff = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
      const cfIP = request.headers.get('cf-connecting-ip') || '';
      const clientIP = xff || cfIP || request.headers.get('x-real-ip') || 'unknown';

      ctx.waitUntil((async () => {
        const geo = await lookupIP(clientIP, request.cf);
        const istNow = new Date(Date.now() + 19800000);
        const tsStr = istNow.toISOString().replace('T', ' ').substring(0, 19) + ' IST';
        await appendLog(pathToken, istDateString, {
          ts: tsStr,
          ua: uaRaw || 'Unknown',
          ip: clientIP,
          geo: geo,
          action: action || 'playlist',
          colo: request.cf?.colo || '?'
        });
      })());
    }

    // ============================================================
    // --- Helper: generic cached cookie --- (unchanged)
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
    // --- Helper: SonyLiv rotating cookie --- (unchanged)
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

    // ============================================================
    // COUNT (D1 → COUNT(*), cache → stored counter)
    // ============================================================
    const cache = caches.default;
    const rlCacheUrl = new URL(`https://dummy.internal.local/ratelimit/${pathToken}/${istDateString}`);
    const rlRequest = new Request(rlCacheUrl.href);

    let reqCount = 0;
    let countError = null;
    if (hasD1 && schemaReady) {
      try {
        const r = await env.LOGS_DB.prepare(
          "SELECT COUNT(*) as c FROM logs WHERE token = ? AND date = ?"
        ).bind(pathToken, istDateString).first();
        reqCount = r?.c || 0;
      } catch (e) {
        countError = String(e && e.message ? e.message : e);
      }
    } else {
      const cachedLimit = await cache.match(rlRequest);
      if (cachedLimit) reqCount = parseInt(await cachedLimit.text(), 10) || 0;
    }

    // ============================================================
    // DEBUG ENDPOINT — /<token>?debug=1  (or &test=1, &raw=1)
    // ============================================================
    if (isDebug) {
      let testResult = null;
      if (url.searchParams.get('test') === '1' && hasD1 && schemaReady) {
        try {
          await env.LOGS_DB.prepare(
            "INSERT INTO logs (token, date, ts, ua, ip, geo, action, colo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            pathToken, istDateString,
            new Date(Date.now() + 19800000).toISOString().replace('T', ' ').substring(0, 19) + ' IST',
            'TEST-UA', 'TEST-IP', 'TEST-GEO', 'test', request.cf?.colo || '?'
          ).run();
          testResult = { ok: true, message: "Test row inserted. Open /credit/<token> to see it." };
        } catch (e) {
          testResult = { ok: false, error: String(e && e.message ? e.message : e) };
        }
      }

      const todayLogs = await getLogsForDate(pathToken, istDateString);

      let rawCount = null, rawRows = null, rawError = null;
      if (hasD1 && schemaReady) {
        try {
          const cr = await env.LOGS_DB.prepare(
            "SELECT COUNT(*) as c FROM logs WHERE token = ?"
          ).bind(pathToken).first();
          rawCount = cr?.c || 0;
          if (url.searchParams.get('raw') === '1') {
            const rr = await env.LOGS_DB.prepare(
              "SELECT id, date, ts, action, colo FROM logs WHERE token = ? ORDER BY id DESC LIMIT 20"
            ).bind(pathToken).all();
            rawRows = rr.results || [];
          }
        } catch (e) {
          rawError = String(e && e.message ? e.message : e);
        }
      }

      return new Response(JSON.stringify({
        ok: true,
        colo: request.cf?.colo || 'unknown',
        token: pathToken,
        action: action || 'playlist',
        isBrowser,
        ua: uaRaw,
        asOrganization: request.cf?.asOrganization || null,
        asn: request.cf?.asn || null,
        blocked: isBlockedOrg,
        allowBypass,
        hasD1,
        schemaReady,
        schemaError,
        countError,
        lastInsertError,
        lastInsertOk: lastInsertOk ? new Date(lastInsertOk + 19800000).toISOString().replace('T',' ').substring(0,19) + ' IST' : null,
        reqCount,
        todayLogsCount: todayLogs.length,
        todayLast5: todayLogs.slice(0, 5),
        rawD1Count: rawCount,
        rawD1Rows: rawRows,
        rawError,
        testResult,
        logKey: `logs/${pathToken}/${istDateString}`,
        warning: !hasD1
          ? 'D1 NOT BOUND — bind a D1 database as LOGS_DB.'
          : (!schemaReady
              ? 'D1 BOUND but schema not ready. See schemaError.'
              : null),
        hint: hasD1 && schemaReady && todayLogs.length === 0
          ? 'D1 ready but 0 logs today. Hit the PLAYLIST URL /' + pathToken + '?nocache=1 (not /credit), or use ?test=1.'
          : null
      }, null, 2), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" }
      });
    }

    // ============================================================
    // 3. Credit Endpoint — HTML dashboard (last 7 days)
    // ============================================================
    if (action === "credit") {
      if (url.searchParams.get('raw') === '1') {
        return new Response(`${reqCount} / Unlimited`, {
          status: 200,
          headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" }
        });
      }

      const today = new Date(nowMs + 19800000);
      const dates = [];
      for (let i = 0; i < 7; i++) {
        dates.push(new Date(today.getTime() - i * 86400000).toISOString().split('T')[0]);
      }

      let allLogs = [];
      let queryError = null;
      if (hasD1 && schemaReady) {
        try {
          const results = await Promise.all(
            dates.map(d =>
              env.LOGS_DB.prepare(
                "SELECT ts, ua, ip, geo, action, colo FROM logs WHERE token = ? AND date = ? ORDER BY id DESC LIMIT 1000"
              ).bind(pathToken, d).all()
            )
          );
          allLogs = results.map(r => (r && Array.isArray(r.results)) ? r.results : []);
        } catch (e) {
          queryError = String(e && e.message ? e.message : e);
          allLogs = dates.map(() => []);
        }
      } else {
        allLogs = await Promise.all(dates.map(d => getLogsForDate(pathToken, d)));
      }

      const counts = dates.map((d, i) => i === 0 ? Math.max(reqCount, allLogs[0].length) : allLogs[i].length);
      const totalLogs = counts.reduce((a, b) => a + b, 0);
      const generatedAt = new Date(Date.now() + 19800000).toISOString().replace('T', ' ').substring(0, 19) + ' IST';

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
  .ts { color: #79c0ff; } .ua { color: #ffa657; } .ip { color: #7ee787; } .geo { color: #d2a8ff; }
  .action { color: #f778ba; } .colo { color: #6e7681; font-size: 11px; }
  .count { color: #ff7b72; font-weight: 600; }
  code { background: #21262d; padding: 2px 6px; border-radius: 4px; color: #c9d1d9; }
  .empty { color: #6e7681; font-style: italic; }
  .warn { background: #3d1d1d; border: 1px solid #f85149; color: #ff7b72; padding: 14px 16px; border-radius: 8px; margin-bottom: 16px; line-height: 1.6; }
  .info { background: #1d2d3d; border: 1px solid #58a6ff; color: #79c0ff; padding: 14px 16px; border-radius: 8px; margin-bottom: 16px; line-height: 1.6; }
  .ok { color: #7ee787; }
  .badge-ok { background:#1a3a1a; border:1px solid #2ea043; color:#7ee787; padding:2px 8px; border-radius:6px; font-size:12px; }
  .badge-bad { background:#3d1d1d; border:1px solid #f85149; color:#ff7b72; padding:2px 8px; border-radius:6px; font-size:12px; }
  a { color: #58a6ff; }
  .generated { color: #6e7681; font-size: 11px; margin-top: 8px; }
</style>
</head>
<body>
<h1>Usage Logs · <code>${escapeHtml(pathToken)}</code></h1>`;

      if (!hasD1) {
        html += `<div class="warn"><strong>⚠️ D1 NOT BOUND.</strong> Bind a D1 database as <code>LOGS_DB</code> in Pages → Settings → Functions → Bindings.</div>`;
      } else if (!schemaReady) {
        html += `<div class="warn"><strong>⚠️ Schema not ready.</strong> Error: <code>${escapeHtml(schemaError || 'unknown')}</code></div>`;
      } else if (queryError) {
        html += `<div class="warn"><strong>⚠️ D1 query failed on this render.</strong> <code>${escapeHtml(queryError)}</code></div>`;
      } else if (countError) {
        html += `<div class="warn"><strong>⚠️ COUNT(*) failed.</strong> <code>${escapeHtml(countError)}</code></div>`;
      }

      if (hasD1 && schemaReady && totalLogs === 0) {
        html += `<div class="info"><strong>ℹ️ No logs yet.</strong>
          Only requests to <a href="/${escapeHtml(pathToken)}?nocache=1"><code>/${escapeHtml(pathToken)}?nocache=1</code></a> create log rows — visiting <code>/credit/${escapeHtml(pathToken)}</code> does not.<br>
          Visit <a href="/${escapeHtml(pathToken)}?nocache=1">the playlist URL</a> now (cache-busted), then come back here. Or use <a href="/${escapeHtml(pathToken)}?debug=1&test=1">?debug=1&test=1</a> to force a test row.</div>`;
      }

      html += `<div class="summary">
  <div>Backend: ${hasD1 && schemaReady
    ? '<span class="badge-ok">D1 (global) ✓</span>'
    : '<span class="badge-bad">' + (hasD1 ? 'D1 bound, schema not ready' : 'D1 not bound') + '</span>'}</div>
  <div>Rendered from colo: <code>${escapeHtml(request.cf?.colo || '?')}</code></div>
  <div>Today's logged requests: <span class="count">${counts[0]}</span> / Unlimited</div>
  <div>7‑day total logged calls: <span class="count">${totalLogs}</span></div>
  <div style="margin-top:8px;">
    <a href="/${escapeHtml(pathToken)}?nocache=1">Hit playlist (cache-busted)</a> ·
    <a href="?debug=1">Debug JSON</a> ·
    <a href="?debug=1&test=1">Insert test row</a> ·
    <a href="?debug=1&raw=1">Raw D1 rows</a>
  </div>
  <div class="generated">Generated: ${generatedAt} · <a href="">Refresh</a></div>
</div>
<h2>Last 7 Days</h2>`;

      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const logs = allLogs[i] || [];
        html += `<div class="day"><h3>Date - ${date} - <span class="count">${counts[i]} calls</span></h3>`;
        if (logs.length === 0) {
          html += `<div class="entry empty">No calls recorded.</div>`;
        } else {
          logs.forEach(l => {
            html += `<div class="entry">` +
              `<span class="ts">${escapeHtml(l.ts)}</span> · ` +
              `<span class="ua">${escapeHtml(l.ua || 'Unknown')}</span> · ` +
              `<span class="ip">${escapeHtml(l.ip)}</span> ` +
              `<span class="geo">${escapeHtml(l.geo || '')}</span> · ` +
              `<span class="action">${escapeHtml(l.action || 'playlist')}</span> ` +
              `<span class="colo">[${escapeHtml(l.colo || '?')}]</span>` +
              `</div>`;
          });
          if (counts[i] > logs.length) {
            html += `<div class="entry empty">…and ${counts[i] - logs.length} more (display capped at 1000/day)</div>`;
          }
        }
        html += `</div>`;
      }
      html += `</body></html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          "CDN-Cache-Control": "no-store"
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

    // 5. Fetch Core Data
    const fetchJson = async (target) => {
      try {
        const res = await fetch(target, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) return null;
        return await res.json();
      } catch (err) { return null; }
    };

    const ts = Date.now();
    const [
      mbCookie, slivCookie, standardData, dictUrlsData, catchupData, jioStbData, customPlaylistData
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

    // 6. Apply Custom Playlist Sorting & Filtering
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

    // 7. Generate Final M3U Playlist
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

    // 8. Cache count increment (only when D1 not in use)
    if (!(hasD1 && schemaReady)) {
      const nextCount = reqCount + 1;
      const nextMidnightIST = new Date(istDateObj);
      nextMidnightIST.setUTCHours(23, 59, 59, 999);
      const secondsToMidnight = Math.floor((nextMidnightIST.getTime() - istDateObj.getTime()) / 1000);
      ctx.waitUntil(cache.put(rlRequest, new Response(nextCount.toString(), {
        headers: { "Cache-Control": `max-age=${secondsToMidnight}` }
      })));
    }

    // 9. Return Response
    const responseHeaders = {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": "attachment; filename=\"Ayush@8481.m3u\"",
        "Vary": "User-Agent, Accept, Sec-Fetch-Dest"
    };

    if (isBrowser && !forceNoCache) {
        responseHeaders["Cache-Control"] = "public, max-age=259200";
    } else {
        responseHeaders["Cache-Control"] = "private, no-cache, no-store, must-revalidate, max-age=0";
        responseHeaders["Pragma"] = "no-cache";
        responseHeaders["Expires"] = "0";
    }
    responseHeaders["CDN-Cache-Control"] = "no-store";

    return new Response(m3u, { headers: responseHeaders });
  }
};
