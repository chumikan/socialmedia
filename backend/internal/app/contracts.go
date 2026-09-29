package app

// DTOs are the source of generated frontend transport types. Domain writes use
// these same request structs; SQL read views retain the existing UI field names.
type UserDTO struct {
	ID            string   `json:"id"`
	Username      string   `json:"username"`
	Name          string   `json:"name"`
	Bio           *string  `json:"bio"`
	Website       *string  `json:"website"`
	Location      *string  `json:"location"`
	PhotoURL      string   `json:"photoURL"`
	CoverPhotoURL *string  `json:"coverPhotoURL"`
	Theme         *string  `json:"theme"`
	Accent        *string  `json:"accent"`
	Verified      bool     `json:"verified"`
	IsAdmin       bool     `json:"isAdmin"`
	IsBanned      bool     `json:"isBanned"`
	PinnedTweet   *string  `json:"pinnedTweet"`
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     *string  `json:"updatedAt"`
	Following     []string `json:"following"`
	Followers     []string `json:"followers"`
	TotalTweets   int      `json:"totalTweets"`
	TotalPhotos   int      `json:"totalPhotos"`
}
type MediaDTO struct {
	ID   string `json:"id"`
	Src  string `json:"src"`
	Alt  string `json:"alt"`
	Type string `json:"type"`
}
type ParentDTO struct {
	ID       string `json:"id"`
	Username string `json:"username"`
}
type TweetDTO struct {
	ID           string      `json:"id"`
	Text         *string     `json:"text"`
	Images       *[]MediaDTO `json:"images"`
	Parent       *ParentDTO  `json:"parent"`
	CreatedBy    string      `json:"createdBy"`
	CreatedAt    string      `json:"createdAt"`
	UpdatedAt    *string     `json:"updatedAt"`
	UserLikes    []string    `json:"userLikes"`
	UserRetweets []string    `json:"userRetweets"`
	UserReplies  int         `json:"userReplies"`
}
