export type KitchenQueryInput = {
  city?: string | null;
  cuisine?: string | null;
  neighborhood?: string | null;
  region?: string | null;
  risingTerms?: string[];
  limit?: number;
};

const MAX_QUERIES = 8;

function clean(value?: string | null) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text || /^(n\/a|na|none|null|-)$/i.test(text)) return "";
  return text;
}

export function buildDiscoveryQueries(input: KitchenQueryInput): string[] {
  const city = clean(input.city);
  const cuisine = clean(input.cuisine);
  const neighborhood = clean(input.neighborhood);
  const region = clean(input.region);
  const out: string[] = [];

  if (cuisine) {
    out.push(`${cuisine} recipe`);
    out.push(`viral ${cuisine} recipe`);
    out.push(`how to make ${cuisine}`);
    out.push(`${cuisine} restaurant special recipe`);
  }
  if (city) {
    out.push(`${city} food recipe`);
    out.push(`${city} restaurant dish recipe`);
    if (cuisine) out.push(`${city} ${cuisine} recipe`);
  }
  if (region) out.push(`${region} food recipe`);
  for (const term of input.risingTerms ?? []) {
    const blob = clean(term);
    if (!blob) continue;
    out.push(/recipe|food/i.test(blob) ? blob : `${blob} recipe`);
  }

  if (!out.length) {
    out.push("viral recipe", "tiktok recipe", "restaurant special recipe");
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const query of out) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(query);
  }
  return unique.slice(0, Math.max(1, input.limit ?? MAX_QUERIES));
}
