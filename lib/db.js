import { neon } from "@neondatabase/serverless";

let _sql;
export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquante dans Vercel");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Requête avec paramètres : q("select * from x where id = $1", [id])
export async function q(text, params = []) {
  return db().query(text, params);
}

// Un vecteur JS -> littéral pgvector '[0.1,0.2,...]'
export function vec(values) {
  return "[" + values.map((v) => Number(v).toFixed(6)).join(",") + "]";
}
