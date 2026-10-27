// Yeşil Ege — hesap sayfaları (giriş, kayıt, şifre sıfırlama, Hesabım). Bağımlılıksız ES modülü.
// Oturum HttpOnly çerezlerde tutulur; bu betik token görmez. Kullanıcı verisi DOM'a yalnızca textContent ile yazılır.

import { safeReturnPath } from './account-utils.js';
import { api, bindForm, errorText, show } from './api-client.js';

export { api, bindForm, errorText, show };

const params = new URLSearchParams(location.search);

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

// ---------- Hesabım ----------

function initTabs(root) {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const select = (tab, focus = false) => {
        for (const other of tabs) {
            const active = other === tab;
            other.setAttribute('aria-selected', String(active));
            other.tabIndex = active ? 0 : -1;
            document.getElementById(other.getAttribute('aria-controls')).hidden = !active;
        }
        if (focus) tab.focus();
        root.dispatchEvent(new CustomEvent('account:tab', { detail: tab.dataset.tab }));
        history.replaceState(null, '', `${location.pathname}${location.search}#${tab.dataset.tab}`);
    };
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(tab));
        tab.addEventListener('keydown', (event) => {
            const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
            if (!(event.key in moves)) return;
            event.preventDefault();
            select(tabs[(moves[event.key] + tabs.length) % tabs.length], true);
        });
    });
    const names = tabs.map(tab => tab.dataset.tab);
    const initial = names.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'profil';
    const start = tabs.find(tab => tab.dataset.tab === initial);
    if (start) select(start);
}

function redirectToLogin() {
    location.assign(`giris.html?donus=${encodeURIComponent('/hesabim.html' + location.hash)}`);
}

function addressLine(address) {
    return [address.line, address.neighbourhood, `${address.district}/${address.city}`, address.postalCode].filter(Boolean).join(', ');
}

function renderAddresses(page, addresses) {
    const list = page.querySelector('[data-address-list]');
    list.replaceChildren(...addresses.map(address => {
        const item = document.createElement('li');
        item.className = 'address-card';
        const title = document.createElement('h3');
        title.textContent = address.title;
        if (address.isDefault) {
            const badge = document.createElement('span');
            badge.className = 'address-badge';
            badge.textContent = 'Varsayılan';
            title.append(' ', badge);
        }
        const body = document.createElement('p');
        body.textContent = `${address.recipientName} · ${address.phone}`;
        const line = document.createElement('p');
        line.textContent = addressLine(address);
        const actions = document.createElement('div');
        actions.className = 'form-actions';
        for (const [label, action] of [['Düzenle', 'edit'], ['Sil', 'delete']]) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-ghost btn-sm';
            button.textContent = label;
            button.setAttribute('aria-label', `${address.title} adresini ${label.toLowerCase()}`);
            button.dataset.addressAction = action;
            button.dataset.addressId = address.id;
            actions.append(button);
        }
        item.append(title, body, line, actions);
        return item;
    }));
    page.querySelector('[data-address-empty]').hidden = addresses.length > 0;
    page.querySelector('[data-address-new]').hidden = addresses.length >= 10;
}

function initAddresses(page) {
    const form = page.querySelector('[data-account-form="address"]');
    const feedback = page.querySelector('[data-address-feedback]');
    const dialog = document.getElementById('address-delete-dialog');
    let addresses = [];
    let pendingDelete = null;

    const load = async () => {
        const result = await api('account', 'addresses', { method: 'GET' });
        if (result.status === 401) return redirectToLogin();
        if (!result.ok) return show(feedback, errorText(result), 'error');
        addresses = result.data.addresses;
        renderAddresses(page, addresses);
    };

    const openForm = (address = null) => {
        form.reset();
        form.elements.id.value = address?.id || '';
        for (const name of ['title', 'recipientName', 'phone', 'city', 'district', 'neighbourhood', 'line', 'postalCode']) {
            form.elements[name].value = address?.[name] || '';
        }
        form.elements.isDefault.checked = Boolean(address?.isDefault);
        form.querySelector('.form-feedback').textContent = '';
        form.hidden = false;
        form.elements.title.focus();
    };

    page.querySelector('[data-address-new]').addEventListener('click', () => openForm());
    page.querySelector('[data-address-cancel]').addEventListener('click', () => { form.hidden = true; });

    page.querySelector('[data-address-list]').addEventListener('click', (event) => {
        const button = event.target.closest('[data-address-action]');
        if (!button) return;
        const address = addresses.find(item => item.id === button.dataset.addressId);
        if (!address) return;
        if (button.dataset.addressAction === 'edit') return openForm(address);
        pendingDelete = address;
        dialog.querySelector('[data-address-delete-name]').textContent = `${address.title}: ${addressLine(address)}`;
        dialog.showModal();
    });

    dialog.querySelector('[data-address-delete-confirm]').addEventListener('click', async () => {
        dialog.close();
        if (!pendingDelete) return;
        const result = await api('account', 'address-delete', { body: { id: pendingDelete.id } });
        pendingDelete = null;
        show(feedback, result.ok ? 'Adres silindi.' : errorText(result), result.ok ? 'success' : 'error');
        await load();
    });

    bindForm(form, async (data) => {
        const body = Object.fromEntries(['id', 'title', 'recipientName', 'phone', 'city', 'district', 'neighbourhood', 'line', 'postalCode'].map(name => [name, field(data, name)]));
        body.isDefault = data.get('isDefault') === 'on';
        const result = await api('account', 'address-save', { body });
        if (!result.ok) return { ok: false, message: errorText(result) };
        form.hidden = true;
        show(feedback, 'Adres kaydedildi.', 'success');
        await load();
        return null;
    });

    return load;
}

