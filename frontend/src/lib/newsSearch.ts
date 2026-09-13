import type { ScrapedDish } from "@/lib/contractTypes";
import { fallbackKitchenQueries, kitchenFoodTerms, looksLikeRestaurantStory } from "@/lib/kitchenSearch";
import type { NewsRecipe } from "@miseenvue/agent";

export type NewsHit = {
  name: string;
  sources: Array<{ title: string; url: string; note?: string; image?: string | null }>;
};

export type NewsArticle = {
  title: string;
  url: string;
  source?: string;
  image?: string | null;
};

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function cleanNewsTitle(title: string) {
  const trimmed = title.replace(/\s+/g, " ").trim();
  const primary = trimmed.split(/\s+[|\-–—]\s+/)[0]?.trim() || trimmed;
  return primary.replace(/\s+[|\-–—]\s*Google News\s*$/i, "").trim() || trimmed;
}

function slugId(url: string) {
  const compact = url.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `news-${compact.slice(-22) || compact.slice(0, 22)}`;
}

function parseRss(xml: string): NewsArticle[] {
  const items: NewsArticle[] = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
    const link = decodeXml((block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim());
    const description = decodeXml((block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "").trim());
    const source = decodeXml((block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || "").trim());
    const sourceUrl = decodeXml((block.match(/<source[^>]+url=["']([^"']+)["']/i)?.[1] || "").trim());
    const articleHref = decodeXml((description.match(/<a[^>]+href=["']([^"']+)["']/i)?.[1] || "").trim());
    const enclosure = decodeXml(
      (block.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1] ||
        block.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ||
        description.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ||
        "").trim(),
    );
    const url =
      /^https?:\/\//i.test(articleHref) && !/news\.google\.com/i.test(articleHref)
        ? articleHref
        : link;
    if (!title || !/^https?:\/\//i.test(url)) continue;
    items.push({
      title: cleanNewsTitle(title),
      url,
      source: source || sourceUrl || undefined,
      image: /^https?:\/\//i.test(enclosure) ? enclosure : null,
    });
    if (items.length >= 8) break;
  }
  return items;
}

async function searchNews(query: string) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) return [];
  return parseRss(await res.text());
}

function ogFromHtml(html: string) {
  const slice = html.slice(0, 120_000);
  const match =
    slice.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
    slice.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i) ||
    slice.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
    slice.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
  const raw = match?.[1]?.trim().replace(/&amp;/g, "&");
  return raw && /^https?:\/\//i.test(raw) ? raw : null;
}

async function fetchPageImage(url: string) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; MiseEnVue/1.0; +https://miseenvue.local)",
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!/html|xml/i.test(type) && type) return null;
    return ogFromHtml(await res.text());
  } catch {
    return null;
  }
}

async function attachNewsImages(articles: NewsArticle[]) {
  await Promise.all(
    articles.slice(0, 8).map(async (article) => {
      if (article.image) return;
      article.image = await fetchPageImage(article.url);
    }),
  );
  return articles;
}

