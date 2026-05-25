import OpenAI from "openai";

const openai = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req: Request) {
 try {
   return Response.json({
     ok: true,
     message: "AI endpoint pripravený"
   });
 } catch {
   return Response.json(
     {
       ok: false
     },
     {
       status: 500
     }
   );
 }
}
