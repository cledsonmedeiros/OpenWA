package com.rmyndharis.openwa.resources;

import static com.rmyndharis.openwa.http.Http.encodeSegment;

import com.rmyndharis.openwa.OpenWAClient;
import com.rmyndharis.openwa.http.HttpMethod;
import com.rmyndharis.openwa.model.ChannelMessageQuery;
import com.rmyndharis.openwa.model.ChannelMessageRecord;
import com.rmyndharis.openwa.model.ChannelPostResult;
import com.rmyndharis.openwa.model.ChannelRecord;
import com.rmyndharis.openwa.model.CreateChannelRequest;
import com.rmyndharis.openwa.model.DemoteChannelAdminRequest;
import com.rmyndharis.openwa.model.MuteChannelRequest;
import com.rmyndharis.openwa.model.PostChannelImagesRequest;
import com.rmyndharis.openwa.model.TransferChannelOwnershipRequest;
import com.rmyndharis.openwa.model.SubscribeChannelRequest;
import com.rmyndharis.openwa.model.SuccessResult;
import java.util.List;

/**
 * Channels resource — WhatsApp Channels / Newsletters.
 *
 * <p>Backed by {@code sessions/:sessionId/channels}.
 */
public final class ChannelsResource {
    private final OpenWAClient client;

    public ChannelsResource(OpenWAClient client) {
        this.client = client;
    }

    /**
     * List all channels/newsletters the session is subscribed to. whatsapp-web.js only; Baileys
     * answers {@code 501}.
     */
    public List<ChannelRecord> list(String sessionId) {
        return client.requestList(
            HttpMethod.GET, "/api/sessions/" + encodeSegment(sessionId) + "/channels", null, null, ChannelRecord.class);
    }

    /** Get a single channel by id. */
    public ChannelRecord get(String sessionId, String channelId) {
        return client.request(
            HttpMethod.GET,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId),
            null,
            null,
            ChannelRecord.class);
    }

    /** Get recent messages from a channel. whatsapp-web.js only; Baileys answers {@code 501}. */
    public List<ChannelMessageRecord> messages(String sessionId, String channelId, ChannelMessageQuery query) {
        return client.requestList(
            HttpMethod.GET,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId) + "/messages",
            query,
            null,
            ChannelMessageRecord.class);
    }

    /** Post an ordered image batch to a channel. See {@link #postImages(String, String, PostChannelImagesRequest, String)}. */
    public ChannelPostResult postImages(String sessionId, String channelId, PostChannelImagesRequest body) {
        return postImages(sessionId, channelId, body, null);
    }

    /**
     * Post 1-10 images to a channel the session owns or administers, one post per image in order, plus an
     * optional text post. Progress arrives on the socket as {@code channel.post.progress}. Nothing is re-sent:
     * a failure after something went out answers with {@code failedAt} set; an idempotency key makes a retry
     * replay that answer, as long as the retry resends the identical body, {@code postId} included.
     */
    public ChannelPostResult postImages(
        String sessionId, String channelId, PostChannelImagesRequest body, String idempotencyKey) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId) + "/posts/images",
            null,
            body,
            ChannelPostResult.class,
            idempotencyKey);
    }

    /** Create a channel. The account owns it, which is what makes {@link #delete} possible later. */
    public ChannelRecord create(String sessionId, CreateChannelRequest body) {
        return client.request(
            HttpMethod.POST, "/api/sessions/" + encodeSegment(sessionId) + "/channels", null, body, ChannelRecord.class);
    }

    /**
     * Delete a channel this account owns. Irreversible, and every subscriber loses it.
     *
     * <p>Note the path: {@code unsubscribe} is the {@code DELETE} route, and the two are deliberately
     * not reachable by the same request — leaving a channel and destroying it are very different acts.
     */
    public SuccessResult delete(String sessionId, String channelId) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId) + "/delete",
            null,
            null,
            SuccessResult.class);
    }

    /** Mute or unmute a channel's notifications. The subscription is untouched either way. */
    public SuccessResult mute(String sessionId, String channelId, MuteChannelRequest body) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId) + "/mute",
            null,
            body,
            SuccessResult.class);
    }

    /**
     * Subscribe to a channel using its invite code. Requires an OPERATOR-level key. Baileys only;
     * whatsapp-web.js answers {@code 501}.
     */
    public ChannelRecord subscribe(String sessionId, SubscribeChannelRequest body) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/subscribe",
            null,
            body,
            ChannelRecord.class);
    }

    /** Unsubscribe from a channel. Requires an OPERATOR-level key. */
    public SuccessResult unsubscribe(String sessionId, String channelId) {
        return client.request(
            HttpMethod.DELETE,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId),
            null,
            null,
            SuccessResult.class);
    }
    /**
     * Demote a channel admin back to a subscriber. Requires an OPERATOR-level key.
     *
     * <p>There is no promote counterpart: neither engine library has one, so an admin is promoted
     * from the WhatsApp app and demoted here. The whatsapp-web.js engine answers {@code 501}.
     */
    public SuccessResult demoteAdmin(String sessionId, String channelId, DemoteChannelAdminRequest body) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId) + "/admins/demote",
            null,
            body,
            SuccessResult.class);
    }

    /**
     * Hand a channel to a new owner. Requires an OPERATOR-level key.
     *
     * <p><b>Irreversible</b>: once the transfer lands this account stops being the owner and cannot
     * take the channel back. The whatsapp-web.js engine answers {@code 501}.
     */
    public SuccessResult transferOwnership(String sessionId, String channelId, TransferChannelOwnershipRequest body) {
        return client.request(
            HttpMethod.POST,
            "/api/sessions/" + encodeSegment(sessionId) + "/channels/" + encodeSegment(channelId) + "/owner/transfer",
            null,
            body,
            SuccessResult.class);
    }

}
