package com.rmyndharis.openwa.model;

import com.google.gson.annotations.SerializedName;

/** Where the text post of a channel batch goes. */
public enum ChannelTextPosition {
    @SerializedName("before")
    BEFORE,
    @SerializedName("after")
    AFTER
}
