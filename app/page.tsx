"use client";

import { useState } from "react";

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function processImage() {
    if (!file) return;

    setLoading(true);

    try {
      const form = new FormData();
      form.append("image", file);

      const res = await fetch("/api/extract-order", {
        method: "POST",
        body: form
      });

      const data = await res.json();

      setResult(JSON.stringify(data, null, 2));
    } catch {
      setResult("chyba");
    }

    setLoading(false);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0b0b",
        color: "white",
        padding: 20,
        fontFamily: "sans-serif"
      }}
    >
      <h1>🍕 Gatto Objednávky</h1>

      <p>Foto → AI → CSV</p>

      <div
        style={{
          background: "#171717",
          borderRadius: 16,
          padding: 20,
          marginTop: 20
        }}
      >
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) =>
            setFile(e.target.files?.[0] || null)
          }
        />

        <button
          onClick={processImage}
          disabled={!file || loading}
          style={{
            marginTop: 20,
            width: "100%",
            padding: 16,
            borderRadius: 12
          }}
        >
          {loading
            ? "Spracovávam…"
            : "Spracovať fotku"}
        </button>
      </div>

      {result && (
        <pre
          style={{
            marginTop: 20,
            whiteSpace: "pre-wrap"
          }}
        >
          {result}
        </pre>
      )}
    </main>
  );
}
