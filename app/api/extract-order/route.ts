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
  if (v.includes("STV") || v.includes("STV")) return "STV";
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

    console.log("SELECTED_DAY =", selectedDay);

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
Si OCR pre kuchynské objednávky.

Na fotke je objednávkový hárok tabuľka so stĺpcami:
názov | dodávateľ | kód | PON | UTO | STR | ŠTV | PIA | SOB | NED

ZVOLENÝ DEŇ: ${selectedDay}

Najdôležitejšie pravidlo:
ČÍTAJ IBA STĹPEC ${selectedDay}.

Postup:
1. Nájdi hlavičku dní: PON, UTO, STR, ŠTV, PIA, SOB, NED.
2. Urči, kde je stĺpec ${selectedDay}.
3. Čítaj iba ručne perom dopísané hodnoty vo vnútri stĺpca ${selectedDay}.
4. Ak je v stĺpci ${selectedDay} prázdno, vráť [].
5. Hodnoty v iných stĺpcoch ignoruj.

Vráť iba čistý JSON array.

Formát:
[
  {
    "den": "${selectedDay}",
    "produkt": "Šunka od kosti",
    "kod_z_harku": "77857",
    "mnozstvo": "5,5KG"
  }
]

Pravidlá:
- den musí byť vždy fyzický stĺpec, kde je hodnota napísaná
- ak je hodnota v PON a zvolený deň je UTO, NEVRACAJ ju
- ak je hodnota v STR a zvolený deň je UTO, NEVRACAJ ju
- nikdy nepresúvaj hodnoty medzi dňami
- čítaj iba ručne dopísaný text
- názov produktu ber z ľavého riadku
- kód produktu ber z rovnakého riadku, ak je vytlačený
- 5,5KG nechaj ako 5,5KG
- 1BAL nechaj ako 1BAL
- 20KS nechaj ako 20KS
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

    console.log("RAW_AI =", raw);
    console.log("PARSED =", parsed);

    const filtered = parsed.filter((item: any) => {
      const itemDay = normalizeDay(String(item.den || ""));
      return itemDay === selectedDay;
    });

    console.log("FILTERED =", filtered);

    const products = loadProducts();

    const items = filtered.map((item: any) => {
      const qty = normalizeQty(item.mnozstvo || "");

      const kodFromSheet = String(item.kod_z_harku || "")
        .replace(/\D/g, "")
        .trim();

      let matched = null;

      if (kodFromSheet) {
        matched = products.find((p: any) => p.kod === kodFromSheet) || null;
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

    console.log("ITEMS =", items);
    console.log("CSV =", csv);

    return Response.json({
      ok: true,
      selectedDay,
      raw,
      parsed,
      filtered,
      items,
      csv
    });

  } catch (e: any) {
    console.log("ERROR =", String(e));

    return Response.json({
      ok: false,
      error: String(e)
    });
  }
}
