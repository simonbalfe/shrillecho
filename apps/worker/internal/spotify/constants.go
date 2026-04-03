package spotify

var Headers = map[string]string{
	"User-Agent":                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
	"Accept-Encoding":           "gzip, deflate, br",
	"Accept-Language":           "en-GB,en;q=0.5",
	"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
	"Origin":                    "https://open.spotify.com",
	"Sec-Fetch-Dest":            "document",
	"Sec-Fetch-Mode":            "navigate",
	"Sec-Fetch-Site":            "none",
	"Sec-Fetch-User":            "?1",
	"Upgrade-Insecure-Requests": "1",
	"Te":                        "trailers",
	"Alt-Used":                  "open.spotify.com",
	"Host":                      "open.spotify.com",
	"Connection":                "keep-alive",
}

var ClientHeaders = map[string]string{
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
	"Accept":     "application/json",
}

