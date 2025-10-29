# Product Varieties Database - Complete Documentation

## Overview
This database is designed to manage products with multiple variations (e.g., different colors, sizes, materials). It supports flexible attributes, inventory tracking, hierarchical categories, and image management.

---

## Database Schema

### 1. **categories**
Organizes products into hierarchical categories (supports parent-child relationships).

| Column | Type | Description |
|--------|------|-------------|
| `category_id` | BIGSERIAL | Primary key |
| `category_name` | VARCHAR(100) | Category name |
| `parent_category_id` | BIGINT | Reference to parent category (NULL for top-level) |
| `created_at` | TIMESTAMPTZ | Auto-generated timestamp |
| `updated_at` | TIMESTAMPTZ | Auto-updated timestamp |

**Relationships:**
- Self-referencing: `parent_category_id` → `categories.category_id`

**Example Data:**
```
Electronics (parent_category_id: NULL)
  ├─ Laptops (parent_category_id: 1)
  └─ Phones (parent_category_id: 1)
```

---

### 2. **products**
Stores main product information (the base product without variations).

| Column | Type | Description |
|--------|------|-------------|
| `product_id` | BIGSERIAL | Primary key |
| `product_name` | VARCHAR(255) | Product name |
| `description` | TEXT | Product description |
| `category_id` | BIGINT | Foreign key to categories |
| `brand` | VARCHAR(100) | Brand name |
| `base_price` | NUMERIC(10,2) | Base/reference price |
| `is_active` | BOOLEAN | Product visibility (default: true) |
| `created_at` | TIMESTAMPTZ | Auto-generated timestamp |
| `updated_at` | TIMESTAMPTZ | Auto-updated timestamp |

**Relationships:**
- `category_id` → `categories.category_id`

**Notes:**
- `base_price` is optional - actual prices are set per variant
- `is_active` controls whether product appears in public listings

---

### 3. **attributes**
Defines variation types (e.g., Color, Size, Material, Storage).

| Column | Type | Description |
|--------|------|-------------|
| `attribute_id` | BIGSERIAL | Primary key |
| `attribute_name` | VARCHAR(50) | Attribute name (unique) |
| `display_order` | INT | Order for UI display (default: 0) |
| `created_at` | TIMESTAMPTZ | Auto-generated timestamp |

**Example Data:**
```
Color (display_order: 1)
Size (display_order: 2)
Material (display_order: 3)
Storage (display_order: 4)
```

---

### 4. **attribute_values**
Stores possible values for each attribute.

| Column | Type | Description |
|--------|------|-------------|
| `attribute_value_id` | BIGSERIAL | Primary key |
| `attribute_id` | BIGINT | Foreign key to attributes |
| `value` | VARCHAR(100) | Attribute value |
| `created_at` | TIMESTAMPTZ | Auto-generated timestamp |

**Relationships:**
- `attribute_id` → `attributes.attribute_id`

**Unique Constraint:** (`attribute_id`, `value`)

**Example Data:**
```
Color attribute:
  - Red
  - Blue
  - Black

Size attribute:
  - Small
  - Medium
  - Large
```

---

### 5. **product_variants**
Each unique combination of attributes for a product (e.g., "Red T-Shirt in Size M").

| Column | Type | Description |
|--------|------|-------------|
| `variant_id` | BIGSERIAL | Primary key |
| `product_id` | BIGINT | Foreign key to products |
| `sku` | VARCHAR(100) | Stock Keeping Unit (unique) |
| `variant_name` | VARCHAR(255) | Human-readable variant name |
| `price` | NUMERIC(10,2) | Selling price |
| `cost_price` | NUMERIC(10,2) | Cost/wholesale price |
| `stock_quantity` | INT | Available inventory (default: 0) |
| `weight` | NUMERIC(8,2) | Weight (for shipping calculations) |
| `is_available` | BOOLEAN | Availability status (default: true) |
| `created_at` | TIMESTAMPTZ | Auto-generated timestamp |
| `updated_at` | TIMESTAMPTZ | Auto-updated timestamp |

