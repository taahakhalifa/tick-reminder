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
    const { subscription } = await request.json();
    if (!subscription || !subscription.endpoint) {
      return Response.json({ error: 'Invalid subscription' }, { status: 400 });
    }
    await getRedis().set('push_subscription', JSON.stringify(subscription));
    return Response.json({ success: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
