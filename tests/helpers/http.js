// Testler için Vercel benzeri istek/yanıt nesneleri ve kayıt tutan sahte fetch.

export function mockRes() {
    const res = { statusCode: 200, headers: {}, body: undefined, ended: false };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; res.ended = true; return res; };
    res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; return res; };
    res.getHeader = (key) => res.headers[key.toLowerCase()];
    res.end = () => { res.ended = true; return res; };
    return res;
}

export function makeReq({ method = 'POST', body = {}, headers = {}, query = {} } = {}) {
    return {
        method,
        body,
        query,
        headers: {
            origin: 'https://yesilege.com.tr',
            'content-type': 'application/json',
            ...headers
        },
        socket: { remoteAddress: '203.0.113.7' }
    };
}

/**
 * routes: { 'POST /auth/v1/token': (call) => ({ status, body }) | { status, body } }
 * Anahtar, yolun sorgu dizgisi hariç kısmıyla eşleşir. Tanımsız rota testi düşürür.
 */
export function fakeFetch(routes) {
    const calls = [];
    async function fetchImpl(url, init = {}) {
        const parsed = new URL(url);
        const method = (init.method || 'GET').toUpperCase();
        const call = {
            url: String(url),
            method,
            path: parsed.pathname,
            search: parsed.search,
            headers: Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v])),
            body: init.body ? JSON.parse(init.body) : undefined
        };
        calls.push(call);
        const handler = routes[`${method} ${parsed.pathname}`];
        if (!handler) throw new Error(`fakeFetch: tanımsız rota ${method} ${parsed.pathname}`);
        const result = typeof handler === 'function' ? await handler(call) : handler;
        if (result instanceof Error) throw result;
        const status = result.status ?? 200;
        const text = result.body === undefined ? '' : JSON.stringify(result.body);
        return new Response(text || null, { status, headers: { 'content-type': 'application/json' } });
    }
    fetchImpl.calls = calls;
    return fetchImpl;
}
