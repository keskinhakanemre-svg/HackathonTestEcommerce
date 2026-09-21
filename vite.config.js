import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { runAnalystAgent } from "./server/analystAgent.js";
import { runDesignAgent } from "./server/designAgent.js";
import { runDeveloperAgent } from "./server/developerAgent.js";
import { AgentError } from "./server/geminiClient.js";
import { applyFileChanges, ApplyChangesError } from "./server/applyChanges.js";
import { sendDesignToCopilot, getCopilotTaskStatus } from "./server/copilotAgent.js";

// Dev server'a agent zincirinin API endpoint'lerini ekleyen küçük bir Vite
// eklentisi. Sadece `npm run dev` sırasında çalışır; production build'e
// (vite build) dahil olmaz, çünkü configureServer sadece dev server'da
// tetiklenir.
//
// Akış: "/api/analyze" → Analyst Agent isteği analiz eder → ürettiği
// prompt otomatik olarak Design Agent'a iletilir → her iki agent'ın
// çıktısı birlikte döner. Design Agent başarısız olursa Analyst'in
// sonucu kaybolmaz — designError ile birlikte döner, FE ikisini de ayrı
// ayrı gösterebilir.
//
// "/api/design" → SADECE Design Agent'ı, verilen designAgentPrompt ile
// tekrar çalıştırır (Analyst'i tekrar çağırmadan). Bu, Design Agent ilk
// denemede hata verdiğinde veya kullanıcı sonucunu beğenmediğinde tüm
// isteği baştan atmak zorunda kalmaması için var — FE'de "Design Agent'ı
// Tekrar Çalıştır" butonu bunu çağırıyor.
//
// "/api/develop" → Design Agent'ın planını Developer Agent'a iletir;
// Developer Agent bir dosya değişikliği ÖNERİSİ üretir (henüz hiçbir
// dosyaya yazmaz — sadece öneri döner, kullanıcı ekranda görüp onaylasın).
//
// "/api/apply-changes" → Kullanıcı önizlemeyi onayladıktan SONRA çağrılır;
// önerilen dosya içeriklerini GERÇEKTEN diske yazar. Yol güvenliği
// (sadece src/ altına, proje dışına çıkamaz) applyChanges.js'te kontrol
// edilir.
//
// "/api/send-to-copilot" → Design Agent'ın planını, kod ÜRETMEDEN,
// doğrudan GitHub Copilot'un coding agent task API'sine gönderir. Kod
// GitHub'ın kendi bulut ortamında üretiliyor, önizleme/onay adımını da
// GitHub'ın PR review süreci (draft PR) sağlıyor.
//
// "/api/copilot-task-status" → Gönderilen bir task'ın (queued/in_progress/
// completed/...) güncel durumunu sorgular.
function analystAgentApiPlugin() {
  return {
    name: "analyst-agent-api",
    configureServer(server) {
      server.middlewares.use("/api/analyze", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        try {
          const body = await readJsonBody(req);
          const userRequest = (body?.request ?? "").toString().trim();

          if (!userRequest) {
            sendJson(res, 400, { error: "İstek metni boş olamaz." });
            return;
          }

          const analyst = await runAnalystAgent(userRequest);

          let design = null;
          let designError = null;
          try {
            design = await runDesignAgent(analyst.designAgentPrompt);
          } catch (err) {
            designError = err?.message ?? "Design Agent çalıştırılırken beklenmeyen bir hata oluştu.";
          }

          sendJson(res, 200, { analyst, design, designError });
        } catch (error) {
          const status = error instanceof AgentError ? error.status : 500;
          sendJson(res, status, {
            error: error?.message ?? "Beklenmeyen bir hata oluştu.",
          });
        }
      });

      server.middlewares.use("/api/design", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        try {
          const body = await readJsonBody(req);
          const designAgentPrompt = (body?.designAgentPrompt ?? "").toString().trim();

          if (!designAgentPrompt) {
            sendJson(res, 400, { error: "designAgentPrompt boş olamaz." });
            return;
          }

          const design = await runDesignAgent(designAgentPrompt);
          sendJson(res, 200, { design });
        } catch (error) {
          const status = error instanceof AgentError ? error.status : 500;
          sendJson(res, status, {
            error: error?.message ?? "Beklenmeyen bir hata oluştu.",
          });
        }
      });

      server.middlewares.use("/api/develop", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        try {
          const body = await readJsonBody(req);
          const design = body?.design;
          const analystAnalysis =
            typeof body?.analystAnalysis === "string" ? body.analystAnalysis : undefined;

          if (!design || typeof design !== "object") {
            sendJson(res, 400, { error: "design (Design Agent çıktısı) gerekli." });
            return;
          }

          const proposal = await runDeveloperAgent({ design, analystAnalysis });
          sendJson(res, 200, { proposal });
        } catch (error) {
          const status = error instanceof AgentError ? error.status : 500;
          sendJson(res, status, {
            error: error?.message ?? "Beklenmeyen bir hata oluştu.",
          });
        }
      });

      server.middlewares.use("/api/apply-changes", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        try {
          const body = await readJsonBody(req);
          const files = Array.isArray(body?.files) ? body.files : [];
          const { applied } = applyFileChanges(files);
          sendJson(res, 200, { applied });
        } catch (error) {
          const status = error instanceof ApplyChangesError ? error.status : 500;
          sendJson(res, status, {
            error: error?.message ?? "Değişiklikler uygulanırken beklenmeyen bir hata oluştu.",
          });
        }
      });

      server.middlewares.use("/api/send-to-copilot", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        try {
          const body = await readJsonBody(req);
          const design = body?.design;
          const analystAnalysis =
            typeof body?.analystAnalysis === "string" ? body.analystAnalysis : undefined;

          if (!design || typeof design !== "object") {
            sendJson(res, 400, { error: "design (Design Agent çıktısı) gerekli." });
            return;
          }

          const result = await sendDesignToCopilot({ design, analystAnalysis });
          sendJson(res, 200, result);
        } catch (error) {
          const status = error instanceof AgentError ? error.status : 500;
          sendJson(res, status, {
            error: error?.message ?? "Beklenmeyen bir hata oluştu.",
          });
        }
      });

      server.middlewares.use("/api/copilot-task-status", async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        try {
          // NOT: Vite'ın middleware mount mekanizması (connect), path'e göre
          // req.url'i strip edebiliyor — bu yüzden `new URL(req.url, base)`
          // yerine sadece "?" sonrasını alıp güvenle parse ediyoruz.
          const queryString = req.url.includes("?") ? req.url.split("?")[1] : "";
          const taskId = new URLSearchParams(queryString).get("taskId");
          const result = await getCopilotTaskStatus(taskId);
          sendJson(res, 200, result);
        } catch (error) {
          const status = error instanceof AgentError ? error.status : 500;
          sendJson(res, status, {
            error: error?.message ?? "Beklenmeyen bir hata oluştu.",
          });
        }
      });
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(data));
      } catch (err) {
        rejectPromise(err);
      }
    });
    req.on("error", rejectPromise);
  });
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), analystAgentApiPlugin()],
});
