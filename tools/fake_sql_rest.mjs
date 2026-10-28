// PostgREST'in bu projede kullanılan alt kümesini PGlite üzerinde çalıştırır (yalnızca yerel geliştirme ve testler).
// Desteklenen: eq / in / is.null filtreleri, select, order, limit; insert/update/delete (return=representation); rpc.

const NAME_RE = /^[a-z_][a-z0-9_]*$/;
const ident = (name) => {
    if (!NAME_RE.test(name)) throw Object.assign(new Error('geçersiz ad'), { status: 400 });
    return `"${name}"`;
};

function whereClause(search, params) {
    const parts = [];
    let select = '*';
    let order = '';
    let limit = '';
    for (const [key, value] of new URLSearchParams(search)) {
        if (key === 'select') select = value === '*' ? '*' : value.split(',').map(ident).join(', ');
        else if (key === 'order') {
            order = ' order by ' + value.split(',').map(part => {
                const [col, dir] = part.split('.');
                return `${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}`;
            }).join(', ');
        } else if (key === 'limit') limit = ` limit ${Math.max(0, Math.trunc(Number(value)) || 0)}`;
        else if (value.startsWith('eq.')) {
            params.push(value.slice(3));
            parts.push(`${ident(key)}::text = $${params.length}`);
        } else if (value.startsWith('in.(')) {
            params.push(value.slice(4, -1).split(',').filter(Boolean));
            parts.push(`${ident(key)}::text = any($${params.length}::text[])`);
        } else if (value === 'is.null') parts.push(`${ident(key)} is null`);
    }
    return { where: parts.length ? ` where ${parts.join(' and ')}` : '', select, order, limit };
}

function pgError(error) {
    if (error.status) return [error.status, { message: error.message }];
    if (error.code === 'P0001') return [400, { code: 'P0001', message: error.message }];
    console.error('[sahte supabase] SQL hatası:', error.code, error.message);
    if (error.code === '23505') return [409, { code: '23505', message: 'duplicate key' }];
    if (error.code === '23503' || error.code === '23514' || error.code === '22P02') return [400, { code: error.code, message: 'invalid' }];
    if (error.code === '42P01') return [404, { code: 'PGRST205' }];
    return [500, { code: error.code || 'XX000', message: 'internal' }];
}

export function createSqlRest(db) {
    const functions = new Map();

    async function signature(name) {
        if (!functions.has(name)) {
            const { rows } = await db.query(`
                select p.proretset, p.proargnames, array(select format_type(t, null) from unnest(p.proargtypes) as t) as types
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname = $1`, [name]);
            functions.set(name, rows[0] || null);
        }
        return functions.get(name);
    }

    async function rest(method, table, url, body) {
        try {
            const params = [];
            const target = `public.${ident(table)}`;
            const { where, select, order, limit } = whereClause(url.search, params);
            const rowJson = (sql) => `with r as (${sql}) select coalesce(json_agg(r), '[]'::json) as rows from r`;
            if (method === 'GET') {
                const { rows } = await db.query(rowJson(`select ${select} from ${target}${where}${order}${limit}`), params);
                return [200, rows[0].rows];
            }
            if (method === 'POST' || method === 'PATCH') {
                const keys = Object.keys(body || {}).map(ident);
                params.push(JSON.stringify(body || {}));
                const source = `json_populate_record(null::${target}, $${params.length}::json)`;
                const sql = method === 'POST'
                    ? `insert into ${target} (${keys.join(', ')}) select ${keys.join(', ')} from ${source} returning *`
                    : `update ${target} set (${keys.join(', ')}) = (select ${keys.join(', ')} from ${source})${where} returning *`;
                const { rows } = await db.query(rowJson(sql), params);
                return [method === 'POST' ? 201 : 200, rows[0].rows];
            }
            if (method === 'DELETE') {
                const { rows } = await db.query(rowJson(`delete from ${target}${where} returning *`), params);
                return [200, rows[0].rows];
            }
            return [405, {}];
        } catch (error) {
            return pgError(error);
        }
    }

    async function rpc(name, args) {
        try {
            const fn = await signature(ident(name).slice(1, -1));
            if (!fn) return [404, { code: 'PGRST202' }];
            const params = [];
            const named = (fn.proargnames || []).slice(0, fn.types.length).map((arg, index) => {
                if (!(arg in (args || {}))) return null;
                const value = args[arg];
                const type = fn.types[index];
                params.push(value === null || value === undefined ? null
                    : type === 'jsonb' ? JSON.stringify(value)
                        : type === 'boolean' ? Boolean(value)
                            : typeof value === 'number' ? value : String(value));
                return `${ident(arg)} => $${params.length}::${fn.types[index]}`;
            }).filter(Boolean).join(', ');
            const call = `public.${ident(name)}(${named})`;
            const sql = fn.proretset
                ? `select coalesce(json_agg(x), '[]'::json) as result from ${call} as x`
                : `select to_json(${call}) as result`;
            const { rows } = await db.query(sql, params);
            return [200, rows[0].result];
        } catch (error) {
            return pgError(error);
        }
    }

    return { rest, rpc };
}
