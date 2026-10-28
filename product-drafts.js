// Yeşil Ege — yönetim panelindeki hazır ürün taslakları. Fotoğraflar sitedeki gerçek görsellerdir;
// fiyat ve stok bilgisi işletme tarafından girilir (taslaklarda bilerek yoktur).

export const DRAFT_CATEGORIES = Object.freeze([
    { slug: 'ic-mekan-bitkileri', name: 'İç Mekan Bitkileri', sortOrder: 0 },
    { slug: 'kaktus-ve-sukulent', name: 'Kaktüs ve Sukulent', sortOrder: 1 },
    { slug: 'dis-mekan-bitkileri', name: 'Dış Mekan Bitkileri', sortOrder: 2 },
    { slug: 'mevsimlik-cicekler', name: 'Mevsimlik Çiçekler', sortOrder: 3 },
    { slug: 'saksilar', name: 'Saksılar', sortOrder: 4 },
    { slug: 'bahce-malzemeleri', name: 'Bahçe Malzemeleri', sortOrder: 5 }
]);

export const PRODUCT_DRAFTS = Object.freeze([
    {
        slug: 'orkide-phalaenopsis', name: 'Orkide (Phalaenopsis)', category: 'ic-mekan-bitkileri', shippable: true,
        image: 'images/orchid_care_blooming.webp',
        summary: 'Uzun süre çiçekte kalan, saksılı salon orkidesi.',
        description: 'Aydınlık ama doğrudan güneş almayan bir köşeyi sever. Kökleri kuruyunca, haftada bir kez saksıyı suya batırarak sulayın.\n\nÇiçek sapı soldukça boğumun hemen üzerinden kesilirse yeniden çiçeklenebilir.'
    },
    {
        slug: 'baris-cicegi-spathiphyllum', name: 'Barış Çiçeği (Spathiphyllum)', category: 'ic-mekan-bitkileri', shippable: true,
        image: 'images/peace_lily_spathiphyllum.webp',
        summary: 'Az ışıkta da yaşayan, beyaz çiçekli kolay bakımlı salon bitkisi.',
        description: 'Yarı gölgeye dayanıklıdır. Toprağın üst kısmı kurudukça sulayın; yaprakları sarktığında su ihtiyacını hemen belli eder.'
    },
    {
        slug: 'pasa-kilici-sansevieria', name: 'Paşa Kılıcı (Sansevieria)', category: 'ic-mekan-bitkileri', shippable: true,
        image: 'images/sansevieria_snake_plant.webp',
        summary: 'Dik yapraklı, susuzluğa dayanıklı iç mekân bitkisi.',
        description: 'Az sulama ister; toprak tamamen kuruduktan sonra sulayın. Düşük ışıkta da büyümeye devam eder.'
    },
    {
        slug: 'deve-tabani-monstera', name: 'Deve Tabanı (Monstera)', category: 'ic-mekan-bitkileri', shippable: true,
        image: 'images/chris-lee-70l1tDAI6rM-unsplash.webp',
        summary: 'Delikli büyük yapraklarıyla salonların gözdesi.',
        description: 'Aydınlık, dolaylı ışık ve nemli ortam sever. Toprağın üst 2-3 cm\'si kuruyunca sulayın.'
    },
    {
        slug: 'sukulent-ve-kaktus-kasesi', name: 'Sukulent ve Kaktüs Kasesi', category: 'kaktus-ve-sukulent', shippable: true,
        image: 'images/cactus_gen.webp',
        summary: 'Farklı sukulent ve kaktüslerle hazırlanmış dekoratif kase.',
        description: 'Bol ışıklı bir pencere önünü sever. Toprak tamamen kuruduğunda az miktarda sulayın.'
    },
    {
        slug: 'siklamen-ve-cuha-cicegi', name: 'Sıklamen ve Çuha Çiçeği', category: 'mevsimlik-cicekler', shippable: true,
        image: 'images/winter_garden_flowers_cyclamen_primula.webp',
        summary: 'Kış aylarında balkon ve bahçeye renk katan mevsimlik çiçekler.',
        description: 'Serin ortamı sever. Saksı altlığında su bırakmadan, toprağı hafif nemli tutun.'
    },
    {
        slug: 'zeytin-fidani', name: 'Zeytin Fidanı', category: 'dis-mekan-bitkileri', shippable: false,
        image: 'images/xeriscape_mediterranean_garden_olive.webp',
        summary: 'Ege bahçelerinin simgesi, güneşli alanlar için zeytin fidanı.',
        description: 'Tam güneş ve iyi drene olan toprak ister. Dikimden sonraki ilk yıl düzenli, sonra seyrek sulama yeterlidir.\n\nBoyutu nedeniyle yalnızca fidanlığımızdan teslim alınabilir.'
    },
    {
        slug: 'bambu-cit-bitkisi', name: 'Bambu Çit Bitkisi', category: 'dis-mekan-bitkileri', shippable: false,
        image: 'images/villa_garden_privacy_hedge_bamboo.webp',
        summary: 'Hızlı büyüyen, doğal mahremiyet sağlayan çit bitkisi.',
        description: 'Yarı gölge ve güneşte yetişir. Yayılmaması için köklerin sınırlandırılması önerilir.\n\nBoyutu nedeniyle yalnızca fidanlığımızdan teslim alınabilir.'
    },
    {
        slug: 'toprak-saksi-seti', name: 'Toprak Saksı Seti', category: 'saksilar', shippable: true,
        image: 'images/pots_gen.webp',
        summary: 'Farklı boyutlarda pişmiş toprak ve sırlı saksılar.',
        description: 'Pişmiş toprak saksılar kökün nefes almasını sağlar. Ölçü ve adet seçenekleri için bize ulaşabilirsiniz.'
    },
    {
        slug: 'bahce-bakim-seti', name: 'Bahçe Bakım Seti', category: 'bahce-malzemeleri', shippable: true,
        image: 'images/garden_supplies.webp',
        summary: 'Dikim ve budama için temel bahçe aletleri.',
        description: 'Küçük bahçe ve balkon bakımında kullanılan el aletlerinden oluşur.'
    }
]);
