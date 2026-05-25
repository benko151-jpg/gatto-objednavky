import OpenAI from "openai";
import fs from "fs";
import path from "path";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDay(value: string) {
  const v = normalizeText(value).toUpperCase();

  if (v.includes("PON")) return "PON";
  if (v.includes("UTO")) return "UTO";
  if (v.includes("STR")) return "STR";
  if (v.includes("STV") || v.includes("ST")) return "STV";
  if (v.includes("PIA")) return "PIA";
  if (v.includes("SOB")) return "SOB";
  if (v.includes("NED")) return "NED";

  return "";
}

function normalizeQty(value: string) {
  const raw = String(value || "").trim().toUpperCase();

  const number =
    raw.match(/[0-9]+([,.][0-9]+)?/)?.[0]?.replace(",", ".") || "";

  const jednotka =
    raw.includes("KG") ? "kg" :
    raw.includes("KS") ? "ks" :
    raw.includes("BAL") ? "bal" :
    raw.includes("L") ? "l" :
    "";

  return { mnozstvo: number, jednotka };
}

function loadProducts() {
  const filePath = path.join(process.cwd(), "data", "produkty.txt");
  const text = fs.readFileSync(filePath, "utf8");

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [kod, ...nameParts] = line.split(/\s+/);
      const nazov = nameParts.join(" ");

      return {
        kod,
        nazov,
        search: normalizeText(nazov)
      };
    });
}

function findProduct(productName: string, products: any[]) {
  const q = normalizeText(productName);

  if (!q) return null;

  let best = null;
  let bestScore = 0;

  for (const p of products) {
    let score = 0;

    if (p.search.includes(q)) score += 10;

    for (const w of q.split(" ").filter((w) => w.length > 2)) {
      if (p.search.includes(w)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return bestScore > 0 ? best : null;
}

function extractJson(raw: string) {
  const text = String(raw || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end === -1) return [];

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const image = form.get("image") as File | null;
    const selectedDay = normalizeDay(String(form.get("day") || ""));

    if (!image) {
      return Response.json({
        ok: false,
        error: "NO_IMAGE"
      });
    }

    if (!selectedDay) {
      return Response.json({
        ok: false,
        error: "NO_DAY_SELECTED"
      });
    }

    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const ai = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Si extrémne presný OCR analyzátor objednávkových hárkov.

Na obrázku je tabuľka.

Stĺpce dní sú VŽDY v poradí:

PON | UTO | STR | ŠTV | PIA | SOB | NED

Vybraný deň je:

${selectedDay}

KRITICKÉ PRAVIDLÁ:

1.
NAJPRV si nájdi presné hranice stĺpca ${selectedDay}
medzi dvoma zvislými čiarami.

2.
NEČÍTAJ celý hárok.

3.
ČÍTAJ LEN ručne dopísané hodnoty,
ktoré fyzicky ležia vo vnútri stĺpca ${selectedDay}.

4.
Všetky zápisy mimo stĺpca ${selectedDay}
musíš ignorovať.

5.
Nikdy nepresúvaj hodnoty medzi dňami.

Príklad:
Ak je vybraný UTO:

❌ neber nič z PON
❌ neber nič zo STR
❌ neber nič zo ŠTV

ber LEN to čo je pod hlavičkou UTO

6.
Ak v stĺpci ${selectedDay}
neexistuje ručne dopísaná hodnota:

vráť presne:

[]

7.
Pre každú nájdenú položku:

- produkt = názov riadku
- kod_z_harku = vytlačený kód v riadku
- mnozstvo = ručne dopísaná hodnota

Formát:

[
 {
   "den":"${selectedDay}",
   "produkt":"Šunka od kosti",
   "kod_z_harku":"77857",
   "mnozstvo":"5,5KG"
 }
]

PRÍSNY TEST PRED ODPOVEĎOU:

Skontroluj:
"Je táto hodnota naozaj fyzicky pod hlavičkou ${selectedDay}?"

Ak nie:
NEVRACAJ JU.

Výstup:
IBA JSON.
Žiadny text.
`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.type || "image/jpeg"};base64,${base64}`
              }
            }
          ]
        }
      ]
    });

    const raw = ai.choices[0].message.content || "";
    const parsed = extractJson(raw);

    const filtered = parsed.filter((item: any) => {
      const itemDay = normalizeDay(String(item.den || ""));
      return itemDay === selectedDay;
    });

    const products = loadProducts();

    const items = filtered.map((item: any) => {
      const qty = normalizeQty(item.mnozstvo || "");

      const kodFromSheet = String(item.kod_z_harku || "")
        .replace(/\D/g, "")
        .trim();

      let matched = null;

      if (kodFromSheet) {
        matched =
          products.find((p: any) => p.kod === kodFromSheet) || null;
      }

      if (!matched) {
        matched = findProduct(item.produkt || "", products);
      }

      const finalKod = kodFromSheet || matched?.kod || "";

      return {
        den: selectedDay,
        produkt_ai: item.produkt || "",
        produkt: matched?.nazov || item.produkt || "",
        kod: finalKod,
        kod_z_harku: kodFromSheet,
        mnozstvo: qty.mnozstvo,
        jednotka: qty.jednotka,
        csv:
          finalKod && qty.mnozstvo
            ? `${finalKod};${qty.mnozstvo};`
            : ""
      };
    });

    const csv = items
      .map((item: any) => item.csv)
      .filter(Boolean)
      .join("\n");

    return Response.json({
      ok: true,
      selectedDay,
      raw,
      items,
      csv
    });

  } catch (e: any) {
    return Response.json({
      ok: false,
      error: String(e)
    });
  }
}
