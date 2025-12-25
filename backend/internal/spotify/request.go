package spotify

import (
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/shared"
)

var defaultHeaders = map[string]string{
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

func addCookies(req *http.Request) {
	cookies := []http.Cookie{
		{Name: "sp_dc", Value: os.Getenv("SP_DC")},
		{Name: "sp_key", Value: os.Getenv("SP_KEY")},
	}
	for _, cookie := range cookies {
		req.AddCookie(&cookie)
	}
}

func addHeaders(req *http.Request) {
	for key, value := range defaultHeaders {
		req.Header.Set(key, value)
	}
}

func performRequest(req *http.Request, client *http.Client) (shared.RequestResponse, error) {
	resp, err := client.Do(req)
	if err != nil {
		return shared.RequestResponse{}, fmt.Errorf("error making request: %w", err)
	}
	defer resp.Body.Close()

	var reader io.Reader = resp.Body
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gzReader, err := gzip.NewReader(resp.Body)
		if err != nil {
			return shared.RequestResponse{}, fmt.Errorf("error creating gzip reader: %w", err)
		}
		defer gzReader.Close()
		reader = gzReader
	}

	body, err := io.ReadAll(reader)
	if err != nil {
		return shared.RequestResponse{}, fmt.Errorf("error reading response: %w", err)
	}

	return shared.RequestResponse{
		StatusCode: resp.StatusCode,
		Data:       body,
	}, nil
}
