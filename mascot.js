// Magnolia AI Mascot Logic
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject Mascot HTML
    const mascotHTML = `
        <div class="magnolia-chat-widget">
            <!-- Window -->
            <div class="magnolia-window" id="magnoliaWindow" role="dialog" aria-label="Bitki bakım rehberi" aria-hidden="true" inert>
                <div class="magnolia-header">
                    <div class="magnolia-header-avatar">
                        <img src="/images/magnolia-icon.webp" alt="Magnolia Icon">
                    </div>
                    <div class="magnolia-info">
                        <h4>Magnolia</h4>
                        <p>Otomatik bitki bakım rehberi</p>
                    </div>
                    <button type="button" class="magnolia-close" id="magnoliaClose" aria-label="Rehberi kapat"><i class="fas fa-times" aria-hidden="true"></i></button>
                </div>
                
                <div class="magnolia-chat-area" id="magnoliaChat">
                    <div class="message bot">
                        Merhaba! 🌿 Ben Magnolia. Sık sorulan bitki bakım konularına önceden hazırlanmış bilgilerle yanıt veriyorum. Size nasıl yardımcı olabilirim?
                    </div>
                </div>

                <div class="magnolia-input-area">
                    <input type="text" id="magnoliaInput" maxlength="300" aria-label="Bitki bakımı sorunuz" placeholder="Sorunuzu yazın... (örn: Orkide bakımı)">
                    <button type="button" class="magnolia-send-btn" id="magnoliaSend" aria-label="Soruyu gönder"><i class="fas fa-paper-plane" aria-hidden="true"></i></button>
                </div>
            </div>

            <!-- Avatar Trigger -->
            <button type="button" class="magnolia-avatar" id="magnoliaTrigger" aria-label="Bitki bakım rehberini aç" aria-expanded="false" aria-controls="magnoliaWindow">
                <img src="/images/magnolia-icon.webp" alt="" aria-hidden="true">
            </button>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', mascotHTML);

    // 2. Elements & Logic
    const trigger = document.getElementById('magnoliaTrigger');
    const windowEl = document.getElementById('magnoliaWindow');
    const closeBtn = document.getElementById('magnoliaClose');
    const chatArea = document.getElementById('magnoliaChat');
    const input = document.getElementById('magnoliaInput');
    const sendBtn = document.getElementById('magnoliaSend');

    // Pencere kapalıyken odaklanabilir içerik devreden çıkarılır.
    const setOpen = (open) => {
        windowEl.classList.toggle('active', open);
        windowEl.setAttribute('aria-hidden', String(!open));
        windowEl.inert = !open;
        trigger.setAttribute('aria-expanded', String(open));
        trigger.style.transform = open ? 'scale(0) rotate(180deg)' : 'scale(1) rotate(0deg)';
        if (open) input.focus();
        else trigger.focus();
    };

    trigger.addEventListener('click', () => setOpen(true));
    closeBtn.addEventListener('click', () => setOpen(false));
    document.addEventListener('click', (e) => {
        if (windowEl.classList.contains('active') && !e.target.closest('.magnolia-chat-widget')) {
            setOpen(false);
        }
    });
    document.addEventListener('keydown', (e) => {
        if (!windowEl.classList.contains('active')) return;
        if (e.key === 'Escape') {
            setOpen(false);
            return;
        }
        if (e.key === 'Tab') {
            const controls = [closeBtn, input, sendBtn];
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });

        // Send Message Logic
    function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        // User Message
        appendMessage(text, 'user');
        input.value = '';

        // Show Typing Indicator
        showTyping();

        // AI Response (Simulated)
        setTimeout(() => {
            removeTyping();
            const response = generateResponse(text);
            appendMessage(response, 'bot');
        }, 1500);
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    function appendMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        div.textContent = text;
        chatArea.appendChild(div);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function showTyping() {
        const div = document.createElement('div');
        div.className = 'typing-indicator';
        div.id = 'typing';
        div.innerHTML = '<span></span><span></span><span></span>';
        chatArea.appendChild(div);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function removeTyping() {
        const typing = document.getElementById('typing');
        if (typing) typing.remove();
    }

    // 3. AI Persona / Knowledge Base
    function generateResponse(userText) {
        const lowerText = userText.toLowerCase();

        // Satın alma niyeti taşıyan soruları gerçek iletişim kanalına yönlendir.
        if (['fiyat', 'kaça', 'satın', 'sipariş', 'adres', 'telefon', 'nerede', 'teklif'].some(topic => lowerText.includes(topic))) {
            return "Bitki seçimi, sipariş, fiyat veya teklif için 0535 080 59 51 numarasını arayabilir, WhatsApp'tan yazabilir ya da İletişim sayfamızdaki formu kullanabilirsiniz. 🌿";
        }

        // Diğer konularda önceden hazırlanmış bitki bakım yanıtları kullanılır.
                // Greeting
        if (lowerText.match(/^(merhaba|selam|günaydın|iyi günler)/)) {
            return "Merhaba! Yeşilliklerle dolu güzel bir gün dilerim. Hangi bitkiniz için yardıma ihtiyacınız var?";
        }

        // Specific Plant Knowledge (Basic)
        if (lowerText.includes('orkide')) {
            return "Orkideler narin güzellerdir! 🌸 Doğrudan güneş ışığından hoşlanmazlar, filtrelenmiş ışık severler. Haftada bir kez daldırma yöntemiyle sulamanız ve köklerinin hava almasını sağlamanız en iyisidir. Yapraklarında sararma var mı?";
        }
        if (lowerText.includes('kaktüs') || lowerText.includes('sukulent')) {
            return "Kaktüsler ve sukulentler suyu bünyelerinde tutarlar. Toprak tamamen kurumadan sulamamalısınız (genellikle kışın ayda 1, yazın 2 haftada 1). Çok aydınlık yerleri severler! 🌵";
        }
        if (lowerText.includes('gül')) {
            return "Güller güneşe aşıktır! 🌹 Günde en az 6 saat güneş almalılar. Yaprak bitlerine dikkat edin. Düzenli budama (özellikle kış sonu) bol çiçek için şarttır.";
        }
        if (lowerText.includes('limon') || lowerText.includes('narenciye')) {
            return "Limon ağacınız yaprak döküyorsa genelde yeri değiştiği içindir veya çok sulanmıştır. Demir eksikliği de yaprak sararması yapar. Toprağı nemli kalmalı ama çamur olmamalıdır. 🍋";
        }

        // General Issues
        if (lowerText.includes('soldu') || lowerText.includes('öldü') || lowerText.includes('kurudu')) {
            return "Bunu duyduğuma üzüldüm. 😔 Bitkinin toprağını kontrol ettiniz mi? Çok ıslaksa kök çürümesi, çok kuruysa susuzluk olabilir. Ayrıca yer değişikliği de strese sokmuş olabilir.";
        }
        // "bit" tek kelime olarak aranır; aksi halde "bitki" de eşleşir
        if (lowerText.includes('böcek') || /(^|[^a-zçğıöşü])bit(i|ler|leri|lenmiş)?($|[^a-zçğıöşü])/.test(lowerText)) {
            return "Böcekler can sıkıcıdır. Yaprakların altına baktınız mı? Genelde arap sabunlu su karışımı ile yaprakları silmek doğal ve etkili bir ilk müdahaledir. Sorun devam ederse neem yağı kullanabilirsiniz. 🐞";
        }
        if (lowerText.includes('sarı') || lowerText.includes('sarardı')) {
            return "Yaprak sararması en sık görülen sorundur. Genelde aşırı sulama işaretidir. Eğer yapraklar kuru ve kıtırsa susuzluktan, yumuşak ve sarıysa aşırı sudandır.";
        }

        // Fallback
        return "Çok ilginç bir soru. Bunu uzman peyzaj mimarlarımıza danışmam gerekebilir ancak genel kural olarak: Bitkinizin ışık, su ve toprak dengesini gözden geçirin. Fotoğraf görme şansım olsaydı daha net konuşabilirdim! Başka bir bitki hakkında sorunuz var mı? 🌱";
    }
});
