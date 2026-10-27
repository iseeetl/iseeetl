import { describe, expect, it } from 'vitest';
import config from '../../../scripts/room-guides-config';
const { parseRoomGuides } = config;
const roomId = '111111111111111111111111';
const group = { lang: 'en', label: 'English guide', postIds: ['222222222222222222222222'] };
describe('room guide build configuration', () => {
  it('is disabled by default and accepts valid public references', () => {
    expect(parseRoomGuides()).toEqual({});
    const valid = { [roomId]: [group] };
    expect(parseRoomGuides(JSON.stringify(valid))).toEqual(valid);
  });
  it.each(['null', '[]', 'broken', '{"wrong":[]}', JSON.stringify({ [roomId]: [group, group] }),
    JSON.stringify({ [roomId]: [{ ...group, url: 'https://example.com' }] }),
    JSON.stringify({ [roomId]: [{ ...group, postIds: [] }] }),
    JSON.stringify({ [roomId]: [{ ...group, postIds: [...group.postIds, ...group.postIds] }] }),
    JSON.stringify({ [roomId]: [{ ...group, label: 'x'.repeat(61) }] }),
  ])('fails closed for invalid references', (raw) => {
    expect(() => parseRoomGuides(raw)).toThrow('VITE_ROOM_GUIDES');
  });
});
