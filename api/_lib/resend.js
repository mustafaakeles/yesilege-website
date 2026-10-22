// Resend ile e-posta gönderimi (iletişim ve Bitki Doktoru formları ortak kullanır).

/**
 * @param {{ apiKey: string, to: string, from: string }} config  to: virgülle ayrılmış adres listesi
 * @param {{ subject: string, text: string, html: string, attachments?: { filename: string, content: string }[] }} email
 *        attachments[].content base64 olarak verilir
 */
export async function sendEmail({ apiKey, to, from }, email, replyTo, fetchImpl = fetch) {
    const payload = {
        from,
        to: to.split(',').map(s => s.trim()).filter(Boolean),
        reply_to: replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html
    };
    if (email.attachments?.length) payload.attachments = email.attachments;

    const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Resend HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
}

export const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
