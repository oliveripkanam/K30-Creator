import type { Context, Config } from "@netlify/functions";

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async (req: Request, _context: Context) => {
  const bodyText = await req.text().catch(() => '');
  return respond(200, {
    ok: true,
    route: '/api/ai-decode',
    method: req.method,
    url: req.url,
    note: 'minimal function alive – routing verified',
    received: bodyText?.slice(0, 200)
  });
};

export const config: Config = { path: '/api/ai-decode' };


