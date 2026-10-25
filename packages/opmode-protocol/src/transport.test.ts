import { describe, expect, test } from 'bun:test';
import { encodeOpModeTransportFrames, OpModeTransportDecoder, OPMODE_TRANSPORT_CHUNK_CHARACTERS, OPMODE_TRANSPORT_MAX_BYTES } from './transport';

describe('bounded OpMode transport', () => {
  test('preserves ordinary messages and reassembles a dependency-sized response', () => {
    const small = JSON.stringify({ command: 'tick', sequence: 1 });
    expect([...encodeOpModeTransportFrames(small, 'a')]).toEqual([small]);
    const json = JSON.stringify({ artifact: 'abc123'.repeat(4 * 1024 * 1024) });
    const decoder = new OpModeTransportDecoder();
    let result: string | null = null;
    let count = 0;
    for (const frame of encodeOpModeTransportFrames(json, 'b')) {
      expect(frame.length).toBeLessThan(OPMODE_TRANSPORT_CHUNK_CHARACTERS + 1024);
      result = decoder.accept(frame); count++;
    }
    expect(count).toBeGreaterThan(100);
    expect(result).toBe(json);
    expect(decoder.accept(small)).toBe(small);
  });
  test('rejects missing, mixed, and oversized chunks without waiting for a build timeout', () => {
    const frames = [...encodeOpModeTransportFrames('x'.repeat(OPMODE_TRANSPORT_CHUNK_CHARACTERS * 2 + 1), 'a')];
    expect(() => new OpModeTransportDecoder().accept(frames[1]!)).toThrow();
    const decoder = new OpModeTransportDecoder();
    expect(decoder.accept(frames[0]!)).toBeNull();
    expect(() => decoder.accept(JSON.stringify({ ...JSON.parse(frames[1]!), transferId: 'b' }))).toThrow();
    expect(() => new OpModeTransportDecoder().accept(JSON.stringify({ ...JSON.parse(frames[0]!), totalCharacters: OPMODE_TRANSPORT_MAX_BYTES + 1 }))).toThrow();
    expect(() => new OpModeTransportDecoder().accept(JSON.stringify({ ...JSON.parse(frames[0]!), data: 'short' }))).toThrow();
    decoder.reset();
    expect(decoder.accept('{"ok":true}')).toBe('{"ok":true}');
  });
  test('preserves Unicode across a chunk boundary', () => {
    const json = JSON.stringify({ text: 'x'.repeat(OPMODE_TRANSPORT_CHUNK_CHARACTERS - 10) + '🤖'.repeat(100) });
    const decoder = new OpModeTransportDecoder();
    let result: string | null = null;
    for (const frame of encodeOpModeTransportFrames(json, 'unicode')) result = decoder.accept(frame);
    expect(result).toBe(json);
  });
});
