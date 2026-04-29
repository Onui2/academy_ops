import { equipmentParts } from "@/lib/ops-data";
import { buildDanawaSearchUrl, buildGmarketSearchUrl, resolveDanawaQuery, resolveGmarketQuery } from "@/lib/part-price-catalog";

type PartRecord = (typeof equipmentParts)[number];

export type LivePartQuote = {
  partId: string;
  name: string;
  price: number;
  source: "danawa" | "static";
  status: "live" | "fallback";
  checkedAt: string;
  productName: string | null;
  productUrl: string | null;
  searchUrl: string;
  gmarketUrl: string;
  error: string | null;
};

export type LivePartPricesResponse = {
  checkedAt: string;
  items: LivePartQuote[];
};

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractDanawaQuote(html: string) {
  const match = html.match(
    /<div class="prod_main_info">[\s\S]*?<p class="prod_name">[\s\S]*?<a\s+href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>[\s\S]*?<p class="price_sect">[\s\S]*?<strong>([\d,]+)<\/strong>원/
  );

  if (!match) return null;

  const [, url, rawTitle, rawPrice] = match;
  const price = Number(rawPrice.replace(/[^\d]/g, ""));
  if (!price) return null;

  return {
    productUrl: url,
    productName: decodeHtml(rawTitle),
    price
  };
}

async function fetchDanawaPrice(query: string) {
  const searchUrl = buildDanawaSearchUrl(query);
  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`danawa_search_${response.status}`);
  }

  const html = await response.text();
  const quote = extractDanawaQuote(html);
  if (!quote) {
    throw new Error("danawa_parse_failed");
  }

  return {
    ...quote,
    searchUrl
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function fetchLivePriceForPart(part: PartRecord): Promise<LivePartQuote> {
  const checkedAt = new Date().toISOString();
  const danawaQuery = resolveDanawaQuery(part.id, part.name);
  const gmarketQuery = resolveGmarketQuery(part.id, part.name);
  const searchUrl = buildDanawaSearchUrl(danawaQuery);
  const gmarketUrl = buildGmarketSearchUrl(gmarketQuery);

  if (part.price === 0) {
    return {
      partId: part.id,
      name: part.name,
      price: part.price,
      source: "static",
      status: "fallback",
      checkedAt,
      productName: part.name,
      productUrl: null,
      searchUrl,
      gmarketUrl,
      error: null
    };
  }

  try {
    const quote = await fetchDanawaPrice(danawaQuery);
    return {
      partId: part.id,
      name: part.name,
      price: quote.price,
      source: "danawa",
      status: "live",
      checkedAt,
      productName: quote.productName,
      productUrl: quote.productUrl,
      searchUrl: quote.searchUrl,
      gmarketUrl,
      error: null
    };
  } catch (error) {
    return {
      partId: part.id,
      name: part.name,
      price: part.price,
      source: "static",
      status: "fallback",
      checkedAt,
      productName: part.name,
      productUrl: null,
      searchUrl,
      gmarketUrl,
      error: error instanceof Error ? error.message : "unknown_error"
    };
  }
}

export async function fetchLivePricesForParts(parts: PartRecord[]): Promise<LivePartPricesResponse> {
  const items = await mapWithConcurrency(parts, 4, fetchLivePriceForPart);
  return {
    checkedAt: new Date().toISOString(),
    items
  };
}
