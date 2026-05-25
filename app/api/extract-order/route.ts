import OpenAI from "openai";

const client = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
});

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

   const base64 =
     Buffer
       .from(bytes)
       .toString("base64");

   const result =
     await client.chat.completions.create({
       model: "gpt-4.1-mini",

       messages: [
         {
           role: "user",

           content: [
             {
               type: "text",

               text: `
Si OCR pre kuchynske objednavky.

Vratis iba JSON.

Format:

[
{
"produkt":"",
"mnozstvo":""
}
]

Precitaj iba rukou dopisane hodnoty.
Ignoruj prazdne riadky.
`
             },

             {
               type: "image_url",

               image_url: {
                 url:
                   `data:${image.type};base64,${base64}`
               }
             }
           ]
         }
       ]
     });

   return Response.json({
     ok: true,
     raw:
       result
         .choices[0]
         .message
         .content
   });

 } catch (e: any) {

   return Response.json({
     ok: false,
     error:
       String(e)
   });

 }
}
