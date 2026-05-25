"use client";

import { useState } from "react";

const days = [
  "PON",
  "UTO",
  "STR",
  "STV",
  "PIA",
  "SOB",
  "NED"
];

function today() {
  const d = new Date().getDay();

  if (d === 1) return "PON";
  if (d === 2) return "UTO";
  if (d === 3) return "STR";
  if (d === 4) return "STV";
  if (d === 5) return "PIA";
  if (d === 6) return "SOB";

  return "NED";
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState(today());

  async function run() {
    if (!file) return;

    setLoading(true);

    const form = new FormData();

    form.append("image", file);
    form.append("day", day);

    const res = await fetch(
      "/api/extract-order",
      {
        method: "POST",
        body: form
      }
    );

    const json = await res.json();

    setData(json);

    setLoading(false);
  }

  function copyCSV() {
    navigator.clipboard.writeText(
      data?.csv || ""
    );

    alert("CSV skopírované");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        padding: 30
      }}
    >
      <h1>🍕 Gatto Objednávky</h1>

      <p>Čítaný deň:</p>

      <select
        value={day}
        onChange={(e) =>
          setDay(e.target.value)
        }
      >
        {days.map((d) => (
          <option
            key={d}
            value={d}
          >
            {d}
          </option>
        ))}
      </select>

      <br />
      <br />

      <input
        type="file"
        onChange={(e) =>
          setFile(
            e.target.files?.[0] ||
            null
          )
        }
      />

      <br />
      <br />

      <button
        onClick={run}
        style={{
          width: "100%",
          padding: 18
        }}
      >
        {loading
          ? "Spracovávam..."
          : "Spracovať fotku"}
      </button>

      {!!data?.csv && (
        <>
          <br />
          <br />

          <textarea
            rows={10}
            value={data.csv}
            readOnly
            style={{
              width: "100%"
            }}
          />

          <br />

          <button
            onClick={copyCSV}
          >
            Kopírovať CSV
          </button>
        </>
      )}
    </main>
  );
}
