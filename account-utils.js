// Hesap sayfalarının DOM kullanmayan saf yardımcıları (Node testlerinden de içe aktarılır).

const DEFAULT_RETURN = 'hesabim.html';

/** Girişten sonra yalnızca site içi göreli yollara dönülür (açık yönlendirme engeli). */
export function safeReturnPath(value) {
    if (typeof value !== 'string') return DEFAULT_RETURN;
    if (!/^\/(?![/\\])[A-Za-z0-9\-._~/?#=&%]*$/.test(value)) return DEFAULT_RETURN;
    return value;
}
