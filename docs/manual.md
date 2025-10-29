# Express CMS - Manual

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Managing Products](#managing-products)
4. [Product Variants](#product-variants)
5. [Custom Fields](#custom-fields)
6. [Bulk Import](#bulk-import)
7. [Images & Media](#images--media)
8. [Integrating with Your Website](#integrating-with-your-website)
9. [Tips & Best Practices](#tips--best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

### What is Express Web CMS?

Express Web CMS is a powerful, easy-to-use content management system designed specifically for Indian industrial businesses. It helps you manage your product catalog, create variants, and seamlessly display products on your website.

### Key Features

**Product Management** - Add, edit, and delete products with ease  
**Variant Support** - Handle multiple sizes, finishes, and specifications  
**Custom Fields** - Add any additional information you need (HSN Code, Material, etc.)  
**Bulk Import** - Import hundreds of products from CSV files  
**Image Upload** - Upload and manage product images  
**Public API** - Automatically display products on your website  
**WhatsApp Integration** - Enable customers to request quotes via WhatsApp  

---

## Getting Started

### Logging In

1. Navigate to your CMS URL (e.g., `https://cms.yourcompany.com`)
2. Enter your email address and password
3. Click **Login**

### Dashboard Overview

After logging in, you'll see your Dashboard with:
- **Total product count**
- **Product grid** showing all your products
- **Add Product button** to create new products
- **Import CSV button** for bulk uploads

---

## Managing Products

### Adding a New Product

1. Click **Add Product** button in the dashboard header
2. Fill in the basic information:
   - **Product Name*** (required) - e.g., "S-106 Cabinet Handle"
   - **Description** - Detailed product information
   - **Category** - e.g., "Handles", "Knobs", "Legs"
   - **Base Price** - Starting price in ₹ (optional if you have variants)

3. **Upload Product Images**
   - Click **Choose File** under Product Images
   - Select one or more images (JPG, PNG, WEBP)
   - Preview will appear below

4. Click **Create Product** to save

### Editing a Product

1. Go to Dashboard
2. Find the product you want to edit
3. Click the **Edit** button on the product card
4. Make your changes
5. Click **Update Product** to save

### Deleting a Product

1. Go to Dashboard
2. Find the product you want to delete
3. Click the **Delete** button
4. Confirm the deletion

**Warning**: Deleting a product will also delete all its variants. This action cannot be undone.

---

## Product Variants

### What are Variants?

Variants allow you to offer the same product in different configurations. For example:
- A cabinet handle in different **sizes** (96MM, 128MM, 160MM)
- With different **finishes** (Matt, Glossy, Black, P-Gold)

### Creating Variants

1. When adding or editing a product, check the box: **"This product has variants"**

2. Click **+ Add Option** to create a variant dimension:
   - **Option Name**: e.g., "Size"
   - **Values**: Enter comma-separated values: `96MM, 128MM, 160MM, 192MM`
   - Click away from the input to see the parsed values

3. Add another option:
   - **Option Name**: e.g., "Finish"
   - **Values**: `Matt, Glossy, Black, P-Gold, P-R.Gold`

4. Click **Generate Variants**
   - The system will create all possible combinations
   - For example: 4 sizes × 5 finishes = 20 variants

5. **Enable and Price Your Variants**:
   - Check the box next to each variant you actually stock
   - Enter the price for each enabled variant
   - Optionally add SKU codes

6. Click **Create Product**

### Example: Cabinet Handle with Variants

**Product Name**: S-106 Cabinet Handle  
**Variant Option 1**: Size → 96MM, 128MM, 160MM  
**Variant Option 2**: Finish → Matt, Glossy, Black, P-Gold  

**Generated Variants** (12 total):
- ☑ 96MM - Matt (₹132)
- ☑ 96MM - Glossy (₹168)
- ☑ 96MM - Black (₹204)
- ☑ 96MM - P-Gold (₹240)
- ☑ 128MM - Matt (₹168)
- ... and so on

Only the checked variants will appear on your website.

### Tips for Variants

**Only enable variants you actually stock** - Unchecked variants won't show on your website  
**Use consistent naming** - "96MM" not "96 mm" or "96mm"  
**Set accurate prices** - Price for each variant can be different  
**Add SKU codes** - Helps with inventory tracking (optional)  

---

## Custom Fields

### What are Custom Fields?

Custom Fields let you add any additional information to your products beyond the standard fields. This is perfect for:
- **HSN Code** (for GST/taxation)
- **Material** (Steel, Brass, Aluminum)
- **Packing Size** (units per box)
- **Weight**, **Dimensions**, etc.

### Adding Custom Fields

1. When adding or editing a product, scroll to **Custom Fields** section
2. Click **+ Add Custom Field**
3. Enter the field name (e.g., "HSN Code")
4. Enter the field value (e.g., "83024900")
5. Add as many custom fields as you need
6. Click **Create Product** or **Update Product**

### Example Custom Fields

**For Industrial Products:**
- HSN Code: 83024900
- Material: Stainless Steel
- Packing Size: 50
- Weight: 25g
- Finish Type: PVD Coating

---

## Bulk Import

### Preparing Your CSV File

The bulk import feature lets you upload hundreds of products at once from a CSV file.

**Required Columns:**
- Product Code
- Product Name
- Category
- Size (MM / Inch)
- Colour / Finish
- MRP (INR)

**Optional Columns** (will be saved as custom fields):
- Short Description
- Full Description
- HSN Code
- Material
- Packing Size
- Variant Code
- Product Image URL
- Notes

### CSV Format Example

```csv
Product Code,Product Name,Category,Size (MM / Inch),Colour / Finish,MRP (INR),HSN Code,Material
S-106,S-106 Cabinet Handle,Handles,96MM,Matt,132,83024900,Steel
S-106,S-106 Cabinet Handle,Handles,96MM,Glossy,168,83024900,Steel
S-106,S-106 Cabinet Handle,Handles,128MM,Matt,168,83024900,Steel
```

### Importing Products

1. Click **Import CSV** button in dashboard header
2. Click **Choose File** and select your CSV
3. Review the **Preview** showing first 5 rows
4. Check the **Parsed Data Summary**:
   - Total Products
   - Total Variants
   - Categories detected
5. Click **Import X Products** button
6. Wait for the progress bar to complete (2-3 minutes for 200+ products)
7. You'll see a success message when done

### Import Tips

💡 **Group variants together** - Use the same Product Code for variants  
💡 **Clean your data** - Remove extra spaces, fix typos  
💡 **Test with a small file first** - Import 5-10 products to verify format  
💡 **Image URLs** - Must be full URLs (https://...)  
💡 **Backup your data** - Keep the original CSV file  

---

## Images & Media

### Uploading Product Images

**Accepted formats**: JPG, JPEG, PNG, WEBP  
**Maximum size**: 10MB per image  
**Multiple images**: Yes, upload as many as needed

### Best Practices for Product Images

**Use clear, well-lit photos**  
**White or neutral background** works best  
**Multiple angles** - front, side, detail shots  
**Consistent sizing** - similar dimensions for all products  
**Compress images** before uploading (use tools like TinyPNG)  
**Name files clearly** - "s-106-handle-matt.jpg" not "IMG_1234.jpg"  

### Image Optimization Tips

**Recommended image size**: 800x800 to 1200x1200 pixels  
**Keep file size under 500KB** for faster loading  
**Use JPG for photos**, PNG for graphics with transparency  

---

## Integrating with Your Website

### Getting Your Business ID

1. Go to Dashboard
2. Open browser console (press F12)
3. Type: `currentBusiness.id` and press Enter
4. Copy the ID (looks like: `business_abc123`)

### Adding Products to Your Website

Add this code to your website where you want products to appear:

```html
<!-- Add this in your HTML <head> -->
<script src="https://cdn.jsdelivr.net/npm/appwrite@13.0.1"></script>

<!-- Add this before closing </body> tag -->
<script>
  const BUSINESS_ID = 'YOUR_BUSINESS_ID_HERE'; // Replace with your actual Business ID
  const API_URL = 'https://your-cms-url.com'; // Your CMS URL

  fetch(`${API_URL}/api/products?businessId=${BUSINESS_ID}`)
    .then(response => response.json())
    .then(data => {
      console.log('Products loaded:', data.products);
      // Display products in your website
    });
</script>
```

### API Response Format

```json
{
  "success": true,
  "count": 10,
  "products": [
    {
      "id": "product_id",
      "name": "S-106 Cabinet Handle",
      "description": "Elegant cabinet handle",
      "category": "Handles",
      "basePrice": 132,
      "images": ["https://..."],
      "hasVariants": true,
      "variants": [
        {
          "variantName": "96MM - Matt",
          "attributes": {
            "Size": "96MM",
            "Finish": "Matt"
          },
          "price": 132,
          "sku": "S-106-96-MATT",
          "enabled": true
        }
      ]
    }
  ]
}
```

---

## Tips & Best Practices

### Product Naming

**Be specific**: "S-106 Fancy Cabinet Handle" not just "Handle"  
**Include key features**: Size, material, or unique identifier  
**Consistent format**: Stick to one naming pattern  

### Organizing Products

**Use clear categories**: Handles, Knobs, Legs, Hinges  
**Add descriptions**: Help customers understand the product  
**Enable only available variants**: Don't show out-of-stock items  
**Update prices regularly**: Keep pricing current  

### Workflow Recommendations

**Daily Tasks:**
- Update stock status for popular items
- Respond to customer inquiries
- Add new products as they arrive

**Weekly Tasks:**
- Review and update product descriptions
- Check for outdated images
- Verify pricing accuracy

**Monthly Tasks:**
- Bulk update prices if needed
- Archive discontinued products
- Review custom fields consistency

---

## Troubleshooting

### Products Not Showing on Website

**Problem**: API returns empty products array  
**Solution**: 
- Verify your Business ID is correct
- Check that products have the right `businessId` in database
- Ensure API URL is correct in your website code

### Images Not Loading

**Problem**: Product images show as broken  
**Solution**:
- Check image URLs are complete (start with https://)
- Verify images are publicly accessible
- Try re-uploading the images

### Variants Not Generating

**Problem**: Click "Generate Variants" but nothing happens  
**Solution**:
- Make sure variant option names are filled in
- Ensure values are comma-separated
- Check that you've added at least one variant option

### CSV Import Fails

**Problem**: Import shows errors or wrong data  
**Solution**:
- Check CSV has all required columns
- Remove special characters from data
- Ensure product codes are consistent for variants
- Try importing just 5 rows first to test

### Can't Edit Product

**Problem**: Edit button doesn't work  
**Solution**:
- Refresh the page and try again
- Check your internet connection
- Verify you have permission to edit this business

---

## Getting Help

### Need Support?

**Email**: anil@sandpark.co

### Video Tutorials

Coming soon! Watch this space for step-by-step video guides.

---

## Appendix

### Keyboard Shortcuts

- `Ctrl + S` (when editing) - Save product (if form supports it)
- `F5` - Refresh dashboard

### Glossary

**Product**: A single item in your catalog  
**Variant**: Different versions of the same product (sizes, colors, etc.)  
**SKU**: Stock Keeping Unit - unique identifier for tracking  
**HSN Code**: Harmonized System of Nomenclature - for GST classification  
**Custom Field**: User-defined additional information  
**Business ID**: Unique identifier for your business in the system  
**API**: Application Programming Interface - how website fetches products  

---

**Last Updated**: Oct. 2025  
**Version**: 1.0  
**Express Web Systems**

---