export type AudienceAsk = {
  comment: string;
  ask: string;
  kind: "constraint" | "variant" | "request";
};

const ASK_PATTERNS = [
  /\bi want (?:to )?(?:make |try |eat |order |see |this (?:as |to be )?)?(.{4,90})/i,
  /\bi wish (?:there (?:was|were) |this had |you'd |you would )?(.{4,90})/i,
  /\bplease(?: please)*(?: make| do| try) (.{4,90})/i,
  /\bneed (?:a |an |the )?(.{4,70})/i,
  /\bcan you (?:please )?(?:make|do|try) (.{4,90})/i,
  /\byou should(?: literally)? (?:do|make|try) (.{4,90})/i,
  /\bi would (?:totally )?(?:eat|order|buy) (.{4,90})/i,
  /\bmake (?:this|it|one) (?:as |into |with )(.{4,70})/i,
];

const JUNK = /^(to watch|to subscribe|a video|this video|more videos|the link|notifications)\b/i;

function clean(value: string) {
  const text = value
    .split(/[.!?|]/)[0]
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—,;:\s]+|[-–—,;:\s]+$/g, "");
  return text.length >= 4 ? text.slice(0, 90) : "";
}

function kind(comment: string): AudienceAsk["kind"] {
  const lower = comment.toLowerCase();
  if (/\b(without|no |vegetarian|vegan|gluten)\b/.test(lower)) return "constraint";
  if (/\b(as a |slider|wrap|taco|late night|version|with )\b/.test(lower)) return "variant";
  return "request";
}

export function extractAsk(comment: string): AudienceAsk | null {
  const text = (comment || "").replace(/\n/g, " ").trim();
  if (text.length < 8) return null;
  for (const pattern of ASK_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const ask = clean(match[1]);
    if (!ask || JUNK.test(ask)) continue;
    return { comment: text.slice(0, 280), ask, kind: kind(text) };
  }
  return null;
}

export function extractAsks(comments: string[]): AudienceAsk[] {
  const found: AudienceAsk[] = [];
  const seen = new Set<string>();
  for (const comment of comments) {
    const row = extractAsk(comment);
    if (!row || seen.has(row.ask.toLowerCase())) continue;
    seen.add(row.ask.toLowerCase());
    found.push(row);
  }
  return found;
}
