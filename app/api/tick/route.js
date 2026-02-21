let redis = null;
function getRedis() {
  if (!redis) {
    const { Redis } = require('@upstash/redis');
    redis = Redis.fromEnv();
  }
  return redis;
}

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { todayDate, todayTicked, mode } = await request.json();
    await getRedis().set('tick_state', JSON.stringify({
      todayDate,
      todayTicked,
      mode,
      updatedAt: Date.now(),
    }));
    return Response.json({ success: true });
  } catch (err) {
    console.error('Tick error:', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
