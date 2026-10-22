// Vercel Function: site formlarını doğrular ve Resend ile e-posta olarak iletir.
// Gerekli ortam değişkenleri: RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL

import { validateSubmission, buildEmail } from './_lib/contact.js';

const MAX_BODY_BYTES = 20_000;

function readConfig(env) {
    const config = {
        apiKey: env.RESEND_API_KEY,
        to: env.CONTACT_TO_EMAIL,
        from: env.CONTACT_FROM_EMAIL
    };
    const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
    return { config, missing };
}

export async function sendEmail({ apiKey, to, from }, email, replyTo, fetchImpl = fetch) {
    const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from,
            to: to.split(',').map(s => s.trim()).filter(Boolean),
            reply_to: replyTo,
            subject: email.subject,
            text: email.text,
            html: email.html
        })
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Resend HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
}

export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
    return async function handler(req, res) {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Yalnızca POST desteklenir.' });
        }

        const contentLength = Number(req.headers['content-length'] || 0);
        if (contentLength > MAX_BODY_BYTES) {
            return res.status(413).json({ success: false, error: 'İstek çok büyük.' });
        }

        const result = validateSubmission(req.body);
        if (!result.ok) {
            return res.status(400).json({ success: false, error: result.error });
        }
        if (result.spam) {
            return res.status(200).json({ success: true });
        }

        const { config, missing } = readConfig(env);
        if (missing.length > 0) {
            console.error(`Form e-postası gönderilemedi, eksik ortam değişkenleri: ${missing.join(', ')}`);
            return res.status(500).json({ success: false, error: 'Mesaj şu anda iletilemiyor.' });
        }

        try {
            await sendEmail(config, buildEmail(result.data), result.data.email, fetchImpl);
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Form e-postası gönderilemedi:', error);
            return res.status(502).json({ success: false, error: 'Mesaj şu anda iletilemiyor.' });
        }
    };
}

export default createHandler();
