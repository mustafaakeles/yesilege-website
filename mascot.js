// Magnolia AI Mascot Logic
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inject Mascot HTML
    const mascotHTML = `
        <div class="magnolia-chat-widget">
            <!-- Window -->
            <div class="magnolia-window" id="magnoliaWindow">
                <div class="magnolia-header">
                    <div class="magnolia-header-avatar">
                        <img src="https://cdn-icons-png.flaticon.com/512/628/628283.png" alt="Magnolia Icon">
                    </div>
                    <div class="magnolia-info">
                        <h4>Magnolia</h4>
                        <p>Bitki Bakım Uzmanı</p>
                    </div>
                    <button class="magnolia-close" id="magnoliaClose"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="magnolia-chat-area" id="magnoliaChat">
                    <div class="message bot">
                        Merhaba! 🌿 Ben Magnolia, Yeşil Ege'nin yapay zeka destekli çiçek uzmanıyım. Bitkilerinizin bakımı, hastalıkları veya seçimleri konusunda size nasıl yardımcı olabilirim?
                    </div>
                </div>

                <div class="magnolia-input-area">
                    <input type="text" id="magnoliaInput" placeholder="Sorunuzu yazın... (örn: Orkide bakımı)">
                    <button class="magnolia-send-btn" id="magnoliaSend"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>

            <!-- Avatar Trigger -->
            <div class="magnolia-avatar" id="magnoliaTrigger">
                <img src="https://cdn-icons-png.flaticon.com/512/628/628283.png" alt="Magnolia">
            </div>
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

    // Toggle Window
    trigger.addEventListener('click', () => {
        windowEl.classList.add('active');
        trigger.style.transform = 'scale(0) rotate(180deg)'; // Hide trigger
        input.focus();
    });

    closeBtn.addEventListener('click', () => {
        windowEl.classList.remove('active');
        trigger.style.transform = 'scale(1) rotate(0deg)'; // Show trigger
    });

    // Close on Click Outside
    document.addEventListener('click', (e) => {
        if (!windowEl.classList.contains('active')) return;

        // If click is NOT inside the widget and NOT on the trigger
        if (!e.target.closest('.magnolia-chat-widget')) {
            windowEl.classList.remove('active');
            trigger.style.transform = 'scale(1) rotate(0deg)';
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

        // Topic Guardrails (Only Plants)
        const forbiddenTopics = ['fiyat', 'kaça', 'satın', 'sipariş', 'adres', 'telefon', 'futbol', 'siyaset', 'hava durumu'];
        if (forbiddenTopics.some(topic => lowerText.includes(topic))) {
            if (lowerText.includes('fiyat') || lowerText.includes('sipariş')) {
                return "Ben sadece bitki bakımı ve sağlığı konularında uzmanım. 🌸 Fiyat bilgisi ve siparişleriniz için lütfen 'İletişim' sayfamızı ziyaret edin veya bizi arayın.";
            }
            return "Üzgünüm, sadece bitkiler, çiçek bakımı ve peyzaj konularında yardımcı olabilirim. Bana orkidenizden veya bahçenizden bahsedin! 🌿";
        }

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
        if (lowerText.includes('böcek') || lowerText.includes('bit')) {
            return "Böcekler can sıkıcıdır. Yaprakların altına baktınız mı? Genelde arap sabunlu su karışımı ile yaprakları silmek doğal ve etkili bir ilk müdahaledir. Sorun devam ederse neem yağı kullanabilirsiniz. 🐞";
        }
        if (lowerText.includes('sarı') || lowerText.includes('sarardı')) {
            return "Yaprak sararması en sık görülen sorundur. Genelde aşırı sulama işaretidir. Eğer yapraklar kuru ve kıtırsa susuzluktan, yumuşak ve sarıysa aşırı sudandır.";
        }

        // Fallback
        return "Çok ilginç bir soru. Bunu uzman peyzaj mimarlarımıza danışmam gerekebilir ancak genel kural olarak: Bitkinizin ışık, su ve toprak dengesini gözden geçirin. Fotoğraf görme şansım olsaydı daha net konuşabilirdim! Başka bir bitki hakkında sorunuz var mı? 🌱";
    }
});
