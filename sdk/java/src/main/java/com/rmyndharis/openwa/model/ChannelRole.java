package com.rmyndharis.openwa.model;

import com.google.gson.annotations.SerializedName;

/**
 * The session account's role in a channel. The wire values are lowercase, so each constant carries a
 * {@link SerializedName} mapping.
 */
public enum ChannelRole {
    @SerializedName("owner")
    OWNER,
    @SerializedName("admin")
    ADMIN,
    @SerializedName("subscriber")
    SUBSCRIBER,
    @SerializedName("unknown")
    UNKNOWN
}