**Relationships:**
- `product_id` → `products.product_id` (CASCADE delete)

**Unique Constraint:** `sku`

**Notes:**
- Each variant has its own price, stock, and availability
- SKU must be unique across all variants

---

### 6. **variant_attributes**
Links variants to their specific attribute values (e.g., this variant is "Red" and "Large").

| Column | Type | Description |
|--------|------|-------------|
| `variant_attribute_id` | BIGSERIAL | Primary key |
| `variant_id` | BIGINT | Foreign key to product_variants |
| `attribute_value_id` | BIGINT | Foreign key to attribute_values |
| `created_at` | TIMESTAMPTZ | Auto-generated timestamp |

**Relationships:**
- `variant_id` → `product_variants.variant_id` (CASCADE delete)
- `attribute_value_id` → `attribute_values.attribute_value_id` (CASCADE delete)

**Unique Constraint:** (`variant_id`, `attribute_value_id`)

**Example:**
```
Variant: "Red T-Shirt - Medium"
  - Links to attribute_value: "Red" (Color)
  - Links to attribute_value: "Medium" (Size)
```

---

### 7. **product_images**
Stores images for products and/or specific variants.

| Column | Type | Description |
|--------|------|-------------|
| `image_id` | BIGSERIAL | Primary key |
| `product_id` | BIGINT | Foreign key to products (nullable) |
| `variant_id` | BIGINT | Foreign key to product_variants (nullable) |
| `image_url` | VARCHAR(500) | Image URL/path |
| `is_primary` | BOOLEAN | Main display image (default: false) |
| `display_order` | INT | Order for image gallery (default: 0) |
| `created_at` | TIMESTAMPTZ | Auto-generated timestamp |

**Relationships:**
- `product_id` → `products.product_id` (CASCADE delete)
- `variant_id` → `product_variants.variant_id` (CASCADE delete)

**Check Constraint:** Must have EITHER `product_id` OR `variant_id` (not both, not neither)

**Notes:**
- Product-level images: General product photos
- Variant-level images: Specific to that variant (e.g., red version photo)

---

## Database Relationships Diagram

```
categories
    ↓ (1:many)
products
    ↓ (1:many)
product_variants ← variant_attributes → attribute_values
    ↓ (1:many)                              ↑ (many:1)
product_images                          attributes

Legend:
→ Foreign key relationship
↓ One-to-many relationship
```

---

## Row Level Security (RLS) Policies

### Public Access (Unauthenticated Users)
| Table | Access | Condition |
|-------|--------|-----------|
| categories | SELECT | All records |
| products | SELECT | `is_active = true` |
| attributes | SELECT | All records |
| attribute_values | SELECT | All records |
| product_variants | SELECT | `is_available = true` |
| variant_attributes | SELECT | All records |
| product_images | SELECT | All records |

### Admin Access (Authenticated Users)
All authenticated users have full access (SELECT, INSERT, UPDATE, DELETE) to all tables.

**Security Note:** Current setup treats all authenticated users as admins. For production, implement role-based access control.

---

## Common Queries

### Get Product with All Variants and Attributes
```sql
SELECT 
    p.product_id,
    p.product_name,
    p.description,
    pv.variant_id,
    pv.sku,
    pv.price,
    pv.stock_quantity,
    json_agg(
        json_build_object(
            'attribute', a.attribute_name,
            'value', av.value
        )
    ) as attributes
FROM products p
JOIN product_variants pv ON p.product_id = pv.product_id
JOIN variant_attributes va ON pv.variant_id = va.variant_id
JOIN attribute_values av ON va.attribute_value_id = av.attribute_value_id
JOIN attributes a ON av.attribute_id = a.attribute_id
WHERE p.product_id = 1
GROUP BY p.product_id, pv.variant_id;
```

### Get All Available Variants for a Product
```sql
SELECT 
    pv.*,
    string_agg(av.value, ' / ' ORDER BY a.display_order) as variant_description
FROM product_variants pv
JOIN variant_attributes va ON pv.variant_id = va.variant_id
JOIN attribute_values av ON va.attribute_value_id = av.attribute_value_id
JOIN attributes a ON av.attribute_id = a.attribute_id
WHERE pv.product_id = 1 AND pv.is_available = true
GROUP BY pv.variant_id;
```