function initDialogs() {
    document.querySelectorAll('[data-open-dialog]').forEach(button => {
        button.addEventListener('click', () => document.getElementById(button.dataset.openDialog).showModal());
    });
    document.querySelectorAll('[data-close-dialog]').forEach(button => {
        button.addEventListener('click', () => button.closest('dialog').close());
    });
}

async function logout(scope) {
    const result = await api('auth', 'logout', { body: { scope } });
    if (!result.ok && scope === 'global') {
        show(document.querySelector('[data-page-notice]'), errorText(result), 'error');
        return;
    }
    location.assign('giris.html');
}

function fillProfile(page, user) {
    const form = page.querySelector('[data-account-form="profile"]');
    form.elements.fullName.value = user.fullName;
    form.elements.phone.value = user.phone || '';
    form.elements.email.value = user.email;
    page.querySelector('[data-consent-toggle]').checked = user.marketingConsent;
    page.querySelector('[data-user-greeting]').textContent = `Merhaba ${user.fullName}.`;
}

async function initAccountPage(page) {
    const me = await api('account', 'me', { method: 'GET' });
    if (me.status === 401) return redirectToLogin();
    const greeting = page.querySelector('[data-user-greeting]');
    if (!me.ok) {
        greeting.textContent = errorText(me);
        return;
    }
    fillProfile(page, me.data.user);
    page.querySelector('[data-account-body]').hidden = false;
    if (params.get('dogrulandi') === '1') {
        show(page.querySelector('[data-page-notice]'), 'E-posta adresiniz doğrulandı. Hoş geldiniz!', 'success');
    }

    initTabs(page);
    initDialogs();
    page.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', () => logout(button.dataset.logout)));

    bindForm(page.querySelector('[data-account-form="profile"]'), async (data) => {
        const result = await api('account', 'update-profile', { body: { fullName: field(data, 'fullName'), phone: field(data, 'phone') } });
        if (!result.ok) return { ok: false, message: errorText(result) };
        greeting.textContent = `Merhaba ${field(data, 'fullName').trim()}.`;
        return { ok: true, message: 'Profiliniz kaydedildi.' };
    });

    const consent = page.querySelector('[data-consent-toggle]');
    consent.addEventListener('change', async () => {
        const feedback = page.querySelector('[data-consent-feedback]');
        consent.disabled = true;
        const result = await api('account', 'consent', { body: { marketing: consent.checked } });
        consent.disabled = false;
        if (!result.ok) consent.checked = !consent.checked;
        show(feedback, result.ok ? 'Tercihiniz kaydedildi.' : errorText(result), result.ok ? 'success' : 'error');
    });

    const passwordForm = page.querySelector('[data-account-form="password"]');
    bindForm(passwordForm, (data) => AUTH_FORMS['new-password'](data, passwordForm));

    bindForm(page.querySelector('[data-account-form="delete-request"]'), async (data) => {
        const result = await api('account', 'delete-request', { body: { password: field(data, 'password') } });
        if (!result.ok) return { ok: false, message: errorText(result) };
        page.querySelector('[data-account-form="delete-request"]').reset();
        return { ok: true, message: result.data.message };
    });

    await initAddresses(page)();
}

initPasswordToggles();
const accountPage = document.querySelector('[data-account-page]');
if (accountPage) initAccountPage(accountPage);
else initAuthPages();
