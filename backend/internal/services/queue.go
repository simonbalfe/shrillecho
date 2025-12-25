package service

import (
	"context"

	artModels "github.com/smwbalfe/shrillecho-playlist-archive/backend/internal/spotify/endpoints/artist/models"
)

type ScrapeJob struct {
	ID           int64              `json:"id"`
	Artist       string             `json:"artist"`
	Depth        int                `json:"depth"`
	Status       string             `json:"status"`
	Error        string             `json:"error,omitempty"`
	Artists      []artModels.Artist `json:"artists,omitempty"`
	TotalArtists int                `json:"total_artists"`
}

type Queue interface {
	Enqueue(ctx context.Context, job *ScrapeJob) error
	Dequeue(ctx context.Context) (*ScrapeJob, error)
	UpdateJob(ctx context.Context, job *ScrapeJob) error
	GetJob(ctx context.Context, jobID int64) (*ScrapeJob, error)
}
