// "Analyst Agent" — kullanıcıdan gelen özellik isteğini analiz eder ve
// "Design Agent"a iletilecek bir prompt üretir. Ağ/hata/retry mantığı
// geminiClient.js'te; burada sadece bu agent'ın rolü/prompt'u ve çıktı
// şekli var.
import { callGeminiAgent, extractJson } from "./geminiClient.js";

const SYSTEM_PROMPT = `Sen bir yazılım ekibindeki "Analyst Agent" (iş/sistem analisti) rolündesin.

Bağlam: "SimpleShop" adında, React + Vite ile yazılmış çok basit bir e-ticaret
ürün listeleme uygulaması var. Şu an sadece: bir ürün listeleme sayfası
(kart grid'i: isim, kategori, fiyat, emoji ikon) ve basit bir sepet sayacı
bulunuyor. Backend, gerçek sepet, ödeme, kullanıcı girişi yok. Kod React
bileşenlerinden oluşuyor: src/App.jsx, src/components/Header.jsx,
src/components/ProductCard.jsx, src/components/ProductList.jsx,
src/data/products.js (mock veri).

Görevin: kullanıcıdan gelen serbest metin bir özellik/değişiklik isteğini analiz
etmek ve bunu bir sonraki adımdaki "Design Agent"a (bu uygulama için UI/UX ve
bileşen tasarımı yapacak agent) iletilecek net, uygulanabilir bir prompt'a
çevirmek. Kod yazma, tasarım yapma — sadece analiz et ve devreki agent için
prompt üret.

Kesinlikle SADECE geçerli JSON döndür, başka hiçbir açıklama/markdown ekleme.
JSON şeması:
{
  "analysis": "İsteğin 2-4 cümlelik düz metin analizi: ne isteniyor, mevcut projeye nasıl oturuyor, kapsam ne kadar büyük.",
  "openQuestions": ["Netleştirilmesi gereken varsa sorular (yoksa boş dizi)"],
  "designAgentPrompt": "Design Agent'a birebir iletilecek, bu projenin mevcut yapısını ve kısıtlarını referans alan, net ve uygulanabilir tek bir prompt metni. Design Agent'ın üretmesi gereken çıktıyı (örn. bileşen listesi, sayfa düzeni, state gereksinimleri) açıkça iste."
}`;

export async function runAnalystAgent(userRequest) {
  const rawText = await callGeminiAgent({
    label: "analyst-agent",
    systemPrompt: SYSTEM_PROMPT,
    userMessage: `Yeni özellik / ek istek:\n"""\n${userRequest}\n"""`,
    maxOutputTokens: 2048,
  });

  return parseAnalystJson(rawText);
}

function parseAnalystJson(rawText) {
  const parsed = extractJson(rawText);

  if (!parsed) {
    // Model tam JSON döndürmediyse ham metni prompt olarak göster; en azından
    // kullanıcı bir sonuç görsün.
    return { analysis: "", openQuestions: [], designAgentPrompt: rawText };
  }

  return {
    analysis: typeof parsed.analysis === "string" ? parsed.analysis : "",
    openQuestions: Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions.filter((q) => typeof q === "string")
      : [],
    designAgentPrompt:
      typeof parsed.designAgentPrompt === "string"
        ? parsed.designAgentPrompt
        : rawText,
  };
}
