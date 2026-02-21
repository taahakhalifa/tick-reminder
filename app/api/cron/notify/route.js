import webpush from 'web-push';

// Lazy initialization to avoid build-time crashes when env vars aren't set
let redis = null;
function getRedis() {
  if (!redis) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

let vapidConfigured = false;
function ensureVapid() {
  if (!vapidConfigured && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:noreply@example.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
  }
}

const MODES = {
  normal: { deadlineHour: 0, deadlineMin: 0, deadlineStr: '12:00 AM', pages: 2 },
  ramadan: { deadlineHour: 5, deadlineMin: 0, deadlineStr: '5:00 AM', pages: 5 },
};

function getCycleDate(mode) {
  const now = new Date();
  const dh = MODES[mode].deadlineHour;
  if (dh > 0 && now.getHours() < dh) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return y.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

function getMsUntilDeadline(mode) {
  const m = MODES[mode];
  const now = new Date();
  const dl = new Date(now);
  if (m.deadlineHour === 0) {
    dl.setHours(24, 0, 0, 0);
  } else {
    if (now.getHours() < m.deadlineHour) {
      dl.setHours(m.deadlineHour, m.deadlineMin, 0, 0);
    } else {
      dl.setDate(dl.getDate() + 1);
      dl.setHours(m.deadlineHour, m.deadlineMin, 0, 0);
    }
  }
  return dl - now;
}

async function getIshaMinutes() {
  const kv = getRedis();
  try {
    const cached = await kv.get('isha_cache');
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      const today = new Date().toISOString().slice(0, 10);
      if (parsed.date === today) return parsed.minutes;
    }
    const t = new Date();
    const dd = String(t.getDate()).padStart(2, '0');
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    const yyyy = t.getFullYear();
    const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=53.4808&longitude=-2.2426&method=15`;
    const r = await fetch(url);
    const d = await r.json();
    const [h, min] = d.data.timings.Isha.split(':').map(Number);
    const minutes = h * 60 + min;
    await kv.set('isha_cache', JSON.stringify({ date: new Date().toISOString().slice(0, 10), minutes }), { ex: 86400 });
    return minutes;
  } catch {
    return 20 * 60 + 30; // fallback 20:30
  }
}

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  ensureVapid();
  const kv = getRedis();

  try {
    const tickStateRaw = await kv.get('tick_state');
    if (!tickStateRaw) {
      return Response.json({ skipped: true, reason: 'No tick state found' });
    }
    const tickState = typeof tickStateRaw === 'string' ? JSON.parse(tickStateRaw) : tickStateRaw;
    const mode = tickState.mode || 'ramadan';
    const cycleDate = getCycleDate(mode);

    if (tickState.todayDate === cycleDate && tickState.todayTicked) {
      return Response.json({ skipped: true, reason: 'Already ticked today' });
    }

    const ishaMin = await getIshaMinutes();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const m = MODES[mode];
    let nowTotalMin = nowMin;
    if (m.deadlineHour > 0 && nowMin < m.deadlineHour * 60) nowTotalMin = 1440 + nowMin;
    if (nowTotalMin < ishaMin) {
      return Response.json({ skipped: true, reason: 'Before Isha' });
    }

    const msLeft = getMsUntilDeadline(mode);
    const minsLeft = msLeft / 60000;
    const h = Math.floor(minsLeft / 60);
    const rm = Math.floor(minsLeft % 60);
    const timeStr = h > 0 ? `${h}h ${rm}m` : `${Math.floor(minsLeft)} mins`;

    let title, body;
    if (minsLeft <= 15) {
      title = 'TICK NOW!';
      body = `Only ${timeStr} left before ${m.deadlineStr}!`;
    } else if (minsLeft <= 45) {
      title = 'Time running out';
      body = `${timeStr} until ${m.deadlineStr}. Tick now!`;
    } else if (minsLeft <= 90) {
      title = "Don't forget";
      body = `${timeStr} left until ${m.deadlineStr}.`;
    } else {
      title = 'Tick Reminder';
      body = `${timeStr} left. Remember to tick!`;
    }

    const subRaw = await kv.get('push_subscription');
    if (!subRaw) {
      return Response.json({ skipped: true, reason: 'No push subscription' });
    }
    const subscription = typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw;

    await webpush.sendNotification(subscription, JSON.stringify({
      title,
      body,
      tag: 'tick-reminder-' + Date.now(),
    }));

    return Response.json({ sent: true, title, minsLeft: Math.floor(minsLeft) });
  } catch (err) {
    console.error('Cron notify error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
