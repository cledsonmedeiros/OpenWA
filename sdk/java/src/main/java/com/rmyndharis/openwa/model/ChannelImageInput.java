package com.rmyndharis.openwa.model;

/** One image of a channel batch: {@code url}, or {@code base64} with its {@code mimetype} (image/*). */
public record ChannelImageInput(String url, String base64, String mimetype) {}
