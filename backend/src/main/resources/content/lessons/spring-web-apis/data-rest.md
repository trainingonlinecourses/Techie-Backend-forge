---
title: Spring Data REST — Complete Beginner's Guide
summary: Auto-exposing repositories as HAL+JSON APIs, pagination, filtering, projections, and when REST endpoints should be explicit instead.
order: 5
minutes: 18
topics: [spring data rest, hal, hypermedia, repositories, pagination, projections]
docs:
  - https://docs.spring.io/spring-data/rest/reference/
---

# Spring Data REST — Complete Beginner's Guide

## What Spring Data REST does

Spring Data REST automatically exposes your JPA repositories as **REST endpoints** — no controller code needed. It generates CRUD operations, pagination, sorting, and hypermedia links (HAL+JSON format).

```java
// Just define the entity and repository — Spring Data REST creates the API!
@Entity
public class Product {
    @Id @GeneratedValue
    private Long id;
    private String name;
    private BigDecimal price;
    private String category;
}

@RepositoryRestResource(collectionResourceRel = "products", path = "products")
public interface ProductRepository extends PagingAndSortingRepository<Product, Long> {
    // Spring Data REST automatically creates:
    // GET /products          → List all products (paginated)
    // GET /products/1        → Get product by ID
    // POST /products         → Create a product
    // PUT /products/1        → Update product 1
    // DELETE /products/1     → Delete product 1
    
    // Plus these derived from method names:
    List<Product> findByCategory(String category);    // GET /products/search/findByCategory?category=electronics
    Optional<Product> findByName(String name);         // GET /products/search/findByName?name=iPhone
}
```

**What you get for free:**
- CRUD endpoints for every repository
- Pagination (`?page=0&size=10`)
- Sorting (`?sort=price,desc`)
- Search endpoints (from method names)
- HAL+JSON format with hypermedia links

## HAL+JSON — what the response looks like

```json
{
  "_embedded": {
    "products": [
      {
        "id": 1,
        "name": "iPhone 15",
        "price": 999.99,
        "category": "electronics",
        "_links": {
          "self": { "href": "/products/1" },
          "product": { "href": "/products/1" }
        }
      }
    ]
  },
  "_links": {
    "self": { "href": "/products?page=0&size=10" },
    "profile": { "href": "/products" }
  },
  "page": {
    "size": 10,
    "totalElements": 50,
    "totalPages": 5,
    "number": 0
  }
}
```

**Line-by-line explanation:**
- `_embedded.products` — The actual data (list of products)
- `_links.self` — URL to get this specific resource
- `page` — Pagination metadata (current page, total pages, total items)

## Customizing endpoints

### Change the path

```java
@RepositoryRestResource(path = "catalog")  // Line 1: Use /catalog instead of /products
public interface ProductRepository extends PagingAndSortingRepository<Product, Long> {
}
```

### Disable specific HTTP methods

```java
@RepositoryRestResource
public interface ProductRepository extends PagingAndSortingRepository<Product, Long> {
    // Disable DELETE for products (no deleting allowed!)
    @RestResource(rel = "products", path = "products")
    @Override
    @Transactional
    void deleteById(@Param("id") Long id);  // This won't work — method still exists
    
    // Better approach: use @RepositoryRestResource(exported = false)
}
```

### Add custom search endpoints

```java
@RepositoryRestResource
public interface ProductRepository extends PagingAndSortingRepository<Product, Long> {
    
    // GET /products/search/findByCategoryAndPriceLessThan?category=electronics&price=500
    List<Product> findByCategoryAndPriceLessThan(
        @Param("category") String category,
        @Param("price") BigDecimal price
    );
    
    // GET /products/search/findByPriceRange?min=100&max=500
    @Query("SELECT p FROM Product p WHERE p.price BETWEEN :min AND :max")
    List<Product> findByPriceRange(
        @Param("min") BigDecimal min,
        @Param("max") BigDecimal max
    );
}
```

## Real-world scenario — product catalog API

```java
// Entity
@Entity
@Table(name = "products")
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String name;
    
    @Column(nullable = false)
    private BigDecimal price;
    
    @Column(nullable = false)
    private String category;
    
    private boolean active = true;
    
    @CreatedDate
    private LocalDateTime createdAt;
}

// Repository with custom searches
@RepositoryRestResource(collectionResourceRel = "products", path = "products")
public interface ProductRepository extends PagingAndSortingRepository<Product, Long> {
    
    // Search by category
    Page<Product> findByCategory(@Param("category") String category, Pageable pageable);
    
    // Search by name (case-insensitive)
    Page<Product> findByNameContainingIgnoreCase(@Param("name") String name, Pageable pageable);
    
    // Search by price range
    Page<Product> findByPriceBetween(
        @Param("min") BigDecimal min,
        @Param("max") BigDecimal max,
        Pageable pageable
    );
    
    // Active products only
    Page<Product> findByActiveTrue(Pageable pageable);
}
```

**Usage examples:**
```bash
# Get all products (paginated)
GET /products?page=0&size=10

# Get products by category
GET /products/search/findByCategory?category=electronics

# Get products by price range
GET /products/search/findByPriceBetween?min=100&max=500

# Search by name
GET /products/search/findByNameContainingIgnoreCase?name=phone

# Sort by price
GET /products?sort=price,desc

# Create a product
POST /products
Content-Type: application/json
{
  "name": "iPhone 15",
  "price": 999.99,
  "category": "electronics"
}
```

## When NOT to use Spring Data REST

**Use Spring Data REST when:**
- You want quick CRUD endpoints
- Your data model maps directly to your API
- You're building an admin interface
- You want HAL+JSON hypermedia

**Don't use Spring Data REST when:**
- You need complex business logic in endpoints
- Your API doesn't match your data model
- You need fine-grained control over responses
- You're building a public API (use `@RestController` instead)

## Common mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Exposing all repositories | Security risk | Use `exported = false` for internal repos |
| Returning entities directly | Leaks internal data | Use projections or DTOs |
| No pagination on large tables | Performance disaster | Always use `Pageable` |
| Missing `@Param` annotations | Search endpoints don't work | Add `@Param` to all parameters |
| Ignoring HAL format | Clients can't navigate links | Embrace hypermedia or use projections |

## Key takeaways

- Spring Data REST auto-generates CRUD endpoints from repositories
- HAL+JSON includes hypermedia links for navigation
- Custom search endpoints come from method names or `@Query`
- Use projections to control what data is exposed
- Don't use for complex business logic — use `@RestController` instead

**Official docs:** [Spring Data REST Reference](https://docs.spring.io/spring-data/rest/reference/)
