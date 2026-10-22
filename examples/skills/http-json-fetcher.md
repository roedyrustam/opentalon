---
name: http_json_fetcher
version: 1.0.0
description: "Safely fetches JSON data from whitelisted external REST endpoints with HTTPS validation"
capabilities: {"net":{"allowedHosts":["api.github.com","httpbin.org"],"allowHttp":false}}
---

# http_json_fetcher
Performs secure JSON GET requests against approved API domains.

## Implementation

```javascript
export default async function run(args) {
  const url = String(args.url || "");
  if (!url) {
    return {
      status: 400,
      success: false,
      error: "No URL provided"
    };
  }
  if (!url.startsWith("https://")) {
    throw new Error("Only secure HTTPS URLs are permitted");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": "OpenTalon-Sandbox/1.0"
    }
  });

  if (!response.ok) {
    return {
      status: response.status,
      success: false,
      error: `Remote API responded with HTTP ${response.status}`
    };
  }

  const data = await response.json();
  return {
    status: response.status,
    success: true,
    data
  };
}
```
