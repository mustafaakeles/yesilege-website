// Yeşil Ege — hesap sayfaları (giriş, kayıt, şifre sıfırlama, Hesabım). Bağımlılıksız ES modülü.
// Oturum HttpOnly çerezlerde tutulur; bu betik token görmez. Kullanıcı verisi DOM'a yalnızca textContent ile yazılır.

import { safeReturnPath } from './account-utils.js';

const NETWORK_ERROR = 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
const GENERIC_ERROR = 'Şu anda işleminizi tamamlayamıyoruz, lütfen biraz sonra tekrar deneyin.';
const params = new URLSearchParams(location.search);

export async function api(endpoint, action, { method = 'POST', body } = {}) {
    try {
        const response = await fetch(`/api/${endpoint}?action=${encodeURIComponent(action)}`, {
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

function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach(button => {
        const input = document.getElementById(button.getAttribute('aria-controls'));
        if (!input) return;
        button.addEventListener('click', () => {
            const visible = input.type === 'password';
            input.type = visible ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(visible));
            button.setAttribute('aria-label', visible ? 'Şifreyi gizle' : 'Şifreyi göster');
        });
    });
}

const field = (data, name) => String(data.get(name) ?? '');

const AUTH_FORMS = {
    async login(data) {
        const result = await api('auth', 'login', { body: { email: field(data, 'email'), password: field(data, 'password') } });
        if (!result.ok) return { ok: false, message: errorText(result) };
        location.assign(safeReturnPath(params.get('donus')));
        return { ok: true, message: 'Giriş yapıldı, yönlendiriliyorsunuz…' };
    },
    async register(data, form) {
        const result = await api('auth', 'register', {
            body: {
                fullName: field(data, 'fullName'),
                email: field(data, 'email'),
                password: field(data, 'password'),
                phone: field(data, 'phone'),
                kvkk: data.get('kvkk') === 'on',
                marketing: data.get('marketing') === 'on',
                'bot-field': field(data, 'bot-field')
            }
        });
        if (!result.ok) return { ok: false, message: errorText(result) };
        form.reset();
        return { ok: true, message: result.data.message };
    },
    async resend(data) {
        const result = await api('auth', 'resend', { body: { email: field(data, 'email') } });
        if (!result.ok) return { ok: false, message: errorText(result) };
        return { ok: true, message: 'Bu adres kayıtlı ve henüz doğrulanmamışsa yeni bir doğrulama e-postası gönderdik.' };
    },
    async recover(data) {
        const result = await api('auth', 'recover', { body: { email: field(data, 'email') } });
        if (!result.ok) return { ok: false, message: errorText(result) };
        return { ok: true, message: 'Bu adres kayıtlıysa şifre sıfırlama bağlantısı gönderdik. Gelen kutunuzu kontrol edin.' };
    },
    async 'new-password'(data, form) {
        const password = field(data, 'password');
        if (password !== field(data, 'passwordConfirm')) return { ok: false, message: 'Şifreler birbiriyle eşleşmiyor.' };
        const result = await api('auth', 'update-password', { body: { password } });
        if (!result.ok) return { ok: false, message: errorText(result) };
        form.reset();
        return { ok: true, message: 'Şifreniz güncellendi. Diğer cihazlardaki oturumlarınız kapatıldı.' };
    }
};

function initAuthPages() {
    document.querySelectorAll('form[data-form]').forEach(form => {
        const submit = AUTH_FORMS[form.dataset.form];
        if (submit) bindForm(form, (data) => submit(data, form));
    });

    const notice = document.querySelector('[data-page-notice]');
    if (notice && params.get('hata') === 'baglanti') {
        show(notice, 'Bağlantının süresi dolmuş veya daha önce kullanılmış. Yeni bir bağlantı isteyin.', 'error');
    }

    // Şifre sıfırlama: e-postadaki bağlantı oturumu açıp ?adim=yeni ile buraya döner.
    const step = params.get('adim') === 'yeni' ? 'new-password' : 'recover';
    document.querySelectorAll('[data-reset-step]').forEach(section => {
        section.hidden = section.dataset.resetStep !== step;
    });
}

initPasswordToggles();
initAuthPages();
