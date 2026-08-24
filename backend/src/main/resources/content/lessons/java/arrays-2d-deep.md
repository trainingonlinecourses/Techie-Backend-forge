---
title: Two-Dimensional Arrays — Matrices, Jagged Arrays, and Real-World Grids
summary: How 2D arrays work in memory, jagged vs rectangular arrays, why most teams wrap them in Lists, matrix traversal patterns, and common bugs with row-major layout.
order: 58
minutes: 18
topics: [2d-array, matrix, jagged-array, row-major, array-of-arrays, grid-traversal]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/arrays.html
  - https://docs.oracle.com/javase/tutorial/java/javaOO/arrays.html
---

# Two-Dimensional Arrays — Matrices, Jagged Arrays, and Real-World Grids

## The concept — what IS a 2D array?

A 2D array in Java is an **array of arrays**. When you write `int[][] grid = new int[3][4]`, Java creates:

1. One array object (length 3) holding three **references** (one per row).
2. Three separate array objects (each length 4) holding the actual `int` values.

This is important: **the rows are independent objects**. This is why "jagged arrays" (rows of different lengths) are possible in Java but not in languages like C where 2D arrays are flat blocks of memory.

### Beginner mental model

Think of a spreadsheet. A 2D array is a grid with rows and columns. `grid[2][3]` means "go to row 2, column 3." In Java, row indexing starts at 0, so `grid[0][0]` is the top-left cell.

### How memory actually works

```
grid (reference) → [ ref0, ref1, ref2 ]    ← the "outer" array (3 rows)
                       ↓      ↓      ↓
                    [a,b,c,d] [e,f,g,h] [i,j,k,l]  ← each is a separate object (4 columns)
```

When you iterate, the **first index** selects the row (the inner array), and the **second index** selects the column within that row.

## Creating 2D arrays — three ways

```java
// Way 1: rectangular array (all rows same length)
int[][] grid = new int[3][4];    // 3 rows, 4 columns, all zeros

// Way 2: jagged array (rows can differ in length)
int[][] jagged = new int[3][];   // 3 rows, but columns not yet created
jagged[0] = new int[2];         // row 0 has 2 columns
jagged[1] = new int[5];         // row 1 has 5 columns
jagged[2] = new int[1];         // row 2 has 1 column

// Way 3: initializer (compile-time known values)
int[][] matrix = {
    {1, 2, 3},
    {4, 5, 6},
    {7, 8, 9}
};
```

**Line by line:**
- `new int[3][4]` — Java allocates the outer array AND three inner arrays of length 4 in one go.
- `new int[3][]` — Java allocates only the outer array. Each `jagged[i]` is `null` until you assign a new array to it.
- The initializer syntax `{ {1,2,3}, {4,5,6} }` is syntactic sugar for creating both levels at once.

## Iterating a 2D array

```java
int[][] matrix = {
    {1, 2, 3},
    {4, 5, 6},
    {7, 8, 9}
};

// Classic nested for-loop
for (int row = 0; row < matrix.length; row++) {        // outer loop: iterate rows
    for (int col = 0; col < matrix[row].length; col++) { // inner loop: iterate columns
        System.out.print(matrix[row][col] + " ");       // access element at [row][col]
    }
    System.out.println();                                // newline after each row
}

// Enhanced for-loop (when you don't need the index)
for (int[] row : matrix) {           // each row is an int[]
    for (int value : row) {          // each value is an int
        System.out.print(value + " ");
    }
    System.out.println();
}
```

**Why `matrix[row].length` and not `matrix[0].length`?** Because in a jagged array, each row can have a different length. Always use `matrix[row].length` to get the correct column count for that specific row.

## Common mistake: the "shallow copy" trap

```java
int[][] original = { {1, 2}, {3, 4} };

// SHALLOW copy — both variables point to the SAME inner arrays
int[][] shallowCopy = original;
shallowCopy[0][0] = 999;
System.out.println(original[0][0]); // prints 999! original is modified!

// DEEP copy — each inner array is independently cloned
int[][] deepCopy = new int[original.length][];
for (int i = 0; i < original.length; i++) {
    deepCopy[i] = original[i].clone();  // clone each row independently
}
deepCopy[0][0] = 999;
System.out.println(original[0][0]); // prints 1 — original is safe
```

**Why this happens:** `int[][] shallowCopy = original` copies the reference to the outer array. Both `original` and `shallowCopy` point to the same object. Changing `shallowCopy[0]` changes `original[0]` because they are literally the same inner array. `clone()` creates a new array object with the same values.

## How we use it in organizations

### Scenario 1: Seat reservation system (airline/ cinema)

A cinema has 10 rows with varying seat counts (front rows are narrower). A 2D jagged array models this perfectly:

