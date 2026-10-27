// Serverless örnekleri arasında paylaşılan oran sınırı (Postgres rate_limit_hit fonksiyonu).

import { createHash } from 'node:crypto';

// [en fazla istek, pencere saniyesi]
export const LIMITS = Object.freeze({
    registerIp: [5, 600],
    loginIp: [10, 600],
    loginEmail: [5, 900],
    recoverIp: [5, 900],
    recoverEmail: [3, 3600]
});

// E-posta ve IP gibi kimlikler tabloya ham olarak yazılmaz.
export function limitKey(kind, value) {
    return `${kind}:${createHash('sha256').update(String(value)).digest('hex')}`;
}

/** true: istek izinli. */
export async function hitLimit(supabase, key, max, windowSeconds) {
    const allowed = await supabase.db.rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    return allowed === true;
}
