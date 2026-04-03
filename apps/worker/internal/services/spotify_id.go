package service

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// ExtractSpotifyID extracts the base62 ID from various Spotify identifier formats.
// Handles:
// - Full URLs: https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
// - Spotify URIs: spotify:track:4iV5W9uYEdYUVa79Axb7Rh
// - Direct base62 IDs: 4iV5W9uYEdYUVa79Axb7Rh
func ParseSpotifyId(input string) (string, error) {
	input = strings.TrimSpace(input)
	urlPattern := regexp.MustCompile(`https?://open\.spotify\.com/(?:[a-z]+)/([a-zA-Z0-9]{22})`)
	if match := urlPattern.FindStringSubmatch(input); len(match) > 1 {
		return match[1], nil
	}
	uriPattern := regexp.MustCompile(`spotify:[a-z]+:([a-zA-Z0-9]{22})`)
	if match := uriPattern.FindStringSubmatch(input); len(match) > 1 {
		return match[1], nil
	}
	base62Pattern := regexp.MustCompile(`^[a-zA-Z0-9]{22}$`)
	if base62Pattern.MatchString(input) {
		return input, nil
	}
	return "", fmt.Errorf("invalid Spotify identifier format: %s", input)
}

// ExtractSpotifyID extracts the ID from a Spotify URL, removing query parameters.
func ExtractSpotifyID(input string) (string, error) {
	if !strings.Contains(input, "/") && !strings.Contains(input, "://") {
		return strings.Split(input, "?")[0], nil
	}
	parsedURL, err := url.Parse(input)
	if err != nil {
		return "", err
	}
	segments := strings.Split(parsedURL.Path, "/")
	var id string
	for i := len(segments) - 1; i >= 0; i-- {
		if segments[i] != "" {
			id = segments[i]
			break
		}
	}
	return strings.Split(id, "?")[0], nil
}

// ExtractSpotifyIDColon extracts the ID from a Spotify URI (colon-separated format).
// e.g., "spotify:track:4iV5W9uYEdYUVa79Axb7Rh" -> "4iV5W9uYEdYUVa79Axb7Rh"
func ExtractSpotifyIDColon(uri string) string {
	parts := strings.Split(uri, ":")
	if len(parts) == 3 {
		return parts[2]
	}
	return ""
}

// ExtractID extracts the third part of a colon-separated ID.
// e.g., "spotify:playlist:abc123" -> "abc123"
func ExtractID(id string) (string, error) {
	splitString := strings.Split(id, ":")
	if len(splitString) > 2 {
		return splitString[2], nil
	}
	return "", fmt.Errorf("invalid ID format: %s - expected at least 3 parts separated by ':'", id)
}

