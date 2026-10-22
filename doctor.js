// Yeşil Ege Peyzaj — Bitki Doktoru formu (bağımlılıksız)
// Fotoğraflar tarayıcıda yeniden çizilip küçültülür: boyut düşer, EXIF (konum dahil) silinir.
// Sonra form JSON olarak /api/plant-doctor'a gönderilir; sunucu fotoğrafları yalnızca e-posta eki olarak iletir.

const MAX_PHOTOS = 3;
const MAX_SIDE = 1600;
// Sunucu sınırları: fotoğraf başına 1,5 MB, toplam gövde 4 MB (api/_lib/plant-doctor.js)
const MAX_PHOTO_BYTES = 1_400_000;
const MAX_BODY_CHARS = 3_900_000;
const GENERIC_ERROR = 'Gönderilemedi. Lütfen tekrar deneyin ya da fotoğrafları WhatsApp\'tan gönderin.';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form[data-doctor-form]');
    if (form) initDoctorForm(form);
});

function initDoctorForm(form) {
    const input = form.querySelector('#pd-photos');
    const dropzone = form.querySelector('.dropzone');
    const previews = form.querySelector('.photo-previews');
    const status = form.querySelector('.doc-status');
    const submit = form.querySelector('button[type="submit"]');
    const success = form.parentElement.querySelector('.doc-success');
    let photos = [];
    let nextId = 1;

    form.elements.started.value = String(Date.now());

    const setStatus = (text, isError = false) => {
        status.textContent = text;
        status.classList.toggle('is-error', isError);
    };

    const render = () => {
        previews.innerHTML = '';
        photos.forEach(photo => {
            const item = document.createElement('li');
            const img = document.createElement('img');
            img.src = photo.dataUrl;
            img.alt = `Yüklenen fotoğraf ${previews.children.length + 1}`;
            const size = document.createElement('span');
            size.className = 'size';
            size.textContent = `${Math.round(photo.bytes / 1024)} KB`;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.dataset.remove = String(photo.id);
            remove.setAttribute('aria-label', `${img.alt} kaldır`);
            remove.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
            item.append(img, size, remove);
            previews.appendChild(item);
        });
        dropzone.classList.toggle('is-full', photos.length >= MAX_PHOTOS);
    };

    const addFiles = async (fileList) => {
        const files = Array.from(fileList).filter(file => file.type.startsWith('image/'));
        if (!files.length) {
            setStatus('Lütfen bir fotoğraf dosyası seçin.', true);
            return;
        }
        const room = MAX_PHOTOS - photos.length;
        if (files.length > room) setStatus(`En fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsiniz; ilk ${room} tanesi alındı.`, true);
        else setStatus('Fotoğraflar hazırlanıyor…');

        for (const file of files.slice(0, room)) {
            try {
                const photo = await compressPhoto(file);
                photos = [...photos, { id: nextId++, ...photo }];
                render();
            } catch (error) {
                console.error('Fotoğraf hazırlanamadı:', error);
                setStatus(`"${file.name}" okunamadı. JPEG ya da PNG bir fotoğraf deneyin.`, true);
                return;
            }
        }
        if (files.length <= room) setStatus('');
        input.closest('.form-group').classList.remove('has-error');
    };

    input.addEventListener('change', () => {
        addFiles(input.files);
        input.value = '';
    });

    ['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        dropzone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-over');
    }));
    dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

    previews.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-remove]');
        if (!button) return;
        photos = photos.filter(photo => String(photo.id) !== button.dataset.remove);
        render();
        input.focus();
    });

    const markError = (field, message) => {
        field.closest('.form-group, .consent')?.classList.add('has-error');
        setStatus(message, true);
        field.focus();
        return false;
    };

    const validate = () => {
        form.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
        const { location, message, name, email, kvkk } = form.elements;
        if (!photos.length) return markError(input, 'En az bir fotoğraf ekleyin.');
        if (!location.value) return markError(location, 'Bitkinin nerede durduğunu seçin.');
        if (!message.value.trim()) return markError(message, 'Sorunu kısaca anlatın.');
        if (!name.value.trim()) return markError(name, 'Adınızı yazın.');
        if (!email.value.trim() || !email.checkValidity()) return markError(email, 'Geçerli bir e-posta adresi yazın.');
        if (!kvkk.checked) return markError(kvkk, 'Devam etmek için KVKK aydınlatma metnini onaylayın.');
        return true;
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validate()) return;

        const data = new FormData(form);
        const body = JSON.stringify({
            ...Object.fromEntries(['form-name', 'started', 'bot-field', 'plant', 'location', 'message', 'name', 'email', 'phone']
                .map(key => [key, String(data.get(key) || '')])),
            symptoms: data.getAll('symptoms'),
            kvkk: data.get('kvkk') ? 'on' : '',
            publish: data.get('publish') ? 'on' : '',
            photos: photos.map(photo => photo.dataUrl)
        });
        if (body.length > MAX_BODY_CHARS) {
            setStatus('Fotoğraflar toplamda çok büyük; birini kaldırıp tekrar deneyin.', true);
            return;
        }

        const originalHTML = submit.innerHTML;
        submit.disabled = true;
        submit.textContent = 'Gönderiliyor…';
        setStatus('');

        try {
            const response = await fetch(form.getAttribute('action'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) {
                // Sunucunun doğrulama mesajı (400/413) kullanıcıya gösterilir, diğerlerinde genel metin
                const known = (response.status === 400 || response.status === 413) && result.error;
                setStatus(known ? result.error : GENERIC_ERROR, true);
                return;
            }
            form.hidden = true;
            success.hidden = false;
            success.focus();
        } catch (error) {
            console.error('Bitki Doktoru gönderimi başarısız:', error);
            setStatus(GENERIC_ERROR, true);
        } finally {
            submit.disabled = false;
            submit.innerHTML = originalHTML;
        }
    });

    success.querySelector('[data-doctor-again]')?.addEventListener('click', () => {
        form.reset();
        photos = [];
        render();
        setStatus('');
        form.elements.started.value = String(Date.now());
        success.hidden = true;
        form.hidden = false;
        form.querySelector('h3')?.scrollIntoView({ block: 'start' });
    });
}

// Fotoğrafı en fazla MAX_SIDE piksele küçültüp JPEG'e çevirir; gerekirse kaliteyi düşürür
async function compressPhoto(file) {
    const source = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    source.close?.();

    for (const quality of [0.82, 0.7, 0.58]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
        if (bytes <= MAX_PHOTO_BYTES) return { dataUrl, bytes };
    }
    throw new Error('Fotoğraf küçültülemedi');
}

// EXIF yönünü uygulayarak görseli çözer
async function loadImage(file) {
    if ('createImageBitmap' in window) {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
            // Bazı tarayıcılar seçeneği desteklemez; aşağıdaki yola düş
        }
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = String(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
