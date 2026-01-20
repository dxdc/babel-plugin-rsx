import { useEffect, useState } from "react";
import { codeToHtml, type BundledLanguage } from "shiki";
import styles from "./CodeViewer.module.css";

interface CodeViewerProps {
  code: string;
  language?: BundledLanguage;
  filename?: string;
}

export function CodeViewer({ code, language = "tsx", filename }: CodeViewerProps) {
  const [html, setHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const highlighted = await codeToHtml(code, {
          lang: language,
          theme: "github-dark",
        });
        if (!cancelled) {
          setHtml(highlighted);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Syntax highlighting failed:", err);
        if (!cancelled) {
          setHtml(`<pre><code>${escapeHtml(code)}</code></pre>`);
          setIsLoading(false);
        }
      }
    }

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <div className={styles.codeViewer}>
      {filename && (
        <div className={styles.filename}>
          <span className={styles.filenameIcon}>📄</span>
          {filename}
        </div>
      )}
      {isLoading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <div className={styles.content} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
