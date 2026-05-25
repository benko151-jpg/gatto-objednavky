import OpenAI from "openai";

const openai = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req: Request) {
 try {
   const form = await req.formData();

   const image = form.get("image");

   if (!image) {
     return Response.json({
       ok: false,
       error: "NO_IMAGE"
     });
   }

   return Response.json({
     ok: true,
     message: "API FUNGUJE"
   });

 } catch (e: any) {
   return Response.json({
     ok: false,
     error: String(e)
   });
 }
}
