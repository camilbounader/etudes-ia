import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

const DEFAULT_BUDGETS = { anthropic: 20, gemini: 5 };

async function budgets() {
  const r = await q(`select value from settings where key = 'budgets'`);
  return { ...DEFAULT_BUDGETS, ...(r[0]?.value || {}) };
}

// GET : consommation du mois en cours (et des 30 derniers jours par fonction)
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const month = await q(
    `select provider, round(sum(cost_usd)::numeric, 2)::float as cost, sum(input_tokens)::bigint as input, sum(output_tokens)::bigint as output
       from api_usage where created_at >= date_trunc('month', now()) group by provider`
  );
  const byFeature = await q(
    `select provider, feature, count(*)::int as calls, round(sum(cost_usd)::numeric, 3)::float as cost
       from api_usage where created_at >= date_trunc('month', now()) group by provider, feature order by cost desc`
  );
  const byDay = await q(
    `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, round(sum(cost_usd)::numeric, 2)::float as cost
       from api_usage where created_at >= now() - interval '30 days' group by 1 order by 1`
  );
  return Response.json({ month, byFeature, byDay, budgets: await budgets() });
}

// PUT { anthropic, gemini } : budgets mensuels ($)
export async function PUT(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const b = await request.json();
  const value = { anthropic: Number(b.anthropic) || 0, gemini: Number(b.gemini) || 0 };
  await q(`insert into settings (key, value) values ('budgets', $1) on conflict (key) do update set value = $1`, [JSON.stringify(value)]);
  return Response.json({ budgets: value });
}
