import { describe, expect, it } from 'vitest';
import { toCsv } from '../exportCsv';

describe('exportCsv', () => {
  it('adds UTF-8 BOM for Hebrew compatibility', async () => {
    const blob = toCsv(['כותרת'], [['שלום']]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8').decode(bytes);
    expect(text).toContain('כותרת');
    expect(text).toContain('שלום');
  });

  it('escapes commas, quotes and newlines', async () => {
    const blob = toCsv(
      ['a', 'b', 'c'],
      [['x,y', 'he said "hi"', 'line1\nline2']]
    );
    const text = await blob.text();
    expect(text).toContain('"x,y"');
    expect(text).toContain('"he said ""hi"""');
    expect(text).toContain('"line1\nline2"');
  });

  it('converts null and undefined to empty fields', async () => {
    const blob = toCsv(['a', 'b', 'c'], [[null, undefined, 'ok']]);
    const text = await blob.text();
    expect(text).toContain(',,ok');
    expect(text).not.toContain('null');
    expect(text).not.toContain('undefined');
  });

  it('writes headers only when rows are empty', async () => {
    const blob = toCsv(['col1', 'col2'], []);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8').decode(bytes);
    expect(text).toContain('col1,col2');
  });
});
