document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('confirm-subscription');
    const message = document.getElementById('subscription-message');
    const token = new URLSearchParams(window.location.search).get('token');

    // E-posta onay anahtarını tarayıcı geçmişinde ve sonraki yönlendirmelerde tutma.
    window.history.replaceState(null, '', window.location.pathname);

    if (!token || !/^[A-Za-z0-9_-]{32,800}$/.test(token)) {
        message.textContent = 'Onay bağlantısı eksik veya geçersiz. Yeni bir bağlantı talep edin.';
        return;
    }
    button.disabled = false;
    message.textContent = 'Aboneliğinizi tamamlamak için aşağıdaki düğmeye basın.';

    button.addEventListener('click', async () => {
        button.disabled = true;
        message.textContent = 'Aboneliğiniz doğrulanıyor…';
        try {
            const response = await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'confirm', token })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || result.success !== true) {
                message.textContent = result.error || 'Onay tamamlanamadı. Lütfen daha sonra tekrar deneyin.';
                if (response.status >= 500 || response.status === 429) button.disabled = false;
                return;
            }
            message.textContent = 'Bülten aboneliğiniz tamamlandı. Hoş geldiniz!';
            button.hidden = true;
        } catch {
            message.textContent = 'Bağlantı sorunu oluştu. Lütfen yeniden deneyin.';
            button.disabled = false;
        }
    });
});
