// Penghitung pengunjung ScanLook — Vercel Serverless Function + Upstash Redis (REST API).
//
// POST /api/counter  → mencatat kunjungan (sekali per pengunjung per hari) lalu mengembalikan statistik
// GET  /api/counter  → hanya mengembalikan statistik
//
// Privasi: tanpa cookie. Alamat IP tidak disimpan; IP di-hash (SHA-256 + salt + tanggal) hanya untuk
// mencegah hitungan ganda di hari yang sama, dan kunci hash kedaluwarsa otomatis dalam 25 jam.
// Negara diambil dari header x-vercel-ip-country yang disediakan Vercel.
//
// Variabel lingkungan (otomatis dibuat saat Upstash Redis dihubungkan ke proyek Vercel):
//   KV_REST_API_URL / KV_REST_API_TOKEN   atau   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//   COUNTER_SALT (opsional) — string acak untuk hash IP

const crypto = require('crypto');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SALT = process.env.COUNTER_SALT || REDIS_TOKEN || '';
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http/i;

const KEY_TOTAL = 'scanlook:visits:total';
const KEY_COUNTRY = 'scanlook:visits:country';
const keyDay = (day) => `scanlook:visits:day:${day}`;
const keySeen = (hash) => `scanlook:seen:${hash}`;

async function redis(commands) {
  const r = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const out = await r.json();
  return out.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

// Tanggal lokal WIB agar "hari ini" sesuai waktu Indonesia.
function todayJakarta() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Metode tidak didukung' });
  }
  if (!REDIS_URL || !REDIS_TOKEN) return send(res, 503, { error: 'Penyimpanan penghitung belum dikonfigurasi' });

  const day = todayJakarta();
  try {
    if (req.method === 'POST' && !BOT_UA.test(req.headers['user-agent'] || '')) {
      const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
      const rawCountry = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
      const country = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : 'XX';
      if (ip) {
        const hash = crypto.createHash('sha256').update(`${SALT}|${day}|${ip}`).digest('hex').slice(0, 32);
        const [fresh] = await redis([['SET', keySeen(hash), '1', 'NX', 'EX', '90000']]);
        if (fresh === 'OK') {
          await redis([
            ['INCR', KEY_TOTAL],
            ['HINCRBY', KEY_COUNTRY, country, '1'],
            ['INCR', keyDay(day)],
            ['EXPIRE', keyDay(day), '259200'],
          ]);
        }
      }
    }

    const [total, flat, today] = await redis([['GET', KEY_TOTAL], ['HGETALL', KEY_COUNTRY], ['GET', keyDay(day)]]);
    const countries = [];
    for (let i = 0; i + 1 < (flat || []).length; i += 2) countries.push({ code: flat[i], count: Number(flat[i + 1]) || 0 });
    countries.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

    return send(
      res,
      200,
      { total: Number(total) || 0, today: Number(today) || 0, countries, updatedAt: new Date().toISOString() },
      req.method === 'GET' ? 'public, s-maxage=60, stale-while-revalidate=300' : 'no-store',
    );
  } catch (err) {
    console.error('counter error:', err);
    return send(res, 502, { error: 'Gagal membaca penghitung' });
  }
};
