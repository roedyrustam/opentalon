---
name: web_content_extractor
version: 1.0.0
description: "Extracts titles, meta tags, clean text, and links from raw HTML documents"
capabilities: {}
---

# web_content_extractor
Extracts structured metadata, headings, paragraphs, and links from HTML strings.

## Implementation

```javascript
export default async function run(args) {
  const html = String(args.html || "");

  // 1. Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "Untitled";

  // 2. Extract meta description
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const description = metaDescMatch ? metaDescMatch[1].trim() : "";

  // 3. Remove script, style, and svg blocks
  const withoutBloat = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");

  // 4. Extract links
  const links = [];
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(withoutBloat)) !== null) {
    const href = match[1].trim();
    const anchorText = match[2].replace(/<[^>]+>/g, "").trim();
    if (href && !href.startsWith("#")) {
      links.push({ href, text: anchorText });
    }
  }

  // 5. Strip remaining tags and clean whitespace
  const cleanText = withoutBloat
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    description,
    textLength: cleanText.length,
    linksCount: links.length,
    excerpt: cleanText.slice(0, 150)
  };
}
```

## Test Cases

```json
[
  {
    "args": {
      "html": "<html><head><title>OpenTalon AI</title><meta name=\"description\" content=\"Autonomous Dual-Brain Framework\"></head><body><h1>Welcome</h1><p>Next-gen agent.</p><a href=\"https://opentalon.dev\">Docs</a></body></html>"
    },
    "expected": {
      "title": "OpenTalon AI",
      "description": "Autonomous Dual-Brain Framework",
      "textLength": 24,
      "linksCount": 1,
      "excerpt": "OpenTalon AI Welcome Next-gen agent. Docs"
    }
  }
]
```
