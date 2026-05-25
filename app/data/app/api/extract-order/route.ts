import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const image = form.get("image") as File | null;

    if (!image) {
      return Response.json(
        { ok: false, error: "Chýba fotka" },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mime = image.type || "image/jpeg";

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Toto je objednávkový hárok kuchyne.

Úloha:
- prečítaj iba ručne dopísané objednávkové hodnoty
- ignoruj prázdne bunky
- nájdi produkt z riadku
- ak je pri produkte kód, použi ho
- vráť iba čistý JSON, bez komentára

Formát:
[
  {
    "kod": "",
    "produkt": "",
    "mnozstvo": "",
    "jednotka": "",
    "confidence": 0.0
  }
]

Pravidlá:
- 3,5KG prepíš ako 3.5
- 1BAL prepíš ako 1
- 20KS prepíš ako 20
- nehádať
- ak nevieš kód alebo produkt, nechaj prázdne
`
            },
            {
              type: "input_image",
              image_url: `data:${mime};base64,${base64}`,
              detail: "high"
            }
          ]
        }
      ]
    });

    return Response.json({
      ok: true,
      raw: response.output_text
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "AI spracovanie zlyhalo"
      },
      {
        status: 500
      }
    );
  }
}
