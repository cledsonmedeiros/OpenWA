import { mapMembershipType } from './wwebjs-channel-role';

describe('mapMembershipType', () => {
  it.each([
    ['owner', 'owner'],
    ['admin', 'admin'],
    ['subscriber', 'subscriber'],
    ['guest', 'unknown'],
    ['OWNER', 'unknown'],
    [undefined, 'unknown'],
    [null, 'unknown'],
    [1, 'unknown'],
    [{}, 'unknown'],
  ])('maps %p to %p', (raw, expected) => {
    expect(mapMembershipType(raw)).toBe(expected);
  });
});
