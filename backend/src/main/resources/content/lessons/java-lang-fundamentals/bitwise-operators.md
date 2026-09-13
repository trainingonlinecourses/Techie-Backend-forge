---
title: Bitwise Operators — The Hidden Machinery of Integers
summary: & is AND, | is OR, ^ is XOR, ~ is NOT, and <<, >>, >>> shift bits. They look obscure and appear everywhere in real backends — permission flags, hashing, and fast modulo by powers of two. This lesson builds bit thinking from scratch with runnable examples.
order: 5
minutes: 22
topics: [bitwise, operators, binary, shift, flags, bitmask, xor, integers]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/op3.html
capstone: false
---

## The Concept, From Zero

An `int` is 32 bits. You normally treat it as one number, but every operator you already know (`+`, `%`, `==`) is implemented as bit operations underneath. The bitwise operators let you work at that lower level directly — and once you can read them, you start seeing them in production code: file permission flags, hash functions, network protocols, `HashMap` internals.

### Reading binary first

Java writes binary literals with a `0b` prefix. Each bit position is worth a power of two:

```java
int a = 0b1010;   // 10  — 8 + 2
int b = 0b0110;   // 6   — 4 + 2
```

The four logic operators compare two numbers **bit by bit**, position by position:

| Operator | Name | Rule (per bit) |
|---|---|---|
| `&` | AND | 1 only if **both** are 1 |
| `\|` | OR | 1 if **at least one** is 1 |
| `^` | XOR | 1 if the bits are **different** |
| `~` | NOT | flips every bit (unary) |

```java
public class BitLogic {
    public static void main(String[] args) {
        int a = 0b1010;   // 10
        int b = 0b0110;   // 6

        System.out.println(a & b);   // 2   — 0b0010: only bit 1 is set in both
        System.out.println(a | b);   // 14  — 0b1110: any bit set in either
        System.out.println(a ^ b);   // 12  — 0b1100: bits where they differ
        System.out.println(~a);      // -11 — every bit of 10 flipped (see two's complement below)
    }
}
```

Reading `&` as a "filter" is the mental model that sticks: `a & b` keeps only the bits both numbers agree on. Reading `|` as a "merge": the result has every bit either side set.

### Shifts: multiply and divide by powers of two

The shift operators slide bits left or right:

```java
public class Shifts {
    public static void main(String[] args) {
        int n = 13;               // 0b1101

        System.out.println(n << 1);    // 26  — every bit slides left; like n * 2
        System.out.println(n << 3);    // 104 — like n * 8
        System.out.println(n >> 1);    // 6   — slides right; like n / 2, floor
        System.out.println(n >> 2);    // 3   — like n / 4, floor

        int negative = -13;
        System.out.println(negative >> 1);   // -7 — sign-extends: stays negative
        System.out.println(negative >>> 1);  // huge positive — fills with 0s, ignores sign
    }
}
```

- `<< n` shifts left: each position doubles the value — `x << n` equals `x * 2^n` (until bits overflow off the left edge).
- `>> n` shifts right arithmetically: divides by `2^n` rounding down, and keeps the sign (a negative number stays negative).
- `>>> n` shifts right logically: fills with zeros regardless of sign. Only meaningful for negative numbers; for positives it matches `>>`.

Two everyday uses:

```java
if ((n & 1) == 0) { }        // even check: the last bit of an even number is 0

int fastMod = n & 15;        // n % 16 — works ONLY for powers of two
```

The `& 15` trick is exactly how `HashMap` picks a bucket: `(table.length - 1) & hash`, which is why its capacity is always a power of two. A modulo by a power of two is the same as ANDing off the high bits — and it's a single CPU instruction.

### Flags: many booleans in one int

The classic backend use. Instead of eight booleans, one `int` holds eight independent on/off flags — one bit each:

```java
public class Permissions {
    public static void main(String[] args) {
        final int READ = 1;        // 0b0001
        final int WRITE = 2;       // 0b0010
        final int EXECUTE = 4;     // 0b0100  — powers of two: one bit each

        int perms = READ | WRITE;      // set: 0b0011
        System.out.println(perms);     // 3

        boolean canRead = (perms & READ) != 0;      // test one flag
        System.out.println(canRead);                // true

        perms |= EXECUTE;              // add a flag
        perms &= ~WRITE;               // clear a flag — AND with the inverted mask
        System.out.println(Integer.toBinaryString(perms));  // 101
    }
}
```

Each flag must be a distinct power of two so masks never overlap. `EnumSet` and `BitSet` are the modern, safer versions of this pattern — but the bit idiom survives in file systems, network protocols, and half the JDK.

### Why ~10 is -11 (two's complement in one paragraph)

Integers in Java encode negatives in **two's complement**: to negate, flip all bits and add 1. So `~a` (flip all bits) equals `-a - 1`. `~10` = `-11`, which is what the example printed. That's also why `>>` on a negative number sign-extends: the top bit is the sign, and arithmetic shift preserves it.

## Common Mistakes

- **Precedence** — `&` binds tighter than `==`, so `if (x & 1 == 0)` compiles but means `x & (1 == 0)`. Parenthesize: `if ((x & 1) == 0)`.
- **`&` vs `&&`, `|` vs `||`** — on booleans, `&`/`|` evaluate *both* sides (no short-circuit). On integers they're bitwise. Same symbols, different worlds.
- **`>>` on negative numbers** — if you need pure bit movement (serialization, hashing), use `>>>`; `>>` preserves the sign and can surprise you.
- **Fast-modulo on non-powers-of-two** — `n & 15` is `n % 16` only because 16 is a power of two. `n & 10` is not `n % 11` and means nothing useful.
- **Signed overflow in shifts** — `1 << 40` is nonsense (shifts use only the low 5 bits of the operand on `int`); use `long` math when values can exceed 2^31.

## Quick Checklist

- [ ] I can compute `a & b`, `a | b`, `a ^ b` for two small binary numbers by hand.
- [ ] I can explain `x << n` and `x >> n` as multiplication/division by powers of two.
- [ ] I can set, test, clear, and toggle a bit flag in an `int`.
- [ ] I can explain why `(n & (cap - 1))` replaces `n % cap` when `cap` is a power of two.

## References

- [Oracle — Bitwise and Bit Shift Operators](https://docs.oracle.com/javase/tutorial/java/nutsandbolts/op3.html)
- [GeeksforGeeks — Bitwise Operators in Java](https://www.geeksforgeeks.org/bitwise-operators-in-java/)
- [dev.java — Operators](https://dev.java/learn/language-basics/performing-calculations/)
- [W3Schools — Java Operators](https://www.w3schools.com/java/java_operators.asp)
- [Learn Java Online — Interactive exercises](https://www.learnjavaonline.org/)
