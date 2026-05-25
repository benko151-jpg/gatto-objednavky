import OpenAI from "openai";
import fs from "fs";
import path from "path";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQty(value: string) {
  const raw = String(value || "").trim().toUpperCase();
  const number = raw.match(/[0-9]+([,.][0-9]+)?/)?.[0]?.replace(",", ".") || "";
  const unit =
    raw.includes("KG") ? "kg" :
    raw.includes("KS") ? "ks" :
    raw.includes("BAL") ? "bal" :
    "";

  return { mnozstvo: number, jednotka: unit };
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

  let best = null;
  let bestScore = 0;

  for (const p of products) {
    let score = 0;

    const words = q.split(" ").filter(Boolean);

    for (const w of words) {
      if (p.search.includes(w)) score += 1;
    }

    if (p.search.includes(q)) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (bestScore <= 0) return null;

  return best;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = form.get("image") as File;

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
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Si OCR pre kuchynské objednávky.

Z fotky objednávkového hárku vytiahni iba ručne dopísané položky.

Vráť iba čistý JSON, nič iné.

Formát:
[
  {
    "produkt": "",
    "mnozstvo": ""
  }
]

Pravidlá:
- ignoruj prázdne bunky
- čítaj iba ručne dopísané hodnoty
- produkt ber z názvu riadku
- 3,5KG nechaj ako 3,5KG
- 1BAL nechaj ako 1BAL
- 20KS nechaj ako 20KS
- ak si nie si istý, produkt aj množstvo vynechaj
`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.type};base64,${base64}`
              }
            }
          ]
        }
      ]
    });

    const raw = ai.choices[0].message.content || "[]";

    let parsed: any[] = [];

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }

    const products = loadProducts();

    const items = parsed.map((item) => {
      const matched = findProduct(item.produkt || "", products);
      const qty = normalizeQty(item.mnozstvo || "");

      return {
        produkt_ai: item.produkt || "",
        produkt: matched?.nazov || item.produkt || "",
        kod: matched?.kod || "",
        mnozstvo: qty.mnozstvo,
        jednotka: qty.jednotka,
        csv: matched?.kod && qty.mnozstvo ? `${matched.kod};${qty.mnozstvo};` : ""
      };
    });

    const csv = items
      .map((item) => item.csv)
      .filter(Boolean)
      .join("\n");

    return Response.json({
      ok: true,
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
