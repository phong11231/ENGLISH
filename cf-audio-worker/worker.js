export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: { ...cors, 'Access-Control-Allow-Methods': 'PUT, GET, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key', 'Access-Control-Max-Age': '86400' }
      });
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1));

    if (request.method === 'GET') {
      if (url.pathname === '/list') {
        const list = await env.BUCKET.list();
        const files = list.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded }));
        return new Response(JSON.stringify(files), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      return new Response('Use public URL', { status: 400, headers: cors });
    }

    const adminKey = request.headers.get('X-Admin-Key');
    if (!adminKey || adminKey !== env.ADMIN_KEY) {
      return new Response('Unauthorized', { status: 401, headers: cors });
    }

    if (request.method === 'PUT' && key) {
      const ct = request.headers.get('Content-Type') || 'audio/mpeg';
      await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: ct } });
      const publicUrl = env.PUBLIC_URL + '/' + encodeURIComponent(key);
      return new Response(JSON.stringify({ url: publicUrl, key }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (request.method === 'DELETE' && key) {
      await env.BUCKET.delete(key);
      return new Response(JSON.stringify({ deleted: key }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    return new Response('Not found', { status: 404, headers: cors });
  }
};
