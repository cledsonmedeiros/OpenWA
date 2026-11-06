package com.rmyndharis.openwa.model;

import java.util.List;

/**
 * Answer of {@code channels().postImages()}. A non-null {@code failedAt} means the batch stopped there
 * after something went out; nothing is re-sent.
 */
public record ChannelPostResult(
    ChannelPostMode mode,
    List<ChannelPostSentItem> sent,
    ChannelPostText text,
    Integer failedAt,
    String error) {}
