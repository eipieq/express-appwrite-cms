'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { account, databases, storage, DATABASE_ID, COLLECTIONS, STORAGE_BUCKET_ID } from '@/lib/appwrite';
import { useRouter } from 'next/navigation';
import { ID } from 'appwrite';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Category,
  buildCategoryMap,
  buildCategoryOptions,
  formatCategoryPath,
  getCategoryAncestry,
  getCategoryPath,
  listBusinessCategories,
  createCategoryMeta,
  serializeCategoryMeta,
} from '@/lib/categories';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { alertDemoReadOnly } from '@/config/demo';
import { getCurrencySymbol, normalizeCurrencyCode } from '@/lib/currency';

type VariantOption = {
  name: string;
  values: string[];
  rawInput: string; // Store the raw input string
};

type GeneratedVariant = {
  variantName: string;
  attributes: Record<string, string>;
  price: string;
  sku: string;
  enabled: boolean;
};

export default function AddProductPage() {
  const router = useRouter();
  const { currentBusiness, userBusinesses, loading: businessLoading, isDemoUser } = useBusinessContext();
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const previousBusinessIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Basic product fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  
  // Variant fields
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [generatedVariants, setGeneratedVariants] = useState<GeneratedVariant[]>([]);
  const categoryLookup = useMemo(() => buildCategoryMap(categories), [categories]);
  const categoryOptions = useMemo(() => buildCategoryOptions(categories), [categories]);
  const selectedCategoryPath = useMemo(
    () => (selectedCategoryId ? getCategoryPath(selectedCategoryId, categoryLookup) : []),
    [selectedCategoryId, categoryLookup]
  );
  const selectedCategoryAncestry = useMemo(
    () => (selectedCategoryId ? getCategoryAncestry(selectedCategoryId, categoryLookup) : []),
    [selectedCategoryId, categoryLookup]
  );
  const selectedCategoryPathLabel = useMemo(
    () => (selectedCategoryPath.length > 0 ? formatCategoryPath(selectedCategoryPath) : ''),
    [selectedCategoryPath]
  );

  const activeCurrency = normalizeCurrencyCode(
    typeof currentBusiness?.settings === 'object' && currentBusiness.settings !== null
      ? currentBusiness.settings.currency
      : undefined
  );
  const currencySymbol = getCurrencySymbol(activeCurrency);

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        const user = await account.get();
        if (!isMounted) {
          return;
        }
        setUserId(user.$id);
      } catch {
        router.push('/login');
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!authChecked || businessLoading) {
      return;
    }

    if (!userId) {
      return;
    }

    if (!currentBusiness) {
      if (userBusinesses.length === 0) {
        router.replace('/onboarding');
      }
      return;
    }
  }, [authChecked, businessLoading, currentBusiness, router, userId, userBusinesses]);

  useEffect(() => {
    if (businessLoading) {
      return;
    }

    if (!currentBusiness) {
      setCategories([]);
      setSelectedCategoryId('');
      setCategoriesLoading(false);
      previousBusinessIdRef.current = null;
      return;
    }

    const businessId = currentBusiness.$id;

    if (previousBusinessIdRef.current !== businessId) {
      setSelectedCategoryId('');
      previousBusinessIdRef.current = businessId;
    }

    let isMounted = true;
    setCategoriesLoading(true);

    const loadCategories = async () => {
      try {
        const result = await listBusinessCategories(businessId);
        if (!isMounted) return;
        setCategories(result);
      } catch (error) {
        if (!isMounted) return;
        console.error('Failed to load categories:', error);
        setCategories([]);
      } finally {
        if (isMounted) {
          setCategoriesLoading(false);
        }
      }
    };

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [businessLoading, currentBusiness]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setImages(filesArray);
      
      // Create preview URLs
      const previewUrls = filesArray.map(file => URL.createObjectURL(file));
      setImagePreviewUrls(previewUrls);
    }
  };

  const addVariantOption = () => {
    setVariantOptions((prev) => [...prev, { name: '', values: [], rawInput: '' }]);
  };

  const removeVariantOption = (index: number) => {
    setVariantOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariantOption = (index: number, field: 'name' | 'values' | 'rawInput', value: string | string[]) => {
    setVariantOptions((prev) => {
      const updated = [...prev];
      const option = { ...updated[index] };
      if (field === 'values') {
        option.values = value as string[];
      } else if (field === 'name' || field === 'rawInput') {
        option[field] = value as string;
      }
      updated[index] = option;
      return updated;
    });
  };

  const normalizeBasePriceInput = () => {
    const trimmed = basePrice.trim();
    if (trimmed.length === 0) {
      return '';
    }
    const parsed = parseInt(trimmed, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return '';
    }
    return String(parsed);
  };

  const generateVariants = () => {
    if (variantOptions.length === 0 || variantOptions.some(opt => !opt.name || opt.values.length === 0)) {
      alert('Please fill in all variant options before generating');
      return;
    }

    // Generate all combinations
    const combinations: Record<string, string>[] = [];
    
    const generateCombinations = (index: number, current: Record<string, string>) => {
      if (index === variantOptions.length) {
        combinations.push({ ...current });
        return;
      }
      
      const option = variantOptions[index];
      option.values.forEach(value => {
        generateCombinations(index + 1, { ...current, [option.name]: value });
      });
    };
    
    generateCombinations(0, {});

    const defaultVariantPrice = normalizeBasePriceInput();

    // Create variant objects
    const variants: GeneratedVariant[] = combinations.map(attrs => ({
      variantName: Object.values(attrs).join(' - '),
      attributes: attrs,
      price: defaultVariantPrice,
      sku: '',
      enabled: false
    }));

    setGeneratedVariants(variants);
  };

  const updateVariant = (index: number, field: keyof GeneratedVariant, value: string | number | boolean) => {
    setGeneratedVariants((prev) => {
      const updated = [...prev];
      const variant = { ...updated[index] };

      if (field === 'price') {
        variant.price = String(value);
      } else if (field === 'enabled') {
        const enabled = value as boolean;
        variant.enabled = enabled;

        if (enabled) {
          const basePriceFallback = normalizeBasePriceInput();
          if (
            (!variant.price || variant.price.trim().length === 0) &&
            basePriceFallback.length > 0
          ) {
            variant.price = basePriceFallback;
          }
        }
      } else if (field === 'sku' || field === 'variantName') {
        variant[field] = value as string;
      }

      updated[index] = variant;
      return updated;
    });
  };

  const uploadImages = async (): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    
    for (const image of images) {
      try {
        const fileId = ID.unique();
        const response = await storage.createFile(
          STORAGE_BUCKET_ID,
          fileId,
          image
        );
        
        // Get the file URL
        const fileUrl = `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${STORAGE_BUCKET_ID}/files/${response.$id}/view?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID}`;
        uploadedUrls.push(fileUrl);
      } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
      }
    }
    
    return uploadedUrls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isDemoUser) {
      alertDemoReadOnly();
      return;
    }
    
    if (!userId) {
      alert('User not authenticated');
      return;
    }

    if (!currentBusiness) {
      alert('No business selected. Please choose a business before adding products.');
      return;
    }

    if (!name.trim()) {
      alert('Product name is required');
      return;
    }

    if (hasVariants && generatedVariants.length === 0) {
      alert('Please generate variants or disable "Has Variants"');
      return;
    }

    if (hasVariants && !generatedVariants.some(v => v.enabled)) {
      alert('Please enable at least one variant');
      return;
    }

    setLoading(true);

    try {
      // Upload images
      let imageUrls: string[] = [];
      if (images.length > 0) {
        imageUrls = await uploadImages();
      }

      const selectedCategory = selectedCategoryId ? categoryLookup.get(selectedCategoryId) ?? null : null;
      const categoryPathNames = selectedCategoryPath;
      const categoryAncestors = selectedCategoryAncestry;
      const categoryMeta = selectedCategory
        ? createCategoryMeta({
            category: selectedCategory,
            path: categoryPathNames,
            ancestors: categoryAncestors,
            label: selectedCategoryPathLabel,
          })
        : null;
      const categoryValue = categoryMeta ? serializeCategoryMeta(categoryMeta) : null;

      // Create product document
      const businessId = currentBusiness.$id;
      const parsePriceInput = (value: string) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return null;
        }
        const parsed = parseInt(trimmed, 10);
        if (Number.isNaN(parsed) || parsed < 0) {
          return null;
        }
        return parsed;
      };

      const normalizedBasePrice = parsePriceInput(basePrice) ?? 0;

      const productData = {
        userId,
        businessId,
        name: name.trim(),
        description: description.trim() || null,
        category: categoryValue,
        basePrice: normalizedBasePrice,
        images: imageUrls,
        hasVariants,
        archived: false
      };

      const product = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.PRODUCTS,
        ID.unique(),
        productData
      );

      // If has variants, create variant documents
      if (hasVariants && generatedVariants.length > 0) {
        const enabledVariants = generatedVariants.filter(v => v.enabled);
        
        for (const variant of enabledVariants) {
          const priceFromVariant = parsePriceInput(variant.price);
          const price = priceFromVariant ?? normalizedBasePrice;

          await databases.createDocument(
            DATABASE_ID,
            COLLECTIONS.PRODUCT_VARIANTS,
            ID.unique(),
            {
              productId: product.$id,
              userId,
              businessId,
              variantName: variant.variantName,
              attributes: JSON.stringify(variant.attributes),
              price,
              sku: variant.sku || null,
              enabled: true,
              images: []
            }
          );
        }
      }

      alert('Product created successfully!');
      router.push('/dashboard');
      
    } catch (error) {
      console.error('Error creating product:', error);
      alert('Failed to create product. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked || businessLoading || !userId || !currentBusiness) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {isDemoUser && (
        <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Demo mode is read-only. You can experiment with the form, but products will not be saved.
        </div>
      )}
      <h1 className="text-3xl font-bold mb-6">Add New Product</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., S-106 Cabinet Handle"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Product description..."
                className="min-h-[100px]"
              />
            </div>

            <div>
              <Label htmlFor="categoryId">Category</Label>
              <select
                id="categoryId"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={categoriesLoading || categoryOptions.length === 0}
              >
                <option value="">
                  {categoriesLoading ? 'Loading categories…' : 'No category'}
                </option>
                {categoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-xs text-gray-600">
                  {selectedCategoryPath.length > 0
                    ? `Selected: ${selectedCategoryPathLabel}`
                    : categoriesLoading
                      ? 'Loading your categories'
                      : categoryOptions.length === 0
                        ? 'Create categories to organize your products'
                        : 'Choose a category to keep things organized'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/categories')}
                >
                  Manage
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="basePrice">Base Price ({currencySymbol})</Label>
              <Input
                id="basePrice"
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="images">Product Images</Label>
              <Input
                id="images"
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageChange}
              />
              {imagePreviewUrls.length > 0 && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {imagePreviewUrls.map((url, i) => (
                    <Image
                      key={i}
                      src={url}
                      alt={`Preview ${i}`}
                      width={96}
                      height={96}
                      className="w-24 h-24 object-cover rounded border"
                      unoptimized
                    />
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Variants Section */}
        <Card>
          <CardHeader>
            <CardTitle>Product Variants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="hasVariants"
                checked={hasVariants}
                onCheckedChange={(checked) => {
                  setHasVariants(checked as boolean);
                  if (!checked) {
                    setVariantOptions([]);
                    setGeneratedVariants([]);
                  }
                }}
              />
              <Label htmlFor="hasVariants" className="cursor-pointer">
                This product has variants (sizes, finishes, etc.)
              </Label>
            </div>

            {hasVariants && (
              <>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Variant Options</h3>
                    <Button type="button" onClick={addVariantOption} size="sm">
                      + Add Option
                    </Button>
                  </div>

                  {variantOptions.map((option, index) => (
                    <div key={index} className="border p-4 rounded space-y-2">
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Label>Option Name (e.g., Size, Finish)</Label>
                          <Input
                            value={option.name}
                            onChange={(e) => updateVariantOption(index, 'name', e.target.value)}
                            placeholder="Size"
                          />
                        </div>
                        <Button 
                          type="button" 
                          onClick={() => removeVariantOption(index)} 
                          variant="destructive"
                          size="sm"
                          className="mt-6"
                        >
                          Remove
                        </Button>
                      </div>
                      <div>
                        <Label>Values (comma-separated)</Label>
                        <Input
                          value={option.rawInput ?? option.values.join(', ')}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            const values = inputValue
                              .split(',')
                              .map((v) => v.trim())
                              .filter((v) => v.length > 0);

                            updateVariantOption(index, 'rawInput', inputValue);
                            updateVariantOption(index, 'values', values);
                          }}
                          onBlur={(e) => {
                            const inputValue = e.target.value;
                            const values = inputValue
                              .split(',')
                              .map((v) => v.trim())
                              .filter((v) => v.length > 0);

                            updateVariantOption(index, 'values', values);
                            updateVariantOption(index, 'rawInput', values.join(', '));
                          }}
                          placeholder="96MM, 128MM, 160MM, 192MM"
                        />
                        {option.values.length > 0 && (
                          <p className="text-xs text-gray-600 mt-1">
                            {option.values.length} values: {option.values.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <Button type="button" onClick={generateVariants} className="w-full">
                  Generate Variants ({variantOptions.reduce((acc, opt) => acc * (opt.values.length || 1), 1)} combinations)
                </Button>

                {generatedVariants.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold mb-4">Generated Variants ({generatedVariants.length})</h3>
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[80px]">Enable</TableHead>
                            <TableHead>Variant</TableHead>
                            <TableHead className="w-[150px]">Price ({currencySymbol})</TableHead>
                            <TableHead className="w-[180px]">SKU</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {generatedVariants.map((variant, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <Checkbox
                                  checked={variant.enabled}
                                  onCheckedChange={(checked) => updateVariant(index, 'enabled', checked as boolean)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{variant.variantName}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={variant.price}
                                  onChange={(e) => updateVariant(index, 'price', e.target.value)}
                                  min="0"
                                  disabled={!variant.enabled}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={variant.sku}
                                  onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                                  placeholder="Optional"
                                  disabled={!variant.enabled}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button type="submit" disabled={loading || isDemoUser} className="flex-1">
            {loading ? 'Creating Product...' : 'Create Product'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
