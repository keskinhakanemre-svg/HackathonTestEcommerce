// Developer Agent'ın önerdiği dosya değişikliklerini GERÇEK dosya
// sistemine yazan katman. Bilerek `developerAgent.js`'ten ayrı bir dosyada:
// Gemini'nin ürettiği JSON'u parse etmekle, o JSON'u diske yazmak farklı
// güven seviyelerinde işler. Bu dosya, kullanıcı ekranda önizlemeyi görüp
// "Kodu Uygula" dedikten SONRA çağrılır (vite.config.js -> /api/apply-changes).
//
// Güvenlik kuralları (LLM'in ürettiği yol/isim string'ine asla güvenme):
// - Yazılabilecek her yol, proje kökünün SRC_ROOT altında olmak zorunda
//   (path traversal / ".." ile dışarı çıkma engellenir).
// - Sadece .jsx/.js/.css/.json uzantılarına izin verilir — server/,
//   vite.config.js, package.json, .env gibi dosyalara bu yoldan ASLA
//   yazılamaz.
// - Bir istekte en fazla MAX_FILES_PER_APPLY dosya değiştirilebilir.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { PROJECT_ROOT, SRC_ROOT } from "./developerAgent.js";

const ALLOWED_EXTENSIONS = new Set([".jsx", ".js", ".css", ".json"]);
const MAX_FILES_PER_APPLY = 20;

export class ApplyChangesError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function assertSafePath(requestedPath) {
  if (typeof requestedPath !== "string" || !requestedPath.trim()) {
    throw new ApplyChangesError("Geçersiz dosya yolu (boş).");
  }

  // Windows'ta ters slash, proje içindeyse de tutarlı davranmak için
  // her ikisini de kabul edip normalize ediyoruz.
  const normalizedInput = requestedPath.trim().split("\\").join("/");

  if (!normalizedInput.startsWith("src/")) {
    throw new ApplyChangesError(
      `Güvenlik nedeniyle sadece "src/" altına yazılabilir, reddedildi: ${requestedPath}`,
    );
  }

  const absolutePath = resolve(PROJECT_ROOT, normalizedInput);
  const srcRootWithSep = SRC_ROOT.endsWith(sep) ? SRC_ROOT : `${SRC_ROOT}${sep}`;

  if (!absolutePath.startsWith(srcRootWithSep)) {
    throw new ApplyChangesError(
      `Güvenlik nedeniyle proje src/ klasörünün dışına yazılamaz, reddedildi: ${requestedPath}`,
    );
  }

  const ext = extname(absolutePath);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new ApplyChangesError(
      `Desteklenmeyen dosya uzantısı (${ext || "uzantısız"}), reddedildi: ${requestedPath}`,
    );
  }

  return absolutePath;
}

/**
 * @param {{ path: string, content: string }[]} files
 * @returns {{ applied: string[] }}
 */
export function applyFileChanges(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new ApplyChangesError("Uygulanacak dosya listesi boş.");
  }
  if (files.length > MAX_FILES_PER_APPLY) {
    throw new ApplyChangesError(
      `Bir istekte en fazla ${MAX_FILES_PER_APPLY} dosya değiştirilebilir (gelen: ${files.length}).`,
    );
  }

  // Önce TÜM yolları doğrula (hiçbiri yazılmadan) — kısmi/başarısız bir
  // uygulamada bazı dosyaların yazılıp bazılarının reddedilmesi kafa
  // karıştırır; hepsi güvenliyse ancak o zaman yazmaya başlıyoruz.
  const validated = files.map((file) => ({
    absolutePath: assertSafePath(file.path),
    relativePath: file.path.trim().split("\\").join("/"),
    content: typeof file.content === "string" ? file.content : "",
  }));

  const applied = [];
  for (const { absolutePath, relativePath, content } of validated) {
    const dir = dirname(absolutePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(absolutePath, content, "utf-8");
    applied.push(relativePath);
  }

  return { applied };
}
