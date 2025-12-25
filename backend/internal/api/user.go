package api

import (
	"fmt"
	"net/http"

	"github.com/gofrs/uuid/v5"
)

func (a *api) RegisterUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user").(uuid.UUID)
	if !ok {
		http.Error(w, "JWT not found in context", http.StatusInternalServerError)
		return
	}
	user, err := a.userRepo.CreateUser(r.Context(), userID)
	fmt.Println(err)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	Json(w, r, fmt.Sprintf("created new user: %v", user))
}
