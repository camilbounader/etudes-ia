import { handleUpload } from "@vercel/blob/client";
import { isAuthed } from "@/lib/auth";

// Le navigateur envoie les PDF directement à Vercel Blob (pas de limite de
// 4,5 Mo des fonctions). Cette route ne fait que délivrer l'autorisation.
export async function POST(request) {
  const body = await request.json();
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        if (!(await isAuthed())) throw new Error("Non connecté");
        return {
          allowedContentTypes: ["application/pdf"],
          addRandomSuffix: true,
          maximumSizeInBytes: 200 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 400 });
  }
}
