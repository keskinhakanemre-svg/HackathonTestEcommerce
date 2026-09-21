import { useState } from "react";

export default function AgentRequestPage() {
  const [requestText, setRequestText] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [result, setResult] = useState(null); // { analyst, design, designError }
  const [errorMessage, setErrorMessage] = useState("");
  const [copyLabel, setCopyLabel] = useState("Kopyala");
  const [designStatus, setDesignStatus] = useState("idle"); // idle | loading | error
  const [developerStatus, setDeveloperStatus] = useState("idle"); // idle | loading | error
  const [developerError, setDeveloperError] = useState("");
  const [developerProposal, setDeveloperProposal] = useState(null); // { summary, files, notes, rejectedFiles }
  const [applyStatus, setApplyStatus] = useState("idle"); // idle | loading | success | error
  const [applyError, setApplyError] = useState("");
  const [appliedFiles, setAppliedFiles] = useState([]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = requestText.trim();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMessage("");
    setResult(null);
    setDeveloperProposal(null);
    setDeveloperStatus("idle");
    setApplyStatus("idle");
    setAppliedFiles([]);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Analiz sırasında bir hata oluştu.");
      }

      setResult(data);
      setStatus("success");
    } catch (error) {
      setErrorMessage(error.message || "Analiz sırasında bir hata oluştu.");
      setStatus("error");
    }
  };

  const handleRerunDesign = async () => {
    const designAgentPrompt = result?.analyst?.designAgentPrompt;
    if (!designAgentPrompt) return;

    setDesignStatus("loading");
    // Design planı değişecek, önceki koddan üretilmiş öneri artık geçersiz.
    setDeveloperProposal(null);
    setDeveloperStatus("idle");
    setApplyStatus("idle");
    setAppliedFiles([]);

    try {
      const response = await fetch("/api/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ designAgentPrompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Design Agent çalıştırılırken bir hata oluştu.");
      }

      setResult((previous) => ({
        ...previous,
        design: data.design,
        designError: null,
      }));
      setDesignStatus("idle");
    } catch (error) {
      setResult((previous) => ({
        ...previous,
        designError: error.message || "Design Agent çalıştırılırken bir hata oluştu.",
      }));
      setDesignStatus("error");
    }
  };

  const handleRunDeveloper = async () => {
    const design = result?.design;
    if (!design) return;

    setDeveloperStatus("loading");
    setDeveloperError("");
    setApplyStatus("idle");
    setAppliedFiles([]);

    try {
      const response = await fetch("/api/develop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ design, analystAnalysis: result?.analyst?.analysis }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Developer Agent çalıştırılırken bir hata oluştu.");
      }

      setDeveloperProposal(data.proposal);
      setDeveloperStatus("idle");
    } catch (error) {
      setDeveloperError(error.message || "Developer Agent çalıştırılırken bir hata oluştu.");
      setDeveloperStatus("error");
    }
  };

  const handleApplyChanges = async () => {
    const files = developerProposal?.files;
    if (!files || files.length === 0) return;

    setApplyStatus("loading");
    setApplyError("");

    try {
      const response = await fetch("/api/apply-changes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Değişiklikler uygulanırken bir hata oluştu.");
      }

      setAppliedFiles(data.applied || []);
      setApplyStatus("success");
    } catch (error) {
      setApplyError(error.message || "Değişiklikler uygulanırken bir hata oluştu.");
      setApplyStatus("error");
    }
  };

  const handleCopyPrompt = async () => {
    if (!result?.analyst?.designAgentPrompt) return;
    try {
      await navigator.clipboard.writeText(result.analyst.designAgentPrompt);
      setCopyLabel("Kopyalandı ✓");
      setTimeout(() => setCopyLabel("Kopyala"), 1500);
    } catch {
      // Panoya kopyalama desteklenmiyorsa sessizce geç.
    }
  };

  const analyst = result?.analyst;
  const design = result?.design;

  return (
    <section className="agent-page">
      <h2>Yeni Özellik İsteği</h2>
      <p className="agent-page__intro">
        Proje için eklemek istediğin özelliği kısaca yaz. İstek önce{" "}
        <strong>Analyst Agent</strong> tarafından analiz edilecek, çıktısı
        otomatik olarak <strong>Design Agent</strong>&apos;a iletilecek ve
        her ikisinin sonucu aşağıda sırayla gösterilecek.
      </p>

      <form className="agent-page__form" onSubmit={handleSubmit}>
        <textarea
          className="agent-page__textarea"
          placeholder='Örn: "Ürün detay sayfası ekle" veya "Fiyata göre filtreleme ekle"'
          value={requestText}
          onChange={(event) => setRequestText(event.target.value)}
          rows={5}
          disabled={status === "loading"}
        />
        <button
          type="submit"
          className="agent-page__submit"
          disabled={status === "loading" || !requestText.trim()}
        >
          {status === "loading" ? "Analiz ediliyor..." : "Analiz Et"}
        </button>
      </form>

      {status === "error" && (
        <div className="agent-page__error" role="alert">
          ⚠️ {errorMessage}
        </div>
      )}

      {status === "success" && analyst && (
        <div className="agent-page__result">
          <p className="agent-page__agent-label">🧑‍💼 Analyst Agent</p>

          {analyst.analysis && (
            <div className="agent-page__block">
              <h3>Değerlendirme</h3>
              <p>{analyst.analysis}</p>
            </div>
          )}

          {analyst.openQuestions?.length > 0 && (
            <div className="agent-page__block">
              <h3>Açık Sorular</h3>
              <ul>
                {analyst.openQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="agent-page__block agent-page__block--prompt">
            <div className="agent-page__block-header">
              <h3>Design Agent&apos;a Gidecek Prompt</h3>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="agent-page__copy"
              >
                {copyLabel}
              </button>
            </div>
            <pre className="agent-page__prompt">{analyst.designAgentPrompt}</pre>
          </div>

          <div className="agent-page__agent-label-row">
            <p className="agent-page__agent-label">🎨 Design Agent</p>
            <button
              type="button"
              onClick={handleRerunDesign}
              disabled={designStatus === "loading"}
              className="agent-page__rerun"
            >
              {designStatus === "loading"
                ? "Design Agent çalışıyor..."
                : "🔁 Design Agent'ı Tekrar Çalıştır"}
            </button>
          </div>

          {design && (
            <>
              {design.summary && (
                <div className="agent-page__block">
                  <h3>Özet</h3>
                  <p>{design.summary}</p>
                </div>
              )}

              {design.components?.length > 0 && (
                <div className="agent-page__block">
                  <h3>Bileşenler</h3>
                  <ul>
                    {design.components.map((component) => (
                      <li key={component}>{component}</li>
                    ))}
                  </ul>
                </div>
              )}

              {design.pageLayout && (
                <div className="agent-page__block">
                  <h3>Sayfa Düzeni</h3>
                  <p>{design.pageLayout}</p>
                </div>
              )}

              {design.stateNotes && (
                <div className="agent-page__block">
                  <h3>State / Veri Notları</h3>
                  <p>{design.stateNotes}</p>
                </div>
              )}

              {design.openQuestions?.length > 0 && (
                <div className="agent-page__block">
                  <h3>Açık Sorular</h3>
                  <ul>
                    {design.openQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {result.designError && (
            <div className="agent-page__error" role="alert">
              ⚠️ Design Agent çalıştırılamadı: {result.designError}
            </div>
          )}

          {design && (
            <>
              <div className="agent-page__agent-label-row">
                <p className="agent-page__agent-label">🛠️ Developer Agent</p>
                <button
                  type="button"
                  onClick={handleRunDeveloper}
                  disabled={developerStatus === "loading"}
                  className="agent-page__rerun"
                >
                  {developerStatus === "loading"
                    ? "Kod öneriliyor..."
                    : developerProposal
                      ? "🔁 Kod Önerisini Yeniden Üret"
                      : "🛠️ Kod Değişikliği Öner"}
                </button>
              </div>

              {developerStatus === "error" && (
                <div className="agent-page__error" role="alert">
                  ⚠️ Developer Agent çalıştırılamadı: {developerError}
                </div>
              )}

              {developerProposal && (
                <div className="agent-page__block agent-page__block--proposal">
                  <p className="agent-page__proposal-warning">
                    ⚠️ Bu kod ücretsiz bir modelden geldi, gözden geçirmeden
                    uygulama — aşağıda hangi dosyaların nasıl değişeceğini
                    görüp öyle onayla.
                  </p>

                  {developerProposal.summary && (
                    <p className="agent-page__proposal-summary">
                      {developerProposal.summary}
                    </p>
                  )}

                  {developerProposal.files.length === 0 ? (
                    <p>Önerilecek bir dosya değişikliği üretilmedi.</p>
                  ) : (
                    developerProposal.files.map((file) => (
                      <div key={file.path} className="agent-page__file-proposal">
                        <div className="agent-page__file-proposal-header">
                          <span className="agent-page__file-path">{file.path}</span>
                          <span
                            className={`agent-page__file-badge agent-page__file-badge--${file.action}`}
                          >
                            {file.action === "create" ? "Yeni dosya" : "Güncelleniyor"}
                          </span>
                        </div>
                        <pre className="agent-page__code-preview">{file.content}</pre>
                      </div>
                    ))
                  )}

                  {developerProposal.rejectedFiles?.length > 0 && (
                    <div className="agent-page__error" role="alert">
                      ⚠️ Şu öneriler güvenlik/şekil nedeniyle reddedildi:{" "}
                      {developerProposal.rejectedFiles
                        .map((rejected) => `${rejected.path} (${rejected.reason})`)
                        .join(", ")}
                    </div>
                  )}

                  {developerProposal.notes && (
                    <p className="agent-page__proposal-notes">
                      📝 {developerProposal.notes}
                    </p>
                  )}

                  {developerProposal.files.length > 0 && (
                    <button
                      type="button"
                      onClick={handleApplyChanges}
                      disabled={applyStatus === "loading"}
                      className="agent-page__apply"
                    >
                      {applyStatus === "loading"
                        ? "Uygulanıyor..."
                        : "✅ Kodu Uygula"}
                    </button>
                  )}

                  {applyStatus === "success" && (
                    <div className="agent-page__success" role="status">
                      ✅ Değişiklikler diske yazıldı: {appliedFiles.join(", ")}.
                      Vite otomatik olarak sayfayı güncelleyecek. Git
                      kullanıyorsan <code>git diff</code> ile ne değiştiğini
                      kontrol etmen önerilir.
                    </div>
                  )}

                  {applyStatus === "error" && (
                    <div className="agent-page__error" role="alert">
                      ⚠️ Değişiklikler uygulanamadı: {applyError}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
