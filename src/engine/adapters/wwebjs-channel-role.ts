import type { ChannelRole } from '../interfaces/whatsapp-engine.interface';

const KNOWN_ROLES: ReadonlySet<string> = new Set<ChannelRole>(['owner', 'admin', 'subscriber']);

/**
 * WhatsApp Web's `newsletterMetadata.membershipType` → neutral role. The mapping is closed: only
 * `'owner'` was observed live (lowercase, 2026-11-06); anything else, including a case variant, maps
 * to `'unknown'` so a renamed or new value can never unlock posting by accident.
 */
export function mapMembershipType(raw: unknown): ChannelRole {
  return typeof raw === 'string' && KNOWN_ROLES.has(raw) ? (raw as ChannelRole) : 'unknown';
}