export async function hydrateArticleImages(dishes: ScrapedDish[]) {
  await Promise.all(
    dishes.map(async (dish) => {
      const item = dish.evidence?.[0];
      if (!item || item.image || /youtube\.com\/watch|youtu\.be\//i.test(item.url || "")) return;
      item.image = await fetchPageImage(item.url);
    }),
  );
  return dishes;
}

export function dishesFromNewsRecipes(
  recipes: NewsRecipe[],
  articles: NewsArticle[],
): ScrapedDish[] {
  const byUrl = new Map(articles.map((article) => [article.url, article]));
  const seen = new Set<string>();
  return recipes
    .map((recipe) => {
      if (!recipe.name || !recipe.url || seen.has(recipe.url)) return null;
      if (looksLikeRestaurantStory(recipe.name)) return null;
      seen.add(recipe.url);
      const article = byUrl.get(recipe.url);
      const what = recipe.description || `${recipe.name} from a viral recipe write-up.`;
      return {
        id: slugId(recipe.url),
        name: recipe.name,
        description: what,
        recipe:
          recipe.ingredients.length || recipe.method.length
            ? { ingredients: recipe.ingredients, method: recipe.method }
            : undefined,
        trend_score: 68,
        momentum: "rising" as const,
        whyHere: what,
        why_trending: { summary: what },
        metrics: { mention_count: 1, by_source: { news: 1 } },
        evidence: [
          {
            source: "news",
            url: recipe.url,
            excerpt: article?.source || "News recipe",
            engagement: null,
            image: article?.image || null,
          },
        ],
      } satisfies ScrapedDish;
    })
    .filter((dish): dish is ScrapedDish => dish != null);
}

export function dishesFromNewsArticles(
  articles: NewsArticle[],
  extra?: { cuisine?: string | null },
): ScrapedDish[] {
  const seen = new Set<string>();
  return articles
    .map((article) => {
      const url = article.url;
      if (!url || seen.has(url)) return null;
      seen.add(url);
      const name = cleanNewsTitle(article.title);
      if (!name) return null;
      const where = article.source ? `${article.source}` : "Google News";
      const what = `${name}. ${where}.`;
      return {
        id: slugId(url),
        name,
        description: what,
        cuisine_tags: extra?.cuisine ? extra.cuisine.split(/[^a-z0-9]+/i).filter((word) => word.length > 3) : undefined,
        trend_score: 70,
        momentum: "rising" as const,
        whyHere: what,
        why_trending: { summary: what, drivers: [where] },
        metrics: { mention_count: 1, by_source: { news: 1 } },
        evidence: [
          {
            source: "news",
            url,
            excerpt: where,
            engagement: null,
            image: article.image || null,
          },
        ],
      } satisfies ScrapedDish;
    })
    .filter((dish): dish is ScrapedDish => dish != null);
}

export function dishesFromSourceHits(
  hits: Array<{ name: string; description?: string; sources: Array<{ title: string; url: string; note?: string; image?: string | null }> }>,
): ScrapedDish[] {
  const seen = new Set<string>();
  return hits
    .flatMap((hit) =>
      (hit.sources ?? []).map((source) => {
        if (!/^https?:\/\//i.test(source.url)) return null;
        if (/youtube\.com\/results|google\.com\/search/i.test(source.url)) return null;
        if (/youtube\.com\/watch|youtu\.be\//i.test(source.url)) return null;
        if (seen.has(source.url)) return null;
        seen.add(source.url);
        const name = cleanNewsTitle(hit.name || source.title);
        if (OFF_TOPIC_NEWS.test(name) || looksLikeRestaurantStory(name) || looksLikeRestaurantStory(source.title || "")) {
          return null;
        }
        const isNews = !/trends\.google/i.test(source.url);
        if (!name) return null;
        const excerpt = source.note ? `${source.title} — ${source.note}` : source.title || name;
        return {
          id: slugId(source.url),
          name,
          description: hit.description || excerpt,
          trend_score: 71,
          momentum: "rising" as const,
          why_trending: { summary: hit.description || excerpt },
          metrics: { mention_count: 1, by_source: { [isNews ? "news" : "web"]: 1 } },
          evidence: [
            {
              source: /trends/i.test(source.url) ? "google_trends" : "news",
              url: source.url,
              excerpt,
              engagement: null,
              image: source.image || null,
            },
          ],
        } satisfies ScrapedDish;
      }),
    )
    .filter((dish): dish is ScrapedDish => dish != null);
}

const OFF_TOPIC_NEWS =
  /\b(\d+\s+best|best \w+ restaurants|great \w+ restaurants|restaurants in |guide to|date night|newest restaurant openings|resy guide|updated 20\d\d|fyi |spots ranked|business updates)\b/i;

const OTHER_CITIES = [
  "chicago",
  "philadelphia",
  "philly",
  "los angeles",
  "new york",
  "houston",
  "austin",
  "dallas",
  "miami",
  "seattle",
  "boston",
];

export function newsFitsKitchen(title: string, city?: string | null, cuisine?: string | null) {
  if (OFF_TOPIC_NEWS.test(title) || looksLikeRestaurantStory(title)) return false;
  const blob = title.toLowerCase();
  const here = (city || "").toLowerCase();
  if (here && OTHER_CITIES.some((name) => name !== here && blob.includes(name) && !blob.includes(here))) {
    return false;
  }
  const terms = kitchenFoodTerms(cuisine);
  const cuisineHit = terms.some((term) => blob.includes(term.toLowerCase()));
  const recipeHit = /\b(recipe|tiktok|viral|how to make|homemade|pasta|sauce|noodles?)\b/i.test(title);
  return recipeHit || cuisineHit;
}

export async function searchNewsArticles(city?: string | null, cuisine?: string | null): Promise<NewsArticle[]> {
  const queries = fallbackKitchenQueries(city, cuisine).map((query) =>
    query.replace(/^viral\s+/i, "viral "),
  );

  const packs = await Promise.all(
    queries.slice(0, 2).map(async (query) => {
      try {
        return await searchNews(query);
      } catch {
        return [] as NewsArticle[];
      }
    }),
  );

  const seen = new Set<string>();
  const articles = packs
    .flat()
    .filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return newsFitsKitchen(article.title, city, cuisine);
    })
    .slice(0, 8);

  return attachNewsImages(articles);
}

export async function searchNewsForDishes(
  names: string[],
  city?: string | null,
  cuisine?: string | null,
): Promise<NewsHit[]> {
  const articles = await searchNewsArticles(city, cuisine);
  if (!articles.length) return [];
  if (!names.length) {
    return articles.map((article) => ({
      name: article.title,
      sources: [{ title: article.title, url: article.url, note: article.source || "Google News", image: article.image }],
    }));
  }
  return articles.map((article) => ({
    name: article.title,
    sources: [{ title: article.title, url: article.url, note: article.source || "Google News", image: article.image }],
  }));
}
