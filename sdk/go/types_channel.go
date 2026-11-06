package openwa

import "net/url"

// ChannelRecord is a WhatsApp Channel / Newsletter. Mirrors the backend Channel — the engine
// payload is returned as-is, with no DTO in between.
type ChannelRecord struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	// InviteCode is the invite code from the channel link.
	InviteCode      *string `json:"inviteCode,omitempty"`
	SubscriberCount int     `json:"subscriberCount,omitempty"`
	// Picture is the channel picture URL. Not currently filled by either engine.
	Picture  *string `json:"picture,omitempty"`
	Verified *bool   `json:"verified,omitempty"`
	// CreatedAt is the channel creation time as reported by the engine. Populated by Baileys;
	// whatsapp-web.js omits it.
	CreatedAt *int64 `json:"createdAt,omitempty"`
	// Role is the session account's role in the channel. Reported by whatsapp-web.js; nil on
	// Baileys. A UX signal only — the server and WhatsApp still decide whether a send is accepted.
	Role *ChannelRole `json:"role,omitempty"`
	// MediaSupported reports whether an image can be sent to the channel (whatsapp-web.js with the
	// channel media patch); nil on Baileys.
	MediaSupported *bool `json:"mediaSupported,omitempty"`
}

// ChannelRole is the session account's role in a channel.
type ChannelRole string

const (
	ChannelRoleOwner      ChannelRole = "owner"
	ChannelRoleAdmin      ChannelRole = "admin"
	ChannelRoleSubscriber ChannelRole = "subscriber"
	ChannelRoleUnknown    ChannelRole = "unknown"
)

// ChannelMessageRecord is a message read live from a channel by Channels.Messages. This is the
// engine payload (backend ChannelMessage), NOT the persisted MessageRecord — that endpoint reads
// WhatsApp directly and never touches the message store.
type ChannelMessageRecord struct {
	ID   string `json:"id"`
	Body string `json:"body"`
	// Timestamp is a Unix timestamp in seconds.
	Timestamp int64  `json:"timestamp"`
	HasMedia  bool   `json:"hasMedia"`
	MediaURL  string `json:"mediaUrl,omitempty"`
}

// ChannelMessageQuery limits the channel message read (default 50, max 100: a larger value is cut to 100).
type ChannelMessageQuery struct {
	Limit *int
}

func (q *ChannelMessageQuery) values() url.Values {
	v := url.Values{}
	setInt(v, "limit", q.Limit)
	return v
}

// SubscribeChannelRequest subscribes to a channel by invite code.
type SubscribeChannelRequest struct {
	InviteCode string `json:"inviteCode"`
}
