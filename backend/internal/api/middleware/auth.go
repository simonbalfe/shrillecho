package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gofrs/uuid/v5"
	"github.com/golang-jwt/jwt/v5"
	"net/http"
	"os"
	"time"
)

type SupabaseClaims struct {
	jwt.RegisteredClaims
	Role        string `json:"role"`
	Aud         string `json:"aud"`
	IsAnonymous bool   `json:"is_anonymous"`
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errorResponse(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func createUUID(user string) (uuid.UUID, error) {
	newUUID, err := uuid.FromString(user)
	if err != nil {
		return uuid.UUID{}, errors.New("failed to parse user id")
	}
	return newUUID, nil
}

func CheckAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authCookie, err := r.Cookie("anonymousSession")
		if err != nil {
			errorResponse(w, http.StatusUnauthorized, "no auth cookie present")
			return
		}
		token, err := jwt.ParseWithClaims(authCookie.Value, &SupabaseClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			fmt.Println(os.Getenv("SUPABASE_JWT_SECRET"))
			secret := []byte(os.Getenv("SUPABASE_JWT_SECRET"))
			return secret, nil
		})
		if err != nil {
			errorResponse(w, http.StatusUnauthorized, err.Error())
			return
		}
		claims, ok := token.Claims.(*SupabaseClaims)
		if !ok || !token.Valid {
			errorResponse(w, http.StatusUnauthorized, "invalid token claims")
			return
		}
		if claims.ExpiresAt != nil && claims.ExpiresAt.Before(time.Now()) {
			errorResponse(w, http.StatusUnauthorized, "token expired")
			return
		}
		ctx := r.Context()
		ctx = context.WithValue(r.Context(), "claims", claims)
		id, err := createUUID(claims.Subject)
		if err != nil {
			errorResponse(w, http.StatusUnauthorized, "invald token, failed to create UUID...")
			return
		}
		ctx = context.WithValue(r.Context(), "user", id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
