/**
 * A fixed-size set of small integers (item indexes), packed 32 per word. Every operation is a
 * word-wise loop, so combining two sets of 10k items touches ~313 words. Binary operations
 * mutate `this` and return it; operands are never modified.
 */
export class Bitset {
  readonly words: Uint32Array;

  constructor(readonly size: number) {
    this.words = new Uint32Array((size + 31) >>> 5);
  }

  static of(size: number, members: Iterable<number>): Bitset {
    const b = new Bitset(size);
    for (const i of members) b.add(i);
    return b;
  }

  clone(): Bitset {
    const b = new Bitset(this.size);
    b.words.set(this.words);
    return b;
  }

  add(i: number): this {
    this.words[i >>> 5] |= 1 << (i & 31);
    return this;
  }

  has(i: number): boolean {
    return (this.words[i >>> 5] & (1 << (i & 31))) !== 0;
  }

  or(o: Bitset): this {
    const w = this.words, v = o.words;
    for (let i = 0; i < w.length; i++) w[i] |= v[i];
    return this;
  }

  and(o: Bitset): this {
    const w = this.words, v = o.words;
    for (let i = 0; i < w.length; i++) w[i] &= v[i];
    return this;
  }

  andNot(o: Bitset): this {
    const w = this.words, v = o.words;
    for (let i = 0; i < w.length; i++) w[i] &= ~v[i];
    return this;
  }

  xor(o: Bitset): this {
    const w = this.words, v = o.words;
    for (let i = 0; i < w.length; i++) w[i] ^= v[i];
    return this;
  }

  /** Complement within [0, size). */
  not(): this {
    const w = this.words;
    for (let i = 0; i < w.length; i++) w[i] = ~w[i];
    const tail = this.size & 31;
    if (tail && w.length) w[w.length - 1] &= (1 << tail) - 1;
    return this;
  }

  count(): number {
    let n = 0;
    for (let x of this.words) {
      x -= (x >>> 1) & 0x55555555;
      x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
      n += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    }
    return n;
  }

  *[Symbol.iterator](): IterableIterator<number> {
    const w = this.words;
    for (let i = 0; i < w.length; i++) {
      let x = w[i];
      while (x) {
        const low = x & -x;
        yield (i << 5) + (31 - Math.clz32(low));
        x ^= low;
      }
    }
  }
}
