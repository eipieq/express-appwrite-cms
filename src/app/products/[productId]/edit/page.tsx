'use client';

import Image from 'next/image';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { account, databases, storage, DATABASE_ID, COLLECTIONS, STORAGE_BUCKET_ID } from '@/lib/appwrite';
import { useRouter } from 'next/navigation';
import { ID, Query } from 'appwrite';
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
  CategoryMeta,
  buildCategoryMap,
  buildCategoryOptions,
  formatCategoryPath,
  categoryMetaLabel,
  createCategoryMeta,
  getCategoryAncestry,
  getCategoryPath,
  listBusinessCategories,
  parseCategoryMeta,
  serializeCategoryMeta,
} from '@/lib/categories';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { alertDemoReadOnly } from '@/config/demo';
import { getCurrencySymbol, normalizeCurrencyCode } from '@/lib/currency';

const parsePriceString = (value: string): number | null => {
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

const parseUnknownPrice = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    return parsePriceString(value);
  }
  return null;
};

type VariantOption = {
  name: string;
  values: string[];
  rawInput: string;
};

type GeneratedVariant = {
  id?: string; // Existing variant ID if editing
  variantName: string;
  attributes: Record<string, string>;
  price: string;
  sku: string;
  enabled: boolean;
};

type EditProductPageProps = {
  params: Promise<{ productId: string }>;
};

