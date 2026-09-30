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
	PinnedPost    *string  `json:"pinnedPost"`
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     *string  `json:"updatedAt"`
	Following     []string `json:"following"`
	Followers     []string `json:"followers"`
	TotalPosts    int      `json:"totalPosts"`
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
type PostDTO struct {
	ID          string      `json:"id"`
	Text        *string     `json:"text"`
	Images      *[]MediaDTO `json:"images"`
	Parent      *ParentDTO  `json:"parent"`
	CreatedBy   string      `json:"createdBy"`
	CreatedAt   string      `json:"createdAt"`
	UpdatedAt   *string     `json:"updatedAt"`
	UserLikes   []string    `json:"userLikes"`
	UserReposts []string    `json:"userReposts"`
	UserReplies int         `json:"userReplies"`
}
