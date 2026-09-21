# SimpleShop — Ürün Listeleme (devFactoryHackathon)

React + Vite ile yazılmış çok basit bir e-ticaret ürün listeleme uygulaması.
Agentic SDLC çalışması için başlangıç noktası.

## Çalıştırma

```bash
npm install
npm run dev
```

## "Yeni Özellik İste" sayfası (Analyst Agent)

Üstteki menüden **Yeni Özellik İste** sekmesine geçip bir textbox'a proje
için ek bir istek yazabilirsin (örn. "ürün detay sayfası ekle"). Bu istek,
Google Gemini API çağrısıyla çalışan bir **Analyst Agent**'a gönderilir;
agent isteği analiz eder ve bir sonraki adımdaki **Design Agent**'a
iletilecek prompt'u ekrana sonuç olarak basar (henüz otomatik olarak
Design Agent'a gönderilmiyor — bu adım ileride eklenecek).

Bu özellik için **ücretsiz** bir Gemini API key gerekir (kredi kartı
istemez):

1. https://aistudio.google.com/apikey adresine gir, Google hesabınla giriş
   yap, **Create API key**'e bas.
2. `.env.example` dosyasını `.env` olarak kopyala.
3. `.env` içine kendi key'ini yaz: `GEMINI_API_KEY=...`
4. `npm run dev`'i yeniden başlat.

Ücretsiz kotanın hız sınırları var (dakikada/günde belirli istek sayısı);
çok hızlı art arda denersen ekranda "429" / hız sınırı hatası görebilirsin,
birkaç saniye bekleyip tekrar dene.

API çağrısı sadece Vite dev server (Node tarafı, `server/analystAgent.js`)
içinde yapılır; key tarayıcıya hiç gönderilmez. Bu yüzden bu özellik sadece
`npm run dev` ile çalışır, `npm run build` çıktısında (statik dosyalarda)
çalışmaz.
