package com.rmyndharis.openwa.model;

import java.util.List;

/**
 * Body of {@code channels().postImages()}: 1-10 images posted in order, plus an optional text post.
 * {@code postId} is a caller-generated UUID correlating the {@code channel.post.progress} socket frames.
 */
public record PostChannelImagesRequest(
    String postId,
    List<ChannelImageInput> images,
    String text,
    ChannelTextPosition textPosition,
    Boolean linkPreview) {}
