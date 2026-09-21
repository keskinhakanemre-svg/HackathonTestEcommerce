// "Developer Agent" — Design Agent'ın ürettiği tasarım planını (ve
// projenin GÜNCEL src/ dosyalarını bağlam olarak) alır, bu planı
// gerçekleştirecek somut dosya değişikliklerini (yeni/güncellenmiş dosya
// içerikleri) üretir.
//
// ÖNEMLİ — GÜVENLİK MODELİ: Bu dosya sadece bir DEĞİŞİKLİK ÖNERİSİ üretir,
// hiçbir dosyaya YAZMAZ. Öneriyi gerçek dosyalara yazmak (fs.writeFileSync)
// vite.config.js'teki "/api/apply-changes" endpoint'inin işi — orada ayrıca
// yol güvenliği (sadece src/ altına, proje dışına çıkamaz) kontrol ediliyor.
// Bu ayrım bilinçli: ücretsiz bir modelin ürettiği kod otomatik uygulanmadan
// önce kullanıcı ekranda görüp onaylayabilsin (Design Agent'ın "tekrar
// çalıştır" butonuna benzer, ama burada onay adımı var).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { callGeminiAgent, extractJson } from "./geminiClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, "..");
export const SRC_ROOT = resolve(PROJECT_ROOT, "src");

// Bağlam olarak Gemini'ye gönderilecek dosya uzantıları. Proje çok küçük
// olduğu için src/ altındaki HER dosyayı gönderiyoruz — Gemini'nin mevcut
// bileşen isimlerini/stil sınıflarını uydurmak zorunda kalmaması,
// projenin gerçek yapısını görmesi için.
const CONTEXT_EXTENSIONS = new Set([".jsx", ".js", ".css", ".json"]);
// node_modules zaten src/ altında olmaz ama yine de bir güvenlik payı için.
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", ".git"]);

const SYSTEM_PROMPT = `Sen bir yazılım ekibindeki "Developer Agent" (frontend geliştirici) rolündesin.

Bağlam: "SimpleShop" adında, React 19 + Vite ile yazılmış çok basit bir
e-ticaret ürün listeleme uygulaması var. Bir önceki adımda "Design Agent"
bir özellik isteği için UI/bileşen tasarım planı üretti; bu plan sana
iletildi. Sana ayrıca projenin src/ klasöründeki TÜM dosyaların GÜNCEL
içeriği veriliyor (bağlam olarak, "### FILE: <yol>" başlıklarıyla
ayrılmış).

Görevin: bu tasarım planını GERÇEK, ÇALIŞAN React/JS/CSS koduna çevirmek.

Kesin kurallar:
- SADECE "src/" klasörü altındaki dosyaları oluştur veya değiştir. server/,
  vite.config.js, package.json gibi dosyalara ASLA dokunma — onlar bu
  agent sisteminin altyapısı, senin görev alanının dışında.
- Mevcut kod stiline (fonksiyon bileşenler, mevcut CSS sınıf adlandırma
  deseni "sayfa-adı__eleman" gibi) sadık kal.
- Yeni bir npm paketi/bağımlılık GEREKTİRECEK kod yazma (örn. react-router,
  bir UI kütüphanesi vb.) — proje bilerek bağımlılıksız/sade tutuluyor.
- Değiştirdiğin her dosya için TAM ve EKSİKSİZ dosya içeriğini ver (yama/diff
  değil) — kısmi bir kod parçası değil, dosyanın baştan sona tüm içeriği.
- Gerçekten değiştirmen gerekmeyen dosyaları listede VERME.

Kesinlikle SADECE geçerli JSON döndür, başka hiçbir açıklama/markdown ekleme.
JSON şeması:
{
  "summary": "Yapılan kod değişikliğinin 1-2 cümlelik özeti",
  "files": [
    {
      "path": "src/... ile başlayan, proje köküne göre dosya yolu (örn. src/components/ProductDetail.jsx)",
      "action": "create veya replace",
      "content": "Dosyanın TAM ve EKSİKSİZ yeni içeriği (string, kaçış karakterli JSON string olarak)"
    }
  ],
  "notes": "Kullanıcının elle yapması gereken bir şey varsa (yoksa boş string)"
}`;

function collectSrcFiles(dir = SRC_ROOT, files = []) {
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;

    const fullPath = resolve(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      collectSrcFiles(fullPath, files);
      continue;
    }

    if (CONTEXT_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

function buildProjectContext() {
  const filePaths = collectSrcFiles();

  return filePaths
    .map((absolutePath) => {
      const relativePath = relative(PROJECT_ROOT, absolutePath).split("\\").join("/");
      const content = readFileSync(absolutePath, "utf-8");
      return `### FILE: ${relativePath}\n${content}`;
    })
    .join("\n\n");
}

export async function runDeveloperAgent({ design, analystAnalysis }) {
  const projectContext = buildProjectContext();

  const designSection = JSON.stringify(design, null, 2);
  const userMessage = [
    analystAnalysis ? `Analyst Agent analizi:\n${analystAnalysis}` : null,
    `Design Agent planı:\n${designSection}`,
    `Projenin güncel src/ dosyaları:\n${projectContext}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const rawText = await callGeminiAgent({
    label: "developer-agent",
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    maxOutputTokens: 6144,
    truncationCap: 16384,
  });

  return parseDeveloperJson(rawText);
}

function parseDeveloperJson(rawText) {
  const parsed = extractJson(rawText);

  if (!parsed) {
    return { summary: rawText, files: [], notes: "", rejectedFiles: [] };
  }

  const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
  const files = [];
  const rejectedFiles = [];

  for (const file of rawFiles) {
    const path = typeof file?.path === "string" ? file.path.trim() : "";
    const content = typeof file?.content === "string" ? file.content : null;
    const action = file?.action === "create" ? "create" : "replace";

    if (!path || content === null) {
      rejectedFiles.push({ path: path || "(bilinmiyor)", reason: "path veya content eksik" });
      continue;
    }

    files.push({ path, action, content });
  }

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    files,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
    rejectedFiles,
  };
}