export default function EditProductPage({ params }: EditProductPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [productOwnerId, setProductOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Basic product fields
  const [productId] = useState(resolvedParams.productId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [legacyCategoryLabel, setLegacyCategoryLabel] = useState('');
  const [initialCategoryMeta, setInitialCategoryMeta] = useState<CategoryMeta | null>(null);
  
  // Variant fields
  const [hasVariants, setHasVariants] = useState(false);
  const [variantOptions, setVariantOptions] = useState<VariantOption[]>([]);
  const [generatedVariants, setGeneratedVariants] = useState<GeneratedVariant[]>([]);
  const [existingVariants, setExistingVariants] = useState<GeneratedVariant[]>([]);
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

  const { currentBusiness, userBusinesses, loading: businessLoading, isDemoUser } = useBusinessContext();
  const activeCurrency = normalizeCurrencyCode(
    typeof currentBusiness?.settings === 'object' && currentBusiness.settings !== null
      ? currentBusiness.settings.currency
      : undefined
  );
  const currencySymbol = getCurrencySymbol(activeCurrency);
  const [authChecked, setAuthChecked] = useState(false);
  const previousBusinessIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
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

    loadUser();

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

    const businessId = currentBusiness.$id;

    if (previousBusinessIdRef.current !== businessId) {
      previousBusinessIdRef.current = businessId;
      setCategories([]);
      setExistingVariants([]);
      setGeneratedVariants([]);
      setVariantOptions([]);
      setSelectedCategoryId('');
      setLegacyCategoryLabel('');
      setInitialCategoryMeta(null);
      setNewImages([]);
      setImagePreviewUrls([]);
    }

    let isCancelled = false;

    const loadProduct = async () => {
      setCategoriesLoading(true);
      setLoading(true);

      try {
        const [categoryList, product] = await Promise.all([
          listBusinessCategories(businessId),
          databases.getDocument(
            DATABASE_ID,
            COLLECTIONS.PRODUCTS,
            productId
          ),
        ]);

        if (isCancelled) {
          return;
        }

        setCategories(categoryList);

        const productRecord = product as Record<string, unknown>;
        const productBusinessId =
          typeof productRecord.businessId === 'string' ? productRecord.businessId : null;
        const ownerId =
          typeof productRecord.userId === 'string' && productRecord.userId.trim().length > 0
            ? productRecord.userId
            : userId;
        setProductOwnerId(ownerId);

        if (productBusinessId && productBusinessId !== businessId) {
          alert('This product belongs to a different business.');
          router.push('/dashboard');
          return;
        }

        setName(product.name);
        setDescription(product.description || '');
        setBasePrice(product.basePrice ? String(product.basePrice) : '');
        setExistingImages(product.images || []);
        setHasVariants(product.hasVariants);

        const parsedCategoryMeta = parseCategoryMeta(product.category);
        setInitialCategoryMeta(parsedCategoryMeta);

        const rawCategoryValue =
          typeof product.category === 'string' && product.category.length > 0 ? product.category : '';
        const categoryNameField = productRecord.categoryName;
        const fallbackCategoryName =
          typeof categoryNameField === 'string' && categoryNameField.trim().length > 0
            ? categoryNameField
            : rawCategoryValue;

        const docCategoryLabel = categoryMetaLabel(parsedCategoryMeta, fallbackCategoryName) ?? '';

        const categoryIdField = productRecord.categoryId;
        const existingCategoryId =
          typeof categoryIdField === 'string' && categoryIdField.trim().length > 0
            ? categoryIdField
            : '';

        let resolvedCategoryId = existingCategoryId || (parsedCategoryMeta?.id ?? '');

        if (!resolvedCategoryId && parsedCategoryMeta?.slug) {
          const matchByStoredSlug = categoryList.find(category => category.slug === parsedCategoryMeta.slug);
          if (matchByStoredSlug) {
            resolvedCategoryId = matchByStoredSlug.$id;
          }
        }

        if (!resolvedCategoryId) {
          const categorySlugField = productRecord.categorySlug;
          const docCategorySlug =
            typeof categorySlugField === 'string' && categorySlugField.trim().length > 0 ? categorySlugField : '';
          if (docCategorySlug) {
            const matchBySlug = categoryList.find(category => category.slug === docCategorySlug);
            if (matchBySlug) {
              resolvedCategoryId = matchBySlug.$id;
            }
          }
        }

        if (!resolvedCategoryId && docCategoryLabel) {
          const normalized = docCategoryLabel.toLowerCase();
          const matchByName = categoryList.find(category => category.name.toLowerCase() === normalized);
          if (matchByName) {
            resolvedCategoryId = matchByName.$id;
          }
        }

        setSelectedCategoryId(resolvedCategoryId);
        setLegacyCategoryLabel(docCategoryLabel || fallbackCategoryName);

        if (product.hasVariants) {
          const variantFilters = [
            Query.equal('productId', productId),
            Query.equal('businessId', businessId),
          ];

          let variantsResponse = await databases.listDocuments(
            DATABASE_ID,
            COLLECTIONS.PRODUCT_VARIANTS,
            variantFilters
          );

          if (variantsResponse.documents.length === 0) {
            variantsResponse = await databases.listDocuments(
              DATABASE_ID,
              COLLECTIONS.PRODUCT_VARIANTS,
              [Query.equal('productId', productId)]
            );
          }

          if (variantsResponse.documents.length > 0) {
            const loadedVariants: GeneratedVariant[] = variantsResponse.documents.map((doc) => {
              const resolvedPrice =
                parseUnknownPrice(doc.price) ??
                parseUnknownPrice(product.basePrice) ??
                0;

              return {
                id: doc.$id,
                variantName: doc.variantName,
                attributes: JSON.parse(doc.attributes),
                price: String(resolvedPrice),
                sku: doc.sku || '',
                enabled: doc.enabled
              };
            });

            setExistingVariants(loadedVariants);
            setGeneratedVariants(loadedVariants);

            const attributeMap = new Map<string, Set<string>>();
            loadedVariants.forEach(variant => {
              Object.entries(variant.attributes).forEach(([key, value]) => {
                if (!attributeMap.has(key)) {
                  attributeMap.set(key, new Set());
                }
                attributeMap.get(key)!.add(value);
              });
            });

            const reconstructedOptions: VariantOption[] = Array.from(attributeMap.entries()).map(([name, valuesSet]) => {
              const values = Array.from(valuesSet);
              return {
                name,
                values,
                rawInput: values.join(', ')
              };
            });

            setVariantOptions(reconstructedOptions);
          } else {
            setExistingVariants([]);
            setGeneratedVariants([]);
            setVariantOptions([]);
          }
        } else {
          setExistingVariants([]);
          setGeneratedVariants([]);
          setVariantOptions([]);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error loading product:', error);
          alert('Failed to load product');
          router.push('/dashboard');
        }
      } finally {
        if (!isCancelled) {
          setCategoriesLoading(false);
          setLoading(false);
        }
      }
    };

    loadProduct();

    return () => {
      isCancelled = true;
    };
  }, [authChecked, businessLoading, currentBusiness, productId, router, userId, userBusinesses]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setNewImages(filesArray);
      
      const previewUrls = filesArray.map(file => URL.createObjectURL(file));
      setImagePreviewUrls(previewUrls);
    }
  };

  const removeExistingImage = (index: number) => {
    setExistingImages(existingImages.filter((_, i) => i !== index));
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
    const parsed = parsePriceString(basePrice);
    return parsed === null ? '' : String(parsed);
  };

  const generateVariants = () => {
    if (variantOptions.length === 0 || variantOptions.some(opt => !opt.name || opt.values.length === 0)) {
      alert('Please fill in all variant options before generating');
      return;
    }

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

    // Merge with existing variants
    const defaultVariantPrice = normalizeBasePriceInput();

    const variants: GeneratedVariant[] = combinations.map(attrs => {
      const variantName = Object.values(attrs).join(' - ');
      
      // Check if this variant already exists
      const existing = existingVariants.find(v => v.variantName === variantName);
      
      if (existing) {
        return existing;
      }
      
      return {
        variantName,
        attributes: attrs,
        price: defaultVariantPrice,
        sku: '',
        enabled: false
      };
    });

    setGeneratedVariants(variants);
  };

  const updateVariant = (index: number, field: keyof GeneratedVariant, value: string | boolean) => {
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
    
    for (const image of newImages) {
      try {
        const fileId = ID.unique();
        const response = await storage.createFile(
          STORAGE_BUCKET_ID,
          fileId,
          image
        );
        
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
      alert('No business selected. Please choose a business before updating products.');
      return;
    }

    const ownerId = productOwnerId ?? userId;

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

    setSaving(true);

    try {
      // Upload new images
      let newImageUrls: string[] = [];
      if (newImages.length > 0) {
        newImageUrls = await uploadImages();
      }

      // Combine existing and new images
      const allImages = [...existingImages, ...newImageUrls];

      const selectedCategory = selectedCategoryId ? categoryLookup.get(selectedCategoryId) ?? null : null;
      const categoryPathNames = selectedCategoryPath;
      const categoryAncestors = selectedCategoryAncestry;
      let categoryMeta = selectedCategory
        ? createCategoryMeta({
            category: selectedCategory,
            path: categoryPathNames,
            ancestors: categoryAncestors,
            label: selectedCategoryPathLabel,
          })
        : null;

      if (!categoryMeta && selectedCategoryId && initialCategoryMeta && initialCategoryMeta.id === selectedCategoryId) {
        categoryMeta = initialCategoryMeta;
      }

      const categoryValue = categoryMeta ? serializeCategoryMeta(categoryMeta) : null;

      // Update product document
      const businessId = currentBusiness.$id;
      const normalizedBasePrice = parsePriceString(basePrice) ?? 0;
      const productData = {
        businessId,
        name: name.trim(),
        description: description.trim() || null,
        category: categoryValue,
        basePrice: normalizedBasePrice,
        images: allImages,
        hasVariants
      };

      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.PRODUCTS,
        productId,
        productData
      );

      // Handle variants
      if (hasVariants && generatedVariants.length > 0) {
        const enabledVariants = generatedVariants.filter(v => v.enabled);
        
        // Delete all existing variants first
        for (const existingVariant of existingVariants) {
          if (existingVariant.id) {
            try {
              await databases.deleteDocument(
                DATABASE_ID,
                COLLECTIONS.PRODUCT_VARIANTS,
                existingVariant.id
              );
            } catch (error) {
              console.error('Error deleting variant:', error);
            }
          }
        }

        // Create new variants
        for (const variant of enabledVariants) {
          const priceFromVariant = parsePriceString(variant.price ?? '');
          const price = priceFromVariant ?? normalizedBasePrice;

          await databases.createDocument(
            DATABASE_ID,
            COLLECTIONS.PRODUCT_VARIANTS,
            ID.unique(),
            {
              productId: productId,
              userId: ownerId,
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
      } else if (!hasVariants && existingVariants.length > 0) {
        // If variants were disabled, delete all existing variants
        for (const existingVariant of existingVariants) {
          if (existingVariant.id) {
            await databases.deleteDocument(
              DATABASE_ID,
              COLLECTIONS.PRODUCT_VARIANTS,
              existingVariant.id
            );
          }
        }
      }

      alert('Product updated successfully!');
      router.push('/dashboard');
      
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Failed to update product. Check console for details.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading product...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {isDemoUser && (
        <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          Demo mode is read-only. Feel free to explore, but updates to this product are not saved.
        </div>
      )}
      <h1 className="text-3xl font-bold mb-6">Edit Product</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
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
                    : legacyCategoryLabel
                      ? `Previously: ${legacyCategoryLabel}`
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
              <Label>Existing Images</Label>
              {existingImages.length > 0 ? (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {existingImages.map((url, i) => (
                    <div key={i} className="relative">
                      <Image
                        src={url}
                        alt={`Existing ${i}`}
                        width={96}
                        height={96}
                        className="w-24 h-24 object-cover rounded border"
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(i)}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 mt-2">No existing images</p>
              )}
            </div>

            <div>
              <Label htmlFor="images">Add New Images</Label>
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
          <Button type="submit" disabled={saving || isDemoUser} className="flex-1">
            {saving ? 'Updating Product...' : 'Update Product'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
