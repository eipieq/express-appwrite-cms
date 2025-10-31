'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Models } from 'appwrite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { account, databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';
import { useRouter } from 'next/navigation';
import { Query } from 'appwrite';
import { Button } from '@/components/ui/button';
import {
    Category,
    CategoryMeta,
    buildCategoryMap,
    categoryMetaLabel,
    createCategoryMeta,
    formatCategoryPath,
    getCategoryAncestry,
    getCategoryPath,
    listBusinessCategories,
    parseCategoryMeta,
    serializeCategoryMeta,
} from '@/lib/categories';
import { cn } from '@/lib/utils';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { alertDemoReadOnly, setDemoModeCookie } from '@/config/demo';
import { BRANDING } from '@/config/branding';

type Product = {
    $id: string;
    name: string;
    category?: string | null;
    basePrice: number;
    hasVariants: boolean;
    images: string[];
};

export default function Dashboard() {
    type AccountUser = Models.User<Models.Preferences>;

    const [user, setUser] = useState<AccountUser | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'compact'>('grid');
    const [groupByCategory, setGroupByCategory] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    const [bulkCategoryTarget, setBulkCategoryTarget] = useState('');
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const router = useRouter();
    const { currentBusiness, currentMembership, loading: businessLoading, isDemoUser } = useBusinessContext();
    const [authChecked, setAuthChecked] = useState(false);
    const previousBusinessIdRef = useRef<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadUser = async () => {
            try {
                const userData = await account.get();
                if (!isMounted) {
                    return;
                }
                setUser(userData);
                document.cookie = `appwrite-session=active; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
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

        if (!currentBusiness) {
            setProducts([]);
            setCategories([]);
            setLoading(false);
            previousBusinessIdRef.current = null;
            return;
        }

        const activeBusinessId = currentBusiness.$id;
        if (previousBusinessIdRef.current !== activeBusinessId) {
            setCategoryFilter('all');
            setSearchTerm('');
            setSelectionMode(false);
            setSelectedProductIds([]);
            previousBusinessIdRef.current = activeBusinessId;
        }

        let isCancelled = false;

        const fetchData = async () => {
            setLoading(true);
            try {
                const [productsResponse, categoriesResponse] = await Promise.all([
                    databases.listDocuments(
                        DATABASE_ID,
                        COLLECTIONS.PRODUCTS,
                        [
                            Query.equal('businessId', activeBusinessId),
                            Query.orderDesc('$createdAt'),
                            Query.limit(100)
                        ]
                    ),
                    listBusinessCategories(activeBusinessId),
                ]);

                if (isCancelled) {
                    return;
                }

                setProducts(productsResponse.documents as unknown as Product[]);
                setCategories(categoriesResponse);
            } catch (error) {
                if (!isCancelled) {
                    console.error('Failed to load dashboard data:', error);
                    setProducts([]);
                    setCategories([]);
                }
            } finally {
                if (!isCancelled) {
                    setLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            isCancelled = true;
        };
    }, [authChecked, businessLoading, currentBusiness]);

    useEffect(() => {
        setSelectedProductIds((prevSelected) =>
            prevSelected.filter((id) => products.some((product) => product.$id === id))
        );
    }, [products]);

    const canManageProducts = useMemo(() => {
        if (isDemoUser) {
            return false;
        }
        if (!currentBusiness || !user) {
            return false;
        }

        if (typeof currentBusiness.ownerId === 'string' && currentBusiness.ownerId === user.$id) {
            return true;
        }

        const normalizedRole = currentMembership?.role
            ? String(currentMembership.role).toLowerCase()
            : null;

        return normalizedRole === 'owner' || normalizedRole === 'admin';
    }, [currentBusiness, currentMembership, user, isDemoUser]);

    const categoryLookup = useMemo(() => buildCategoryMap(categories), [categories]);

    const decoratedProducts = useMemo(() => {
        return products.map((product) => {
            const categoryMeta = parseCategoryMeta(product.category);
            const categoryLabel = categoryMetaLabel(
                categoryMeta,
                typeof product.category === 'string' ? product.category : null
            );

            return {
                ...product,
                categoryMeta,
                categoryLabel,
            };
        });
    }, [products]);

    const categoryOptions = useMemo(() => {
        const options = new Map<string, { id: string; label: string }>();
        categories.forEach((category) => {
            const path = getCategoryPath(category.$id, categoryLookup);
            const label = path.length > 0 ? formatCategoryPath(path) : category.name;
            options.set(category.$id, { id: category.$id, label });
        });

        decoratedProducts.forEach(({ categoryMeta, categoryLabel }) => {
            if (categoryMeta) {
                options.set(categoryMeta.id, {
                    id: categoryMeta.id,
                    label: categoryMeta.label,
                });
            } else if (categoryLabel) {
                options.set(categoryLabel, {
                    id: categoryLabel,
                    label: categoryLabel,
                });
            }
        });

        return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [categories, decoratedProducts, categoryLookup]);

    const categorySelectOptions = useMemo(() => {
        return categories
            .map((category) => {
                const path = getCategoryPath(category.$id, categoryLookup);
                return {
                    id: category.$id,
                    label: path.length > 0 ? formatCategoryPath(path) : category.name,
                };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [categories, categoryLookup]);

    const filteredProducts = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();
        return decoratedProducts.filter((product) => {
            const matchesCategory =
                categoryFilter === 'all' ||
                (product.categoryMeta && product.categoryMeta.id === categoryFilter) ||
                (product.categoryLabel && product.categoryLabel === categoryFilter);

            const matchesSearch =
                search.length === 0 ||
                product.name.toLowerCase().includes(search) ||
                (product.categoryLabel?.toLowerCase().includes(search) ?? false);

            return matchesCategory && matchesSearch;
        });
    }, [decoratedProducts, categoryFilter, searchTerm]);

    const groupedProducts = useMemo(() => {
        if (!groupByCategory) {
            return [];
        }

        const groups = new Map<string, { label: string; items: typeof decoratedProducts }>();

        filteredProducts.forEach((product) => {
            const groupId = product.categoryMeta?.id ?? product.categoryLabel ?? 'uncategorized';
            const label =
                product.categoryMeta?.label ??
                product.categoryLabel ??
                'Uncategorized';

            if (!groups.has(groupId)) {
                groups.set(groupId, { label, items: [] });
            }

            groups.get(groupId)!.items.push(product);
        });

        return Array.from(groups.entries()).map(([id, group]) => ({
            id,
            label: group.label,
            items: group.items,
        })).sort((a, b) => a.label.localeCompare(b.label));
    }, [filteredProducts, groupByCategory]);

    const productCount = filteredProducts.length;
    const totalCategoriesRepresented = useMemo(() => {
        const unique = new Set<string>();
        filteredProducts.forEach((product) => {
            if (product.categoryMeta) {
                unique.add(product.categoryMeta.id);
            } else if (product.categoryLabel) {
                unique.add(product.categoryLabel);
            } else {
                unique.add('uncategorized');
            }
        });
        return unique.size;
    }, [filteredProducts]);

    const selectedCount = selectionMode ? selectedProductIds.length : 0;
    const selectedProducts = useMemo(
        () =>
            selectionMode
                ? decoratedProducts.filter((product) => selectedProductIds.includes(product.$id))
                : [],
        [decoratedProducts, selectedProductIds, selectionMode]
    );
    const allVisibleSelected = useMemo(() => {
        if (filteredProducts.length === 0) {
            return false;
        }
        return filteredProducts.every((product) => selectedProductIds.includes(product.$id));
    }, [filteredProducts, selectedProductIds]);

    const toggleProductSelection = useCallback(
        (productId: string) => {
            if (!selectionMode) {
                return;
            }
            setSelectedProductIds((prevSelected) =>
                prevSelected.includes(productId)
                    ? prevSelected.filter((id) => id !== productId)
                    : [...prevSelected, productId]
            );
        },
        [selectionMode]
    );

    const toggleVisibleSelection = useCallback(() => {
        setSelectedProductIds((prevSelected) => {
            if (!selectionMode || filteredProducts.length === 0) {
                return prevSelected;
            }
            const visibleIds = new Set(filteredProducts.map((product) => product.$id));
            const allSelected = filteredProducts.every((product) => prevSelected.includes(product.$id));
            if (allSelected) {
                return prevSelected.filter((id) => !visibleIds.has(id));
            }
            const next = new Set(prevSelected);
            filteredProducts.forEach((product) => next.add(product.$id));
            return Array.from(next);
        });
    }, [filteredProducts, selectionMode]);

    const clearSelection = useCallback(() => {
        setSelectedProductIds([]);
    }, []);

    const selectedHasCategory = useMemo(
        () => selectedProducts.some((product) => Boolean(product.category)),
        [selectedProducts]
    );
    const categoryApplyDisabled =
        !selectionMode || bulkActionLoading || selectedCount === 0 || !bulkCategoryTarget;
    const clearCategoryDisabled =
        !selectionMode || bulkActionLoading || selectedCount === 0 || !selectedHasCategory;
    const bulkDeleteDisabled = !selectionMode || bulkActionLoading || selectedCount === 0;

    const handleToggleSelectionMode = useCallback(() => {
        setSelectionMode((prev) => {
            if (prev) {
                clearSelection();
                setBulkCategoryTarget('');
            }
            return !prev;
        });
    }, [clearSelection]);

    const handleLogout = async () => {
        try {
            await account.deleteSession('current');
            document.cookie = 'appwrite-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
            setDemoModeCookie(false);
            router.push('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const handleCreateBusiness = () => {
        router.push('/onboarding?mode=create');
    };

    const deleteProductById = useCallback(async (productId: string) => {
        if (isDemoUser) {
            alertDemoReadOnly();
            return;
        }

        if (!currentBusiness) {
            throw new Error('No active business selected.');
        }

        const businessId = currentBusiness.$id;

        let variants = await databases.listDocuments(
            DATABASE_ID,
            COLLECTIONS.PRODUCT_VARIANTS,
            [
                Query.equal('productId', productId),
                Query.equal('businessId', businessId),
            ]
        );

        if (variants.documents.length === 0) {
            variants = await databases.listDocuments(
                DATABASE_ID,
                COLLECTIONS.PRODUCT_VARIANTS,
                [Query.equal('productId', productId)]
            );
        }

        for (const variant of variants.documents) {
            await databases.deleteDocument(
                DATABASE_ID,
                COLLECTIONS.PRODUCT_VARIANTS,
                variant.$id
            );
        }

        await databases.deleteDocument(
            DATABASE_ID,
            COLLECTIONS.PRODUCTS,
            productId
        );

        setProducts((prev) => prev.filter((product) => product.$id !== productId));
        setSelectedProductIds((prev) => prev.filter((id) => id !== productId));
    }, [currentBusiness, isDemoUser]);

    const handleDeleteProduct = async (productId: string) => {
        if (!canManageProducts) {
            if (isDemoUser) {
                alertDemoReadOnly();
            } else {
                alert('You do not have permission to delete products for this business.');
            }
            return;
        }

        if (!confirm('Are you sure you want to delete this product? This will also delete all its variants.')) {
            return;
        }

        try {
            await deleteProductById(productId);
            alert('Product deleted successfully');
        } catch (error) {
            console.error('Error deleting product:', error);
            alert('Failed to delete product');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedCount === 0) {
            return;
        }

        if (!canManageProducts) {
            if (isDemoUser) {
                alertDemoReadOnly();
            } else {
                alert('You do not have permission to delete products for this business.');
            }
            return;
        }

        if (!confirm(`Delete ${selectedCount} selected product${selectedCount === 1 ? '' : 's'}? This will also delete all associated variants.`)) {
            return;
        }

        setBulkActionLoading(true);
        try {
            for (const productId of selectedProductIds) {
                await deleteProductById(productId);
            }
            alert(`Deleted ${selectedCount} product${selectedCount === 1 ? '' : 's'}.`);
            clearSelection();
        } catch (error) {
            console.error('Bulk delete failed:', error);
            alert('Failed to delete selected products. Please try again.');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const applyCategoryToSelected = useCallback(
        async (targetCategoryId: string | null) => {
            if (isDemoUser) {
                alertDemoReadOnly();
                return;
            }

            if (selectedProductIds.length === 0) {
                return;
            }

            setBulkActionLoading(true);
            try {
                let serializedCategory: string | null = null;
                let categoryLabelForAlert = 'Removed category';

                if (targetCategoryId) {
                    const targetCategory = categoryLookup.get(targetCategoryId);
                    if (!targetCategory) {
                        alert('Selected category no longer exists. Please refresh and try again.');
                        setBulkActionLoading(false);
                        return;
                    }

                    const path = getCategoryPath(targetCategoryId, categoryLookup);
                    const ancestors = getCategoryAncestry(targetCategoryId, categoryLookup);
                    const meta = createCategoryMeta({
                        category: targetCategory,
                        path,
                        ancestors,
                    });
                    serializedCategory = serializeCategoryMeta(meta);
                    categoryLabelForAlert = meta.label;
                }

                for (const productId of selectedProductIds) {
                    await databases.updateDocument(
                        DATABASE_ID,
                        COLLECTIONS.PRODUCTS,
                        productId,
                        { category: serializedCategory }
                    );
                }

                setProducts((prev) =>
                    prev.map((product) =>
                        selectedProductIds.includes(product.$id)
                            ? { ...product, category: serializedCategory }
                            : product
                    )
                );

                alert(
                    targetCategoryId
                        ? `Updated ${selectedProductIds.length} product${selectedProductIds.length === 1 ? '' : 's'} to category ${categoryLabelForAlert}.`
                        : `Removed categories from ${selectedProductIds.length} product${selectedProductIds.length === 1 ? '' : 's'}.`
                );
                setBulkCategoryTarget('');
                clearSelection();
            } catch (error) {
                console.error('Bulk category update failed:', error);
                alert('Failed to update categories. Please try again.');
            } finally {
                setBulkActionLoading(false);
            }
        },
        [categoryLookup, clearSelection, selectedProductIds, isDemoUser]
    );

    const handleApplyCategory = async () => {
        if (!bulkCategoryTarget) {
            return;
        }
        await applyCategoryToSelected(bulkCategoryTarget);
    };

    const handleClearCategories = async () => {
        if (!selectedHasCategory) {
            return;
        }
        await applyCategoryToSelected(null);
    };

    const renderProductCard = (product: Product & { categoryMeta: CategoryMeta | null; categoryLabel: string | null }) => {
        const priceDisplay = product.hasVariants ? 'Has Variants' : `₹${product.basePrice}`;
        const imageSrc = product.images?.[0];
        const categoryBadge = product.categoryMeta?.label ?? product.categoryLabel;
        const isSelected = selectionMode && selectedProductIds.includes(product.$id);
        const selectionCheckbox = selectionMode ? (
            <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={isSelected}
                onChange={() => toggleProductSelection(product.$id)}
                disabled={bulkActionLoading}
            />
        ) : null;

        if (viewMode === 'list') {
            return (
                <div
                    key={product.$id}
                    className={cn(
                        'relative flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md md:flex-row md:items-center',
                        isSelected && 'border-blue-500 ring-2 ring-blue-200'
                    )}
                >
                    {selectionCheckbox && (
                        <div className="absolute right-3 top-3 z-10">
                            {selectionCheckbox}
                        </div>
                    )}
                    <div className="relative h-28 w-full overflow-hidden rounded-md bg-slate-100 md:h-20 md:w-20">
                        {imageSrc ? (
                            <Image
                                src={imageSrc}
                                alt={product.name}
                                fill
                                className="object-cover"
                                sizes="80px"
                                unoptimized
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                                No Image
                            </div>
                        )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-slate-900">{product.name}</h3>
                                {categoryBadge && (
                                    <p className="text-sm text-slate-500">{categoryBadge}</p>
                                )}
                            </div>
                            <span className="text-sm font-medium text-blue-600">{priceDisplay}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => router.push(`/products/${product.$id}/edit`)}
                                className="rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-600 transition hover:border-blue-400 hover:text-blue-700"
                                disabled={bulkActionLoading}
                            >
                                Edit
                            </button>
                            <button
                                onClick={() => handleDeleteProduct(product.$id)}
                                className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:border-red-400 hover:text-red-700"
                                disabled={bulkActionLoading || !canManageProducts}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        const cardClass =
            viewMode === 'compact'
                ? 'rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md'
                : 'border rounded-xl overflow-hidden bg-white shadow-sm transition hover:shadow-lg hover:border-blue-200';

        const imageClass =
            viewMode === 'compact'
                ? 'relative h-32 w-full overflow-hidden rounded-t-xl bg-slate-100'
                : 'relative aspect-square w-full overflow-hidden bg-slate-100';

        return (
            <div
                key={product.$id}
                className={cn(
                    'relative',
                    cardClass,
                    isSelected && 'border-blue-500 ring-2 ring-blue-200'
                )}
            >
                {selectionCheckbox && (
                    <div className="absolute right-3 top-3 z-10">
                        {selectionCheckbox}
                    </div>
                )}
                <div className={imageClass}>
                    {imageSrc ? (
                        <Image
                            src={imageSrc}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            unoptimized
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                            No Image
                        </div>
                    )}
                </div>
                <div className="space-y-3 p-4">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 md:text-base">{product.name}</h3>
                        {categoryBadge && (
                            <p className="text-xs text-slate-500 md:text-sm">{categoryBadge}</p>
                        )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-blue-600">{priceDisplay}</span>
                        <span className="text-xs text-slate-400">{product.hasVariants ? 'Variants enabled' : 'Single price'}</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => router.push(`/products/${product.$id}/edit`)}
                            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 md:text-sm"
                            disabled={bulkActionLoading}
                        >
                            Edit
                        </button>
                        <button
                            onClick={() => handleDeleteProduct(product.$id)}
                            className="flex-1 rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:border-red-400 hover:text-red-700 md:text-sm"
                            disabled={bulkActionLoading || !canManageProducts}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderCollection = (items: typeof decoratedProducts) => {
        if (viewMode === 'list') {
            return (
                <div className="space-y-4">
                    {items.map((product) => renderProductCard(product))}
                </div>
            );
        }

        const gridClass =
            viewMode === 'grid'
                ? 'grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3'
                : 'grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4';

        return (
            <div className={gridClass}>
                {items.map((product) => renderProductCard(product))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
                Loading your products...
            </div>
        );
    }

    if (!currentBusiness) {
        const createButtonDisabled = isDemoUser || businessLoading;

        return (
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Welcome to {BRANDING.name}</h1>
                        <p className="text-sm text-slate-500">
                            Let&rsquo;s create a business so you can start organising products and inviting teammates.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={handleCreateBusiness} disabled={createButtonDisabled}>
                            {isDemoUser ? 'Demo mode is read-only' : 'Create a business'}
                        </Button>
                        {BRANDING.publicSiteUrl && (
                            <Button variant="outline" asChild>
                                <a
                                    href={BRANDING.publicSiteUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    View website
                                </a>
                            </Button>
                        )}
                        <button
                            onClick={handleLogout}
                            className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-red-300 hover:text-red-600"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {isDemoUser && (
                    <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
                        You&rsquo;re exploring the shared demo account. Creating businesses is disabled, but you can browse the UI safely.
                    </div>
                )}

                <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-blue-900">Create your first business</h2>
                    <p className="mt-2 text-sm text-blue-800">
                        Businesses keep products, categories, and team permissions organised. You can add more businesses later.
                    </p>
                    <div className="mt-4">
                        <Button onClick={handleCreateBusiness} disabled={createButtonDisabled}>
                            {isDemoUser ? 'Unavailable in demo mode' : 'Kick off setup'}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                        {
                            title: 'Products dashboard',
                            description: 'Track catalog performance, upload images, and manage variants once a business is set up.',
                        },
                        {
                            title: 'Categories',
                            description: 'Group products into a hierarchy to power storefront navigation and search.',
                        },
                        {
                            title: 'Team access',
                            description: 'Invite collaborators with roles like Admin, Editor, or Viewer tailored to your workflow.',
                        },
                    ].map((item) => (
                        <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                            <p className="mt-2 text-sm text-slate-500">{item.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Product Dashboard</h1>
                    <p className="text-sm text-slate-500">
                        Welcome back{user?.email ? `, ${user.email}` : ''}! Manage your catalogue at a glance.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {BRANDING.publicSiteUrl && (
                        <Button variant="outline" asChild>
                            <a
                                href={BRANDING.publicSiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                View website
                            </a>
                        </Button>
                    )}
                    <button
                        onClick={handleLogout}
                        className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-red-300 hover:text-red-600"
                    >
                        Logout
                    </button>
                </div>
            </div>

            {isDemoUser && (
                <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
                    You are browsing in demo mode. Feel free to explore filters and layouts, but product changes are read-only and will not be saved.
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total Products</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{products.length}</p>
                    <p className="text-xs text-slate-400">Across your workspace</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Visible Now</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{productCount}</p>
                    <p className="text-xs text-slate-400">After current filters</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Categories Shown</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{totalCategoriesRepresented}</p>
                    <p className="text-xs text-slate-400">Filtered selection</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase text-slate-500">Variants</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">
                        {filteredProducts.filter((product) => product.hasVariants).length}
                    </p>
                    <p className="text-xs text-slate-400">Products with variant options</p>
                </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
                        <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                            <span className="text-xs uppercase text-slate-400">Search</span>
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search products or categories"
                                className="w-full text-sm text-slate-700 outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs uppercase text-slate-400">Category</label>
                            <select
                                value={categoryFilter}
                                onChange={(event) => setCategoryFilter(event.target.value)}
                                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-300"
                            >
                                <option value="all">All categories</option>
                                {categoryOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                                {categoryOptions.length === 0 && <option disabled>No categories</option>}
                            </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                                type="checkbox"
                                checked={groupByCategory}
                                onChange={(event) => setGroupByCategory(event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            Group by category
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant={selectionMode ? 'default' : 'outline'}
                            onClick={handleToggleSelectionMode}
                            disabled={bulkActionLoading || !canManageProducts}
                        >
                            {selectionMode ? 'Done' : 'Manage Products'}
                        </Button>
                        <div className="flex items-center gap-1 rounded-md border border-slate-200 p-1">
                            {(['grid', 'list', 'compact'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => setViewMode(mode)}
                                    className={cn(
                                        'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition',
                                        viewMode === mode
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-100'
                                    )}
                                    type="button"
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {selectionMode && selectedCount > 0 && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 shadow-sm transition">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-blue-900">
                                {selectedCount} product{selectedCount === 1 ? '' : 's'} selected
                            </p>
                            <p className="text-xs text-blue-800">
                                Use bulk actions to update categories or remove products in one go.
                            </p>
                            {bulkActionLoading && (
                                <p className="mt-1 text-xs font-medium text-blue-700">Applying changes…</p>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={toggleVisibleSelection}
                                disabled={bulkActionLoading || filteredProducts.length === 0}
                            >
                                {allVisibleSelected ? 'Deselect All' : 'Select All'}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={clearSelection}
                                disabled={bulkActionLoading}
                            >
                                Clear selection
                            </Button>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <span className="text-xs font-semibold uppercase text-blue-700 sm:mr-2">
                                Set category
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={bulkCategoryTarget}
                                    onChange={(event) => setBulkCategoryTarget(event.target.value)}
                                    className="min-w-[12rem] rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-blue-400"
                                    disabled={bulkActionLoading}
                                >
                                    <option value="">Choose category</option>
                                    {categorySelectOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.label}
                                        </option>
                                    ))}
                                    {categorySelectOptions.length === 0 && <option disabled>No categories</option>}
                                </select>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleApplyCategory}
                                    disabled={categoryApplyDisabled}
                                >
                                    Apply
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleClearCategories}
                                    disabled={clearCategoryDisabled}
                                >
                                    Remove
                                </Button>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={handleBulkDelete}
                                disabled={bulkDeleteDisabled || !canManageProducts}
                            >
                                Delete selected
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {productCount === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
                    <p className="text-lg font-semibold text-slate-800">No products match your filters.</p>
                    <p className="max-w-md text-sm text-slate-500">
                        Try adjusting your search or category filter, or add a new product to populate your catalogue.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Link
                            href="/add-product"
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                        >
                            Add Product
                        </Link>
                        <Link
                            href="/import-products"
                            className="rounded-md border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:border-blue-400 hover:text-blue-700"
                        >
                            Import CSV
                        </Link>
                    </div>
                </div>
            ) : groupByCategory ? (
                <div className="space-y-6">
                    {groupedProducts.map((group) => (
                        <section key={group.id} className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-slate-900">{group.label}</h2>
                                <span className="text-xs font-medium text-slate-400">
                                    {group.items.length} {group.items.length === 1 ? 'product' : 'products'}
                                </span>
                            </div>
                            {renderCollection(group.items)}
                        </section>
                    ))}
                </div>
            ) : (
                renderCollection(filteredProducts)
            )}
        </div>
    );
}
