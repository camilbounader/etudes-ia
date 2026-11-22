import { cookies } from "next/headers";
import crypto from "crypto";

// Protection simple par mot de passe (APP_PASSWORD dans Vercel) :
// sans ça, n'importe qui trouvant l'adresse pourrait utiliser tes crédits API.

export const COOKIE = "etudes_auth";

export function authToken() {
  return crypto
    .createHash("sha256")
    .update("etudes-ia:" + (process.env.APP_PASSWORD || ""))
    .digest("hex");
}

export async function isAuthed() {
  if (!process.env.APP_PASSWORD) return false;
  const c = (await cookies()).get(COOKIE);
  return c?.value === authToken();
}

// À appeler en tête de chaque route API : renvoie une réponse 401 ou null.
export async function guard() {
  if (await isAuthed()) return null;
  return Response.json({ error: "Non connecté" }, { status: 401 });
}
