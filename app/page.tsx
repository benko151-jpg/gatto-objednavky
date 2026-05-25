"use client";

import { useState } from "react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!file) return;

    setLoading(true);

    const form = new FormData();
    form.append("image", file);

    const res = await fetch("/api/extract-order", {
      method: "POST",
      body: form
    });

    const json = await res.json();

    setData(json);
    setLoading(false);
  }

  function copyCSV() {
    navigator.clipboard.writeText(data?.csv || "");
    alert("CSV skopírované");
  }

  return (
    <main
      style={{
        background: "#000",
        color: "#fff",
        minHeight: "100vh",
        padding: 30
      }}
    >
      <h1>🍕 Gatto Objednávky</h1>

      <input
        type="file"
        onChange={(e) =>
          setFile(e.target.files?.[0] || null)
        }
      />

      <br />
      <br />

      <button
        onClick={run}
        style={{
          width: "100%",
          padding: 20
        }}
      >
        {loading ? "Spracovávam…" : "Spracovať fotku"}
      </button>

      {!!data?.items?.length && (
        <>
          <br />

          <table
            style={{
              width: "100%",
              marginTop: 30
            }}
          >
            <thead>
              <tr>
                <th>Produkt</th>
                <th>Kód</th>
                <th>Množstvo</th>
              </tr>
            </thead>

            <tbody>
              {data.items.map(
                (i: any, index: number) => (
                  <tr key={index}>
                    <td>{i.produkt}</td>
                    <td>{i.kod}</td>
                    <td>
                      {i.mnozstvo}
                      {i.jednotka}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>

          <br />

          <textarea
            value={data.csv}
            readOnly
            rows={8}
            style={{
              width: "100%"
            }}
          />

          <br />

          <button onClick={copyCSV}>
            Kopírovať CSV
          </button>
        </>
      )}
    </main>
  );
}
