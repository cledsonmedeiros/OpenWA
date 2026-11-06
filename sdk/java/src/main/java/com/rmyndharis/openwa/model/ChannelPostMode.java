package com.rmyndharis.openwa.model;

import com.google.gson.annotations.SerializedName;

/** How a channel batch went out. */
public enum ChannelPostMode {
    @SerializedName("album")
    ALBUM,
    @SerializedName("individual")
    INDIVIDUAL
}
