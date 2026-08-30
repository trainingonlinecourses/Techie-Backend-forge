---
title: Multi-Dimensional Arrays — Matrices, Jagged Arrays, and Real Data
summary: How Java multi-dimensional arrays actually work (arrays of arrays), jagged arrays, Matrix operations, and when to use arrays vs collections for numerical data.
order: 2
minutes: 20
topics: ["2D arrays", "jagged arrays", "matrix", "array of arrays", "Arrays.copyOf", "System.arraycopy"]
docs:
  - url: "https://docs.oracle.com/javase/tutorial/java/nutsandbolts/arrays.html"
    title: "Arrays (The Java Tutorials)"
---

## The Concept, From Zero

A 2D array in Java is actually **an array of arrays** — not a true matrix. Each row can be a different length (jagged array), which is different from languages like C or Python.

```java
// This creates 3 rows, each row is an int[] array
int[][] grid = new int[3][4];

// Access element at row 1, column 2
grid[1][2] = 42;

// Print the shape
System.out.println("Rows: " + grid.length);        // 3
System.out.println("Cols: " + grid[0].length);     // 4
```

### Line-by-Line Breakdown

```java
int[][] grid = new int[3][4];
```
- `int[][]` — The type is "array of arrays of int"
- `new int[3]` — Creates an array of 3 elements, each element is a reference
- `[4]` — Each of those 3 elements is initialized as an `int[4]`
- In memory: 1 outer array + 3 inner arrays (each with 4 ints)

```java
grid[1][2] = 42;
```
- `grid[1]` → gets the second inner array (row 1)
- `[2]` → gets the third element in that row
- Java checks bounds: throws `ArrayIndexOutOfBoundsException` if out of range

---

## Jagged Arrays — Rows of Different Lengths

```java
// Create a jagged array where each row has a different number of columns
int[][] jagged = new int[3][];

jagged[0] = new int[]{1, 2, 3};        // Row 0: 3 columns
jagged[1] = new int[]{4, 5, 6, 7, 8};  // Row 1: 5 columns
jagged[2] = new int[]{9};               // Row 2: 1 column

// Print each row
for (int row = 0; row < jagged.length; row++) {
    System.out.print("Row " + row + " (" + jagged[row].length + " cols): ");
    for (int col = 0; col < jagged[row].length; col++) {
        System.out.print(jagged[row][col] + " ");
    }
    System.out.println();
}
// Output:
// Row 0 (3 cols): 1 2 3
// Row 1 (5 cols): 4 5 6 7 8
// Row 2 (1 cols): 9
```

**Why jagged arrays exist:**
- A calendar: February has 28/29 days, other months have 30/31
- A dependency graph: each node has a different number of dependencies
- Sparse matrices: most rows are nearly empty, save memory

---

## Matrix Operations

```java
public class MatrixOps {

    /**
     * Multiply two matrices.
     * 
     * Time complexity: O(n³) — for each element, we do n multiplications.
     * For large matrices (>1000x1000), use parallel streams or specialized libraries.
     */
    public static int[][] multiply(int[][] a, int[][] b) {
        int rowsA = a.length;
        int colsA = a[0].length;
        int colsB = b[0].length;

        int[][] result = new int[rowsA][colsB];

        for (int i = 0; i < rowsA; i++) {          // For each row in A
            for (int j = 0; j < colsB; j++) {      // For each column in B
                int sum = 0;
                for (int k = 0; k < colsA; k++) {  // Dot product
                    sum += a[i][k] * b[k][j];
                }
                result[i][j] = sum;
            }
        }
        return result;
    }

    /**
     * Transpose a matrix (swap rows and columns).
     */
    public static int[][] transpose(int[][] matrix) {
        int rows = matrix.length;
        int cols = matrix[0].length;
        int[][] transposed = new int[cols][rows];

        for (int i = 0; i < rows; i++) {
            for (int j = 0; j < cols; j++) {
                transposed[j][i] = matrix[i][j];
            }
        }
        return transposed;
    }

    /**
     * Print a matrix in readable format.
     */
    public static void print(int[][] matrix) {
        for (int[] row : matrix) {
            for (int val : row) {
                System.out.printf("%4d", val);
            }
            System.out.println();
        }
    }
}
```

---

## Array Copying — System.arraycopy vs Arrays.copyOf

```java
int[] original = {1, 2, 3, 4, 5};

// Method 1: System.arraycopy (fastest, low-level)
int[] copy1 = new int[original.length];
System.arraycopy(original, 0, copy1, 0, original.length);

// Method 2: Arrays.copyOf (convenience)
int[] copy2 = Arrays.copyOf(original, original.length);

// Method 3: clone (shallow copy)
int[] copy3 = original.clone();

// Method 4: Manual loop (slowest, most control)
int[] copy4 = new int[original.length];
for (int i = 0; i < original.length; i++) {
    copy4[i] = original[i];
}

// For 2D arrays — note: only copies the outer array!
int[][] original2D = {{1, 2}, {3, 4}};
int[][] shallow = original2D.clone();  // shallow[0] == original2D[0] ← same reference!

// Deep copy of 2D array
int[][] deep = new int[original2D.length][];
for (int i = 0; i < original2D.length; i++) {
    deep[i] = original2D[i].clone();
}
```

---

## When to Use Arrays vs Collections

| Use Arrays When | Use Collections When |
|----------------|---------------------|
| Fixed size known at compile time | Size changes dynamically |
| Performance-critical numerical computation | Need add/remove operations |
| Working with primitive types (int, double) | Need generics or type safety |
| Interfacing with native code or APIs | Need List/Map/Set methods |
| Memory is very constrained | Code readability matters more |

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| `grid[3][4]` when grid is `new int[3][4]` | Index 3 is out of bounds (0-2) | Use `grid.length - 1` for last index |
| `grid[i] = new int[]{1,2}` after `new int[3][4]` | Can't reassign final-length array row | Design with jagged arrays from the start |
| Forgetting arrays are 0-indexed | Off-by-one errors | Use `for(int i=0; i<arr.length; i++)` |
| Assuming `==` compares contents | It compares references | Use `Arrays.equals(a, b)` for content comparison |
| `new int[3][4]` creates 12 objects | Actually 4 objects (1 outer + 3 inner) | That's fine — JVM optimizes this |