```java
public class CinemaSeating {
    // 0 = available, 1 = occupied, -1 = blocked (aisle/structural)
    private final int[][] seats;

    public CinemaSeating(int totalRows) {
        this.seats = new int[totalRows][];            // create row references
        for (int i = 0; i < totalRows; i++) {
            // Front rows (0-2) have 8 seats, middle rows (3-6) have 12, back rows have 16
            if (i < 3) seats[i] = new int[8];
            else if (i < 7) seats[i] = new int[12];
            else seats[i] = new int[16];
        }
    }

    // Mark a seat as occupied; returns true if successful
    public boolean reserve(int row, int col) {
        if (row < 0 || row >= seats.length) return false;     // bounds check row
        if (col < 0 || col >= seats[row].length) return false; // bounds check column
        if (seats[row][col] != 0) return false;                // already taken or blocked

        seats[row][col] = 1;   // mark occupied
        return true;
    }

    // Count total available seats across all rows
    public int availableCount() {
        int count = 0;
        for (int row = 0; row < seats.length; row++) {
            for (int col = 0; col < seats[row].length; col++) {
                if (seats[row][col] == 0) count++;   // available = 0
            }
        }
        return count;
    }

    // Print a visual map of the cinema
    public void printMap() {
        for (int row = 0; row < seats.length; row++) {
            System.out.printf("Row %2d: ", row);
            for (int col = 0; col < seats[row].length; col++) {
                System.out.print(seats[row][col] == 0 ? "[ ]" :
                                 seats[row][col] == 1 ? "[X]" : "[#]");
            }
            System.out.println();
        }
    }
}
```

### Scenario 2: Image processing (pixel grid)

A grayscale image is a 2D array where each value is a brightness (0-255). Applying a brightness filter:

```java
public class ImageFilter {

    // Apply brightness adjustment to every pixel
    public static int[][] adjustBrightness(int[][] pixels, int delta) {
        int rows = pixels.length;
        int cols = pixels[0].length;       // assuming rectangular image
        int[][] result = new int[rows][cols];

        for (int y = 0; y < rows; y++) {         // y = row = vertical
            for (int x = 0; x < cols; x++) {     // x = column = horizontal
                int adjusted = pixels[y][x] + delta;       // add brightness
                result[y][x] = Math.max(0, Math.min(255, adjusted)); // clamp 0-255
            }
        }
        return result;
    }

    // Apply a 3x3 box blur (average each pixel with its neighbors)
    public static int[][] boxBlur(int[][] pixels) {
        int rows = pixels.length;
        int cols = pixels[0].length;
        int[][] blurred = new int[rows][cols];

        for (int y = 1; y < rows - 1; y++) {       // skip border pixels
            for (int x = 1; x < cols - 1; x++) {
                int sum = 0;
                for (int dy = -1; dy <= 1; dy++) {       // 3x3 neighborhood
                    for (int dx = -1; dx <= 1; dx++) {
                        sum += pixels[y + dy][x + dx];   // sum all 9 neighbors
                    }
                }
                blurred[y][x] = sum / 9;                 // average of 9 pixels
            }
        }
        return blurred;
    }
}
```

### Scenario 3: Dynamic programming — longest common subsequence

2D arrays are the backbone of dynamic programming. The LCS algorithm fills a grid where `dp[i][j]` represents the answer for the first `i` chars of string A and first `j` chars of string B:

```java
public static int longestCommonSubsequence(String text1, String text2) {
    int m = text1.length();
    int n = text2.length();
    int[][] dp = new int[m + 1][n + 1];  // +1 for the empty-string base case

    for (int i = 1; i <= m; i++) {               // for each character in text1
        for (int j = 1; j <= n; j++) {           // for each character in text2
            if (text1.charAt(i - 1) == text2.charAt(j - 1)) {
                dp[i][j] = dp[i - 1][j - 1] + 1;   // match: take diagonal + 1
            } else {
                dp[i][j] = Math.max(dp[i - 1][j],   // skip char from text1
                                    dp[i][j - 1]);   // skip char from text2
            }
        }
    }
    return dp[m][n];  // bottom-right cell = full answer
}
```

**Why `dp[m+1][n+1]`?** The extra row and column (index 0) represent the empty string. When either string is empty, the LCS is 0 — this is our base case without special `if` checks.

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `matrix[0].length` for jagged arrays | Wrong column count — ArrayIndexOutOfBoundsException |
| Forgetting to `.clone()` when copying | Shallow copy — modifying one array changes both |
| Allocating `new int[rows][cols]` then reassigning `matrix[i]` | Wasted allocation — the original inner arrays become garbage |
| Off-by-one: `i <= matrix.length` instead of `i < matrix.length` | ArrayIndexOutOfBoundsException on the last row |
| Not checking `matrix[row].length` before accessing `matrix[row][col]` | Crash on jagged arrays where rows differ |
