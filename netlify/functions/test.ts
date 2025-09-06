export default async () => new Response(JSON.stringify({ test: true }), { headers: { 'content-type': 'application/json' } });
