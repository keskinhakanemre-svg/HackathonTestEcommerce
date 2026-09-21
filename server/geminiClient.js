// Paylaşılan Gemini çağrı katmanı — Analyst Agent ve Design Agent (ve
// eklenecek diğer agent'lar) bunu kullanır. Sadece Vite dev server (Node)
// içinde çalışır, tarayıcıya asla gönderilmez; GEMINI_API_KEY istemci
// tarafında açığa çıkmaz.
//
// Google AI Studio'nun (Gemini API) ücretsiz kotalı key'i ile çalışır, bu
// yüzden kredi kartı GEREKMEZ. Ücretsiz kotanın hız sınırları vardır; bu
// modül 429/503 gibi geçici hatalarda otomatik tekrar dener.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, ProxyAgent, fetch } from "undici";
// NOT: Node'un global fetch'i KENDİ dahili undici sürümünü kullanır; npm'den
// kurulan undici paketinin Agent/ProxyAgent'ını global fetch'e `dispatcher`
// olarak verirsek sürüm uyuşmazlığından "invalid onRequestStart method" gibi
// tuhaf hatalar çıkabilir. Bu yüzden burada global fetch'i değil, undici
// paketinin KENDİ fetch'ini kullanıyoruz — ikisi de aynı sürümden gelsin.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, "..", ".env");

