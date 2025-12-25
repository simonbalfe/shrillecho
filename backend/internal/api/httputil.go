package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
)

// ParseBody reads and unmarshals a JSON request body into the provided struct.
func ParseBody(r *http.Request, item any) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	return json.Unmarshal(body, item)
}

// Json writes a JSON response to the response writer.
func Json(w http.ResponseWriter, r *http.Request, item any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(item); err != nil {
		http.Error(w, "Error encoding response", http.StatusInternalServerError)
	}
}

// ParseQueryInt parses a query parameter string to an integer.
func ParseQueryInt(queryParam string) (int, error) {
	if queryParam == "" {
		return 0, nil
	}
	return strconv.Atoi(queryParam)
}