### Get Products by Category (including subcategories)
```sql
WITH RECURSIVE category_tree AS (
    SELECT category_id FROM categories WHERE category_id = 1
    UNION
    SELECT c.category_id 
    FROM categories c
    JOIN category_tree ct ON c.parent_category_id = ct.category_id
)
SELECT p.* 
FROM products p
WHERE p.category_id IN (SELECT category_id FROM category_tree)
AND p.is_active = true;
```

### Check Stock Availability
```sql
SELECT 
    p.product_name,
    pv.sku,
    pv.stock_quantity,
    CASE 
        WHEN pv.stock_quantity > 10 THEN 'In Stock'
        WHEN pv.stock_quantity > 0 THEN 'Low Stock'
        ELSE 'Out of Stock'
    END as stock_status
FROM product_variants pv
JOIN products p ON pv.product_id = p.product_id
WHERE pv.is_available = true;
```

---

## Typical Data Flow

### Creating a Product with Variants

1. **Create attributes** (one-time setup):
   - Color, Size, Material, etc.

2. **Create attribute values** (one-time setup):
   - Red, Blue, Black (for Color)
   - S, M, L, XL (for Size)

3. **Create category** (if needed)

4. **Create product**:
   - Basic product info
   - Set base price (optional)

5. **Create product variants**:
   - One variant for each combination (e.g., Red-Small, Red-Medium, etc.)
   - Set individual price, SKU, stock for each

6. **Link variants to attributes**:
   - Connect each variant to its attribute values via `variant_attributes`

7. **Upload images**:
   - General product images (linked to `product_id`)
   - Variant-specific images (linked to `variant_id`)

---

## API Connection Info

### Supabase Connection Details
```
Project URL: [Your Supabase Project URL]
Anon/Public Key: [Your Anon Key]
Service Role Key: [Your Service Role Key - Keep Secret!]
```

### JavaScript/TypeScript Example
```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

---

## UI Development Recommendations

### Admin Dashboard Features
1. **Product Management**
   - Create/edit/delete products
   - Manage categories
   - Bulk variant creation
   - Stock management
   - Image upload

2. **Attribute Management**
   - Define new attributes
   - Add attribute values
   - Reorder display priority

3. **Inventory Tracking**
   - Stock levels dashboard
   - Low stock alerts
   - Stock history

### Customer-Facing Features
1. **Product Listing**
   - Filter by category
   - Search functionality
   - Sort by price, popularity

2. **Product Detail Page**
   - Variant selector (dropdown/buttons for each attribute)
   - Dynamic price/stock updates
   - Image gallery
   - Add to cart

3. **Variant Selection UX**
   - Show all available combinations
   - Disable unavailable variants
   - Update price in real-time

---

## Notes for Developers

### Important Considerations
1. **Variant Generation**: Creating all possible combinations can result in many variants. Consider limiting or generating on-demand.

2. **Stock Management**: Implement proper concurrency handling for stock updates to prevent overselling.

3. **Image Storage**: Use Supabase Storage for images, store URLs in `product_images.image_url`.

4. **Search**: Consider adding full-text search indexes on `product_name` and `description`.

5. **Caching**: Product data changes infrequently - implement caching for performance.

6. **Soft Deletes**: Consider using `is_active`/`is_available` flags instead of hard deletes.

### Potential Enhancements
- Add `product_reviews` table
- Add `discount_rules` for pricing
- Add `product_tags` for better searchability
- Add `inventory_history` for audit trail
- Add `supplier` information
- Implement multi-currency support

---

## Support & Resources

- **Supabase Docs**: https://supabase.com/docs
- **Supabase JavaScript Client**: https://supabase.com/docs/reference/javascript
- **PostgreSQL Docs**: https://www.postgresql.org/docs/

---

**Database Version**: 1.0  
**Last Updated**: October 2025  
**Database Type**: PostgreSQL (via Supabase)