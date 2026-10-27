// Yeşil Ege — tarayıcı tarafı API istemcisi ve form yardımcıları (hesap, mağaza ve yönetim sayfaları ortak kullanır).
// Oturum HttpOnly çerezlerde tutulur; bu modül token görmez. Sunucudan gelen metin DOM'a yalnızca textContent ile yazılır.

const NETWORK_ERROR = 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
const GENERIC_ERROR = 'Şu anda işleminizi tamamlayamıyoruz, lütfen biraz sonra tekrar deneyin.';

export async function api(endpoint, action, { method = 'POST', body, query = {} } = {}) {
    const search = new URLSearchParams({ action, ...query });
    try {
        const response = await fetch(`/api/${endpoint}?${search}`, {
            method,
            credentials: 'same-origin',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok && data.success === true, status: response.status, data };
    } catch {
        return { ok: false, status: 0, data: { error: NETWORK_ERROR } };
    }
}

export const errorText = (result) => result.data?.error || (result.status === 0 ? NETWORK_ERROR : GENERIC_ERROR);

export function show(feedback, message, state) {
    feedback.textContent = message;
    feedback.dataset.state = state;
}

/** Formu çift gönderime karşı kilitler; submit(values) { ok, message } döndürür. */
export function bindForm(form, submit) {
    const button = form.querySelector('button[type="submit"]');
    const feedback = form.querySelector('.form-feedback');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (button.disabled) return;
        button.disabled = true;
        form.setAttribute('aria-busy', 'true');
        show(feedback, 'İşleniyor…', 'sending');
        try {
            const outcome = await submit(new FormData(form));
            if (outcome?.message) show(feedback, outcome.message, outcome.ok ? 'success' : 'error');
        } finally {
            button.disabled = false;
            form.removeAttribute('aria-busy');
        }
    });
}

const LIRA = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 });

/** Kuruş cinsinden tutarı "₺1.250,00" biçiminde yazar. */
export const formatPrice = (kurus) => LIRA.format((Number(kurus) || 0) / 100);

const DATE = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const formatDate = (value) => (value ? DATE.format(new Date(value)) : '');
export const formatDateTime = (value) => (value ? DATE_TIME.format(new Date(value)) : '');

/** Etiket + metin içeren öğe üretir; metin her zaman textContent ile yazılır. */
export function el(tag, { className, text, attrs = {} } = {}, children = []) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    for (const [key, value] of Object.entries(attrs)) {
        if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) if (child) node.append(child);
    return node;
}

/** Font Awesome ikonu (yalnızca sabit sınıf adlarıyla çağrılır). */
export const icon = (name) => el('i', { className: `fas fa-${name}`, attrs: { 'aria-hidden': 'true' } });

export const isSignedIn = () => /(?:^|;\s*)ye_session=1(?:;|$)/.test(document.cookie);

export function loginUrl(returnPath = location.pathname + location.search + location.hash) {
    return `giris.html?donus=${encodeURIComponent(returnPath)}`;
}
