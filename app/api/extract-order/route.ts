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

    const words = q
      .split(" ")
      .filter((w) => w.length > 2);

    for (const w of words) {
      if (p.search.includes(w)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (bestScore <= 0) return null;

  return best;
}

function extractJson(raw: string) {
  const text = String(raw || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  if (start === -1 || end === -1) return [];

  const jsonText = text.slice(start, end + 1);

  try {
    return JSON.parse(jsonText);
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = form.get("image") as File | null;
    const day = String(form.get("day") || "AUTO");

    if (!image) {
      return Response.json({
        ok: false,
        error: "NO_IMAGE"
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
Si OCR pre kuchynské objednávky.

Na fotke je objednávkový hárok s tabuľkou:
produkt / dodávateľ / kód / PON / UTO / STR / STV / PIA / SOB / NED.

Zvolený deň je: ${day}

Úloha:
- čítaj IBA stĺpec zvoleného dňa: ${day}
- ignoruj všetky ostatné dni
- nájdi iba bunky v stĺpci ${day}, kde je ručne perom dopísaná hodnota
- ku každej hodnote zisti názov produktu z ľavého riadku
- ak je na rovnakom riadku vytlačený číselný kód produktu, zahrň ho ako "kod_z_harku"
- vráť iba čistý JSON array
- nič nevysvetľuj

Formát:
[
  {
    "produkt": "Šunka od kosti",
    "kod_z_harku": "77857",
    "mnozstvo": "5,5KG"
  }
]

Pravidlá:
- 5,5KG nechaj ako 5,5KG
- 1BAL nechaj ako 1BAL
- 20KS nechaj ako 20KS
- čítaj len ručne dopísaný text v stĺpci ${day}
- ignoruj vytlačené texty v tabuľke okrem názvu produktu a kódu
- ak je hodnota mimo stĺpca ${day}, vynechaj ju
- ak si nie si istý, vynechaj položku
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
    const products = loadProducts();

    const items = parsed.map((item: any) => {
      const qty = normalizeQty(item.mnozstvo || "");

      const kodFromSheet =
        String(item.kod_z_harku || "")
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
      day,
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
