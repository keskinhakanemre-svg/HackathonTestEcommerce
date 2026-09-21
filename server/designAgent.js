// "Design Agent" — Analyst Agent'ın ürettiği prompt'u alır, bu React
// uygulaması için bir UI/bileşen tasarım planı üretir. Ağ/hata/retry
// mantığı geminiClient.js'te; burada sadece bu agent'ın rolü/prompt'u ve
// çıktı şekli var.
import { callGeminiAgent, extractJson } from "./geminiClient.js";

const SYSTEM_PROMPT = `Sen bir yazılım ekibindeki "Design Agent" (UI/UX ve bileşen tasarımcısı) rolündesin.

Bağlam: "SimpleShop" adında, React + Vite ile yazılmış çok basit bir e-ticaret
ürün listeleme uygulaması var. Mevcut bileşenler: src/App.jsx,
src/components/Header.jsx, src/components/ProductCard.jsx,
src/components/ProductList.jsx, src/data/products.js (mock veri). Stil
sade CSS (App.css) ile yapılıyor, herhangi bir UI kütüphanesi yok.

Bir önceki adımda "Analyst Agent" bir özellik isteğini analiz etti ve sana
(Design Agent'a) net bir prompt iletti. Görevin: bu prompt'u okuyup, bu
React uygulamasına somut, uygulanabilir bir UI/bileşen tasarım planı
üretmek. Kod YAZMA — sadece plan üret; bir sonraki adımda bir "Developer
Agent" bu planı kodlayacak.

Kesinlikle SADECE geçerli JSON döndür, başka hiçbir açıklama/markdown ekleme.
JSON şeması:
{
  "summary": "Tasarımın 1-2 cümlelik özeti",
  "components": ["Eklenecek/değişecek her bileşen için 'BileşenAdı — ne işe yarar' formatında bir madde"],
  "pageLayout": "Sayfa/ekran düzeninin düz metin açıklaması (nereye ne yerleşecek)",
  "stateNotes": "Gereken state/veri akışı (örn. hangi state nerede tutulacak, prop olarak nasıl geçecek)",
  "openQuestions": ["Netleştirilmesi gereken varsa sorular (yoksa boş dizi)"]
}`;

export async function runDesignAgent(designAgentPrompt) {
  const rawText = await callGeminiAgent({
    label: "design-agent",
    systemPrompt: SYSTEM_PROMPT,
    userMessage: designAgentPrompt,
    maxOutputTokens: 3072,
  });

  return parseDesignJson(rawText);
}

function parseDesignJson(rawText) {
  const parsed = extractJson(rawText);

  if (!parsed) {
    // Model tam JSON döndürmediyse ham metni özet olarak göster; en azından
    // kullanıcı bir sonuç görsün.
    return {
      summary: rawText,
      components: [],
      pageLayout: "",
      stateNotes: "",
      openQuestions: [],
    };
  }

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    components: Array.isArray(parsed.components)
      ? parsed.components.filter((c) => typeof c === "string")
      : [],
    pageLayout: typeof parsed.pageLayout === "string" ? parsed.pageLayout : "",
    stateNotes: typeof parsed.stateNotes === "string" ? parsed.stateNotes : "",
    openQuestions: Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions.filter((q) => typeof q === "string")
      : [],
  };
}
