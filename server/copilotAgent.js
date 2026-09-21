// "Copilot Handoff Agent" — Design Agent'ın (ve isteğe bağlı Analyst
// Agent'ın) çıktısını, GitHub Copilot'un "coding agent" (cloud agent) task
// API'sine gönderir. Bizim kendi Developer Agent'ımızdan (developerAgent.js)
// farkı: kod BURADA üretilmiyor — GitHub'ın kendi, çok daha güçlü modeli
// GitHub'ın kendi bulut ortamında kodu üretip bir PR açıyor. Önizleme/onay
// adımı da GitHub'ın PR review süreciyle karşılanıyor (draft PR).
//
// Gerekli ortam değişkenleri (.env):
//   GITHUB_TOKEN       - "repo" scope'lu bir Personal Access Token
//   GITHUB_REPO_OWNER  - örn. "keskinhakanemre-svg"
//   GITHUB_REPO_NAME   - örn. "HackathonTestEcommerce"
import { fetch } from "undici";
import { AgentError, describeNetworkError, dispatcher } from "./geminiClient.js";

const GITHUB_API_BASE = "https://api.github.com";

function buildPrompt({ design, analystAnalysis }) {
  const lines = [
    'Sen bu repodaki "SimpleShop" React + Vite e-ticaret projesinde çalışan bir yazılım geliştiricisin.',
    "Aşağıdaki tasarım planını gerçek, çalışan React/JS/CSS koduna çevir ve bir PR aç.",
    "",
  ];

  if (analystAnalysis) {
    lines.push("İstek analizi:", analystAnalysis, "");
  }

  lines.push("Tasarım planı:", JSON.stringify(design, null, 2), "");
  lines.push(
    "Kurallar: mevcut proje yapısına ve kod stiline (CSS sınıf adlandırma deseni " +
      '"sayfa__eleman" gibi) sadık kal, yeni bir npm bağımlılığı ekleme, ve ' +
      "değişikliği açıklayan kısa bir PR açıklaması yaz.",
  );

  return lines.join("\n");
}

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;

  const missing = [];
  if (!token) missing.push("GITHUB_TOKEN");
  if (!owner) missing.push("GITHUB_REPO_OWNER");
  if (!repo) missing.push("GITHUB_REPO_NAME");

  if (missing.length > 0) {
    throw new AgentError(
      `.env dosyasında şu değişken(ler) tanımlı değil: ${missing.join(", ")}. ` +
        "GitHub'da oluşturduğun repo bilgilerini ve bir Personal Access Token'ı " +
        "(repo scope'lu) .env'e ekleyip `npm run dev`'i yeniden başlat.",
      500,
    );
  }

  return { token, owner, repo };
}

async function githubRequest(path, { method = "GET", body } = {}) {
  const { token } = getConfig();

  let response;
  try {
    response = await fetch(`${GITHUB_API_BASE}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(dispatcher ? { dispatcher } : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (networkError) {
    const description = describeNetworkError(networkError);
    throw new AgentError(`GitHub API'ye ulaşılamadı: ${description}`, 502);
  }

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // GitHub bazen düz metin/boş dönebilir, JSON olmayan yanıtı olduğu gibi taşıyoruz.
  }

  if (!response.ok) {
    const message = json?.message || text || `HTTP ${response.status}`;
    throw new AgentError(`GitHub API hatası (${response.status}): ${message}`, 502);
  }

  return json;
}

/**
 * Design Agent planını Copilot'un coding agent'ına gönderir, yeni bir
 * "task" başlatır. GitHub bu task'ı arka planda (GitHub Actions üzerinde)
 * işleyip zamanla bir PR açar — bu çağrı ANINDA bir PR döndürmez, sadece
 * task'ı başlatır. Durumu `getCopilotTaskStatus` ile takip edilir.
 */
export async function sendDesignToCopilot({ design, analystAnalysis }) {
  const { owner, repo } = getConfig();
  const prompt = buildPrompt({ design, analystAnalysis });

  const task = await githubRequest(`/agents/repos/${owner}/${repo}/tasks`, {
    method: "POST",
    body: {
      prompt,
      base_ref: "main",
      create_pull_request: true,
    },
  });

  return { task, repoUrl: `https://github.com/${owner}/${repo}` };
}

/**
 * Bir task'ın güncel durumunu sorgular (queued/in_progress/completed/...).
 */
export async function getCopilotTaskStatus(taskId) {
  const { owner, repo } = getConfig();
  if (!taskId) {
    throw new AgentError("taskId gerekli.", 400);
  }

  const task = await githubRequest(`/agents/repos/${owner}/${repo}/tasks/${taskId}`);
  return { task };
}
