package app

import (
	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"
	"net/http"
	"os"
)

func (a *App) googleConfig(r *http.Request) (*oidc.Provider, *oauth2.Config, error) {
	client := os.Getenv("GOOGLE_CLIENT_ID")
	secret := os.Getenv("GOOGLE_CLIENT_SECRET")
	if client == "" || secret == "" {
		return nil, nil, apiError{503, "Google sign-in is not configured; use email sign-in"}
	}
	p, err := oidc.NewProvider(r.Context(), "https://accounts.google.com")
	if err != nil {
		return nil, nil, err
	}
	return p, &oauth2.Config{ClientID: client, ClientSecret: secret, Endpoint: p.Endpoint(), RedirectURL: a.Origin + "/api/v1/auth/google/callback", Scopes: []string{oidc.ScopeOpenID, "email", "profile"}}, nil
}
func (a *App) googleStart(w http.ResponseWriter, r *http.Request) error {
	_, config, err := a.googleConfig(r)
	if err != nil {
		return err
	}
	state, nonce := id(), id()
	a.Sessions.Put(r.Context(), "oauth_state", state)
	a.Sessions.Put(r.Context(), "oauth_nonce", nonce)
	http.Redirect(w, r, config.AuthCodeURL(state, oidc.Nonce(nonce)), http.StatusFound)
	return nil
}
func (a *App) googleCallback(w http.ResponseWriter, r *http.Request) error {
	state := a.Sessions.PopString(r.Context(), "oauth_state")
	nonce := a.Sessions.PopString(r.Context(), "oauth_nonce")
	if state == "" || nonce == "" || state != r.URL.Query().Get("state") {
		return forbidden()
	}
	provider, config, err := a.googleConfig(r)
	if err != nil {
		return err
	}
	token, err := config.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		return bad("Google authentication failed")
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		return forbidden()
	}
	verified, err := provider.Verifier(&oidc.Config{ClientID: config.ClientID}).Verify(r.Context(), raw)
	if err != nil || verified.Nonce != nonce {
		return forbidden()
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err = verified.Claims(&claims); err != nil || !claims.EmailVerified {
		return forbidden()
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var uid string
	err = tx.QueryRow(ctx, "SELECT user_id FROM oauth_identities WHERE provider='google' AND subject=$1", verified.Subject).Scan(&uid)
	if err == pgx.ErrNoRows {
		uid = id()
		username := "user" + uid[:12]
		if _, err = tx.Exec(ctx, "INSERT INTO users(id,email,username,name) VALUES($1,lower($2),$3,$3)", uid, claims.Email, username); err != nil {
			return apiError{409, "email already registered; sign in with your existing account"}
		}
		if _, err = tx.Exec(ctx, "INSERT INTO oauth_identities(provider,subject,user_id) VALUES('google',$1,$2)", verified.Subject, uid); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	var banned bool
	if err = tx.QueryRow(ctx, "SELECT is_banned FROM users WHERE id=$1", uid).Scan(&banned); err != nil {
		return err
	}
	if banned {
		return forbidden()
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	if err = a.Sessions.RenewToken(ctx); err != nil {
		return err
	}
	a.Sessions.Put(ctx, "user_id", uid)
	var version int
	if err := a.DB.QueryRow(ctx, "SELECT session_version FROM users WHERE id=$1", uid).Scan(&version); err != nil {
		return err
	}
	a.Sessions.Put(ctx, "session_version", version)
	http.Redirect(w, r, "/home", http.StatusSeeOther)
	return nil
}
