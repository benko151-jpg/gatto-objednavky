export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 20,
        background: "#0b0b0b",
        color: "white",
        fontFamily: "sans-serif"
      }}
    >
      <h1>🍕 Gatto Objednávky</h1>

      <p>
        Foto → AI → CSV
      </p>

      <div
        style={{
          marginTop: 20,
          padding: 20,
          borderRadius: 16,
          background: "#181818"
        }}
      >
        <input
          type="file"
          accept="image/*"
          capture="environment"
        />

        <button
          style={{
            marginTop: 16,
            width: "100%",
            padding: 16,
            borderRadius: 12,
            background: "#ffffff",
            color: "#000"
          }}
        >
          Spracovať fotku
        </button>
      </div>
    </main>
  );
}