// dotenv paketi eklemeden basit bir .env okuyucu. process.env'de zaten
// tanımlıysa (örn. terminalden export edilmişse) dosyadaki değeri ezmez.
function loadEnvFile() {
  if (!existsSync(ENV_PATH)) return;

  const content = readFileSync(ENV_PATH, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

// NOT: "gemini-2.5-flash" yeni kullanıcılara kapatıldığı için (Gemini API'nin
// kendi 404 hatası "gemini-3.6-flash" kullanmamızı önerdi, 2026-09-21) model
// güncellendi. Yine "model bulunamadı" hatası alırsanız
// https://ai.google.dev/gemini-api/docs/models adresinden geçerli, ücretsiz
// kotaya dahil bir model id'si bulup aşağıdaki değeri güncelleyin.
const MODEL = "gemini-3.6-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Şirket ağı/VPN arkasındaysanız Node'un fetch'i (undici) sistem proxy
// ayarlarını OTOMATİK okumaz — bu yüzden proxy'yi HTTPS_PROXY / HTTP_PROXY
// env değişkeninden (.env dosyasına da eklenebilir) elle alıp kullanıyoruz.
// Kimlik doğrulamalı proxy ise: HTTPS_PROXY=http://kullanici:sifre@proxyhost:port
const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  null;

// Kurumsal ağlarda güvenlik cihazları (Zscaler, Netskope, Forcepoint, Fortinet
// vb.) veya bir güvenlik duvarı HTTPS trafiğini "araya girip" (SSL/TLS
// inspection) kendi sertifikasıyla yeniden imzalar. Tarayıcılar Windows'un
// sertifika deposunu kullandığı için bunu sorunsuz kabul eder, ama Node
// KENDİ ayrı CA listesini kullanır ve bu şirket sertifikasına güvenmez —
// sonuç: "self-signed certificate in certificate chain" hatası. Çözüm:
// şirketin root sertifikasını dışa aktarıp (certmgr.msc / PowerShell
// Cert:\Root) `.env`'e EXTRA_CA_CERT_PATH ile tanıtmak.
const EXTRA_CA_CERT_PATH = process.env.EXTRA_CA_CERT_PATH
  ? resolve(__dirname, "..", process.env.EXTRA_CA_CERT_PATH)
  : null;

let extraCaCert = null;
if (EXTRA_CA_CERT_PATH) {
  if (existsSync(EXTRA_CA_CERT_PATH)) {
    extraCaCert = readFileSync(EXTRA_CA_CERT_PATH, "utf-8");
  } else {
    console.warn(
      `[gemini-client] EXTRA_CA_CERT_PATH tanımlı ama dosya bulunamadı: ${EXTRA_CA_CERT_PATH}`,
    );
  }
}

function buildDispatcher() {
  const connect = extraCaCert ? { ca: extraCaCert } : undefined;

  if (PROXY_URL) {
    return new ProxyAgent({ uri: PROXY_URL, ...(connect ? { connect } : {}) });
  }
  if (connect) {
    return new Agent({ connect });
  }
  return undefined;
}

const dispatcher = buildDispatcher();

export class AgentError extends Error {
  constructor(message, status = 500, { retryable = false, truncated = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.truncated = truncated;
  }
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

// Gemini bazen geçici olarak yoğun/kullanılamaz durumda olabiliyor (503) veya
// ücretsiz kotanın hız sınırına takılabiliyor (429). Bunlar kalıcı hatalar
// değil — kısa bir bekleyip otomatik tekrar deniyoruz ki kullanıcı elle
// tekrar tekrar denemek zorunda kalmasın.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1200;

// Yanıt maxOutputTokens sınırına çarpıp yarıda kesilirse (finishReason:
// "MAX_TOKENS"), JSON eksik kalır ve parse edilemez — kullanıcıya bozuk/ham
// metin gösterilir. Bunun için: kesilme tespit edilirse otomatik olarak
// TOKEN LİMİTİNİ ARTIRIP tekrar deniyoruz (429/503'teki bekleme retry'sinden
// farklı bir mekanizma). Varsayılan tavan; kod üretimi gibi daha büyük
// çıktı gerektiren agent'lar (örn. Developer Agent) `truncationCap` ile
// bunu kendi ihtiyaçlarına göre yükseltebilir.
const DEFAULT_TRUNCATION_MAX_TOKENS_CAP = 8192;

// undici'nin fetch hataları genelde üstte sadece "fetch failed" der; asıl
// sebep (sertifika hatası, DNS, bağlantı reddi vb.) err.cause içinde
// zincirlenmiş halde durur. Bunu açıp gerçek sebebi yakalıyoruz.
function describeNetworkError(err) {
  const parts = [];
  let current = err;
  let depth = 0;
  while (current && depth < 5) {
    const code = current.code ? `${current.code}` : null;
    const msg = current.message ?? String(current);
    parts.push(code && !msg.includes(code) ? `${code}: ${msg}` : msg);
    current = current.cause;
    depth += 1;
  }
  return parts.join(" → ");
}

/**
 * Bir agent adına Gemini'yi çağırır, JSON formatında yanıt bekler ve ham
 * metni (henüz kendi şemanıza göre parse edilmemiş) döndürür. Şeklini
 * (analysis/openQuestions/... veya components/pageLayout/...) çağıran agent
 * dosyası (analystAgent.js, designAgent.js, ...) kendi belirler.
 *
 * @param {{ label: string, systemPrompt: string, userMessage: string, maxOutputTokens?: number, truncationCap?: number }} opts
 * @returns {Promise<string>} Gemini'nin döndürdüğü ham metin (JSON olması beklenir).
 */
export async function callGeminiAgent({
  label,
  systemPrompt,
  userMessage,
  maxOutputTokens = 1024,
  truncationCap = DEFAULT_TRUNCATION_MAX_TOKENS_CAP,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AgentError(
      "GEMINI_API_KEY tanımlı değil. Proje köküne .env dosyası oluşturup " +
        "GEMINI_API_KEY=... satırını ekleyin (ücretsiz key: " +
        "https://aistudio.google.com/apikey), ardından `npm run dev`'i " +
        "yeniden başlatın (.env.example dosyasına bakabilirsiniz).",
      500,
    );
  }

  let currentMaxTokens = maxOutputTokens;
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await callGeminiOnce({
        apiKey,
        systemPrompt,
        userMessage,
        maxOutputTokens: currentMaxTokens,
      });
    } catch (err) {
      lastError = err;
      const retryable = err instanceof AgentError && err.retryable;
      if (!retryable) throw err; // kalıcı hata: hemen bildir, deneme sayısı eklemeye gerek yok
      if (attempt === MAX_ATTEMPTS) break; // son deneme de başarısız -> döngüden çıkıp aşağıda bildir

      if (err.truncated) {
        currentMaxTokens = Math.min(currentMaxTokens * 2, truncationCap);
        console.warn(
          `[${label}] ${attempt}. deneme yanıtı kesti (MAX_TOKENS) — token limiti ${currentMaxTokens}'e yükseltilip tekrar denenecek.`,
        );
      } else {
        console.warn(
          `[${label}] ${attempt}. deneme başarısız (${err.message}) — tekrar denenecek.`,
        );
      }
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }
  // Tüm denemeler tükendi (retryable hatayla): kullanıcıya kaç deneme yapıldığını da belirt.
  if (lastError instanceof AgentError) {
    throw new AgentError(
      `${lastError.message} (${MAX_ATTEMPTS} deneme yapıldı, hepsi başarısız oldu)`,
      lastError.status,
    );
  }
  throw lastError;
}

async function callGeminiOnce({ apiKey, systemPrompt, userMessage, maxOutputTokens }) {
  let response;
  try {
    response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      ...(dispatcher ? { dispatcher } : {}),
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userMessage }],
          },
        ],
        generationConfig: {
          maxOutputTokens,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (networkError) {
    const description = describeNetworkError(networkError);
    const looksLikeCertIssue =
      /self.signed|self_signed|CERT_CHAIN|UNABLE_TO_VERIFY|CERT_HAS_EXPIRED|DEPTH_ZERO_SELF_SIGNED/i.test(
        description,
      );

    let hint;
    if (looksLikeCertIssue) {
      hint = extraCaCert
        ? ` | EXTRA_CA_CERT_PATH ayarlı (${EXTRA_CA_CERT_PATH}) ama hata sürüyor — doğru kök sertifikayı mı dışa aktardınız kontrol edin.`
        : " | Bu, kurumsal ağın SSL trafiğini incelediğinin (SSL inspection) belirtisi. Şirketin root sertifikasını dışa aktarıp .env'e EXTRA_CA_CERT_PATH=./certs/corporate-root.pem şeklinde ekleyin (sertifikayı o dosyaya koyun).";
    } else if (PROXY_URL) {
      hint = ` | HTTPS_PROXY üzerinden denendi: ${PROXY_URL} — proxy adresi/kimlik bilgisi yanlış olabilir.`;
    } else {
      hint = " | Proxy/CA ayarlı değil.";
    }

    throw new AgentError(`Gemini API'ye ulaşılamadı: ${description}${hint}`, 502);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    const retryable = response.status === 429 || response.status === 503;
    const hint =
      response.status === 429
        ? " (ücretsiz kotanın hız sınırına takılmış olabilirsin)"
        : response.status === 503
          ? " (Gemini sunucuları şu an yoğun/geçici olarak kullanılamıyor)"
          : "";
    throw new AgentError(
      `Gemini API hatası (${response.status})${hint}: ${errorBody}`,
      502,
      { retryable },
    );
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  const finishReason = candidate?.finishReason;

  if (finishReason === "MAX_TOKENS") {
    throw new AgentError(
      "Gemini yanıtı token limitine çarpıp yarıda kesildi.",
      502,
      { retryable: true, truncated: true },
    );
  }

  if (!text) {
    const blockReason = data?.promptFeedback?.blockReason;
    throw new AgentError(
      blockReason
        ? `Gemini isteği reddetti (blockReason: ${blockReason}).`
        : "Gemini API yanıtında metin bulunamadı.",
      502,
    );
  }

  return text;
}

// Model bazen JSON'un etrafına açıklama/markdown ekleyebiliyor; en dıştaki
// {...} bloğunu ayıklayıp parse ediyoruz. Agent dosyaları bunu kullanıp
// kendi alanlarını (analysis, components, ...) güvenli şekilde okur.
export function extractJson(rawText) {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const jsonString = jsonMatch ? jsonMatch[0] : rawText;
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}
