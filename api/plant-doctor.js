// Vercel Function: Bitki Doktoru gönderimini doğrular ve fotoğraflarla birlikte Resend ile e-posta olarak iletir.
// Gerekli ortam değişkenleri: RESEND_API_KEY, CONTACT_FROM_EMAIL ve PLANT_DOCTOR_TO_EMAIL
// (PLANT_DOCTOR_TO_EMAIL yoksa CONTACT_TO_EMAIL kullanılır).

import { validatePlantSubmission, buildPlantEmail, LIMITS } from './_lib/plant-doctor.js';
import { sendEmail } from './_lib/resend.js';

function readConfig(env) {
    const config = {
        apiKey: env.RESEND_API_KEY,
        to: env.PLANT_DOCTOR_TO_EMAIL || env.CONTACT_TO_EMAIL,
        from: env.CONTACT_FROM_EMAIL
    };
    const names = { apiKey: 'RESEND_API_KEY', to: 'PLANT_DOCTOR_TO_EMAIL/CONTACT_TO_EMAIL', from: 'CONTACT_FROM_EMAIL' };
    const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => names[k]);
    return { config, missing };
}

export function createPlantHandler({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
    return async function handler(req, res) {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Yalnızca POST desteklenir.' });
        }

        const contentLength = Number(req.headers['content-length'] || 0);
        if (contentLength > LIMITS.bodyBytes) {
            return res.status(413).json({ success: false, error: 'Fotoğraflar çok büyük, daha az fotoğrafla deneyin.' });
        }

        const result = validatePlantSubmission(req.body, now());
        if (!result.ok) {
            return res.status(400).json({ success: false, error: result.error });
        }
        if (result.spam) {
            return res.status(200).json({ success: true });
        }

        const { config, missing } = readConfig(env);
        if (missing.length > 0) {
            console.error(`Bitki Doktoru e-postası gönderilemedi, eksik ortam değişkenleri: ${missing.join(', ')}`);
            return res.status(500).json({ success: false, error: 'Gönderiminiz şu anda iletilemiyor.' });
        }

        try {
            await sendEmail(config, buildPlantEmail(result.data), result.data.email, fetchImpl);
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Bitki Doktoru e-postası gönderilemedi:', error);
            return res.status(502).json({ success: false, error: 'Gönderiminiz şu anda iletilemiyor.' });
        }
    };
}

export default createPlantHandler();
