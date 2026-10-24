// HOOKI server: static files + WebSocket matching, WebRTC signaling, text chat.
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const REPORTS_TO_BLOCK = 3;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// WebRTC relay settings. Free STUN always; add a TURN server with environment variables
// TURN_URL, TURN_USER, TURN_PASS so video also works on strict mobile networks.
app.get('/ice', (req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    iceServers.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER, credential: process.env.TURN_PASS });
  }
  res.json(iceServers);
});
app.get('/healthz', (req, res) => res.send('ok'));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Map(); // id -> client
const waiting = new Set(); // clients searching
const reportCount = new Map(); // ip -> count
const blockedIps = new Set();

const clean = (v, max = 40) => String(v || '').slice(0, max);
const publicProfile = (p) => ({ gender: p.gender, city: p.city, vibe: p.vibe });
const send = (c, m) => { if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };

// A want of {} (or empty fields) means "anyone".
function accepts(want, profile) {
  if (want.gender && want.gender !== profile.gender) return false;
  if (want.city && want.city !== profile.city) return false;
  if (want.vibe && want.vibe !== profile.vibe) return false;
  return true;
}
// Video and text-only users can match each other; the chat then runs as text if either side has no video.
const compatible = (a, b) => accepts(a.want, b.profile) && accepts(b.want, a.profile);

function unpair(c, notify = true) {
  const p = c.partner;
  if (p) { p.partner = null; if (notify) send(p, { type: 'partner-left' }); }
  c.partner = null;
}

function pair(a, b) {
  waiting.delete(a); waiting.delete(b);
  unpair(a); unpair(b);
  a.partner = b; b.partner = a;
  const mode = a.mode === 'video' && b.mode === 'video' ? 'video' : 'text';
  send(a, { type: 'matched', initiator: true, mode, peerId: b.id, peer: publicProfile(b.profile) });
  send(b, { type: 'matched', initiator: false, mode, peerId: a.id, peer: publicProfile(a.profile) });
}

function search(c) {
  for (const o of waiting) {
    if (o !== c && compatible(c, o)) { pair(c, o); return; }
  }
  waiting.add(c);
  send(c, { type: 'searching' });
}

wss.on('connection', (ws, req) => {
  // Behind a host's proxy the real visitor address is in x-forwarded-for.
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
  if (blockedIps.has(ip)) { ws.close(4003, 'blocked'); return; }

  const c = { id: crypto.randomBytes(6).toString('hex'), ws, ip, profile: {}, want: {}, mode: 'text', partner: null, stamps: [], ignored: new Set() };
  clients.set(c.id, c);
  send(c, { type: 'hello', id: c.id, online: clients.size });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    switch (m.type) {
      case 'join':
        unpair(c); waiting.delete(c);
        c.profile = { gender: clean(m.profile && m.profile.gender), city: clean(m.profile && m.profile.city), vibe: clean(m.profile && m.profile.vibe) };
        c.want = { gender: clean(m.want && m.want.gender), city: clean(m.want && m.want.city), vibe: clean(m.want && m.want.vibe) };
        c.mode = m.mode === 'video' ? 'video' : 'text';
        search(c);
        break;
      case 'next':
        unpair(c); waiting.delete(c); search(c);
        break;
      case 'stop':
        unpair(c); waiting.delete(c);
        break;
      case 'signal':
        send(c.partner, { type: 'signal', data: m.data });
        break;
      case 'chat': {
        if (!c.partner) return;
        const now = Date.now();
        c.stamps = c.stamps.filter((t) => now - t < 5000);
        if (c.stamps.length >= 5) return; // max 5 messages per 5 seconds
        c.stamps.push(now);
        const text = clean(m.text, 500).trim();
        if (text) send(c.partner, { type: 'chat', text });
        break;
      }
      case 'report': {
        if (!c.partner) return;
        const bad = c.partner;
        const n = (reportCount.get(bad.ip) || 0) + 1;
        reportCount.set(bad.ip, n);
        console.log('REPORT', bad.id, 'count', n, 'reason:', clean(m.reason, 80));
        if (n >= REPORTS_TO_BLOCK) { blockedIps.add(bad.ip); bad.ws.close(4003, 'blocked'); }
        break;
      }
      case 'presence': { // which of these past partners are online?
        const ids = Array.isArray(m.ids) ? m.ids.slice(0, 10) : [];
        const online = {};
        ids.forEach((id) => { online[id] = clients.has(id); });
        send(c, { type: 'presence', online });
        break;
      }
      case 'ask': { // "ask to reconnect" from the Recent list
        const t = clients.get(clean(m.to));
        if (!t || t.ignored.has(c.id)) { send(c, { type: 'ask-failed', to: m.to }); return; }
        send(t, { type: 'ask-from', from: c.id, peer: publicProfile(c.profile) });
        break;
      }
      case 'accept': {
        const t = clients.get(clean(m.to));
        if (!t) { send(c, { type: 'ask-failed', to: m.to }); return; }
        pair(t, c);
        break;
      }
      case 'block':
        c.ignored.add(clean(m.to));
        break;
    }
  });

  ws.on('close', () => {
    unpair(c); waiting.delete(c); clients.delete(c.id);
  });
});

server.listen(PORT, () => console.log('HOOKI running on http://localhost:' + PORT));
