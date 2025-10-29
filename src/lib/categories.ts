import { Query } from 'appwrite';
import { databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';

export type Category = {
  $id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  parentId?: string | null;
  sortOrder?: number | null;
};

export type CategoryOption = {
  id: string;
  label: string;
  depth: number;
};

type CategoryWithChildren = Category & { children: CategoryWithChildren[] };

const DEFAULT_LIMIT = 200;

export type CategoryMeta = {
  id: string;
  slug?: string | null;
  label: string;
  path: string[];
  ancestors: string[];
};

export async function listBusinessCategories(businessId: string): Promise<Category[]> {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.CATEGORIES,
      [
        Query.equal('businessId', businessId),
        Query.orderAsc('sortOrder'),
        Query.limit(DEFAULT_LIMIT),
      ]
    );

    const rawCategories = response.documents as unknown as Category[];
    return rawCategories.sort((a, b) => {
      const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
      const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Failed to list categories:', error);
    return [];
  }
}

export function buildCategoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map(category => [category.$id, category]));
}

function buildCategoryTree(categories: Category[]): CategoryWithChildren[] {
  const map = new Map<string, CategoryWithChildren>();
  const roots: CategoryWithChildren[] = [];

  categories.forEach(category => {
    map.set(category.$id, { ...category, children: [] });
  });

  map.forEach(node => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: CategoryWithChildren[]) => {
    nodes.sort((a, b) => {
      const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
      const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(child => sortNodes(child.children));
  };

  sortNodes(roots);
  return roots;
}

export function buildCategoryOptions(categories: Category[]): CategoryOption[] {
  const tree = buildCategoryTree(categories);
  const options: CategoryOption[] = [];

  const traverse = (nodes: CategoryWithChildren[], depth: number) => {
    nodes.forEach(node => {
      const prefix = depth > 0 ? `${'>'.repeat(depth)} ` : '';
      options.push({
        id: node.$id,
        label: `${prefix}${node.name}`,
        depth,
      });
      traverse(node.children, depth + 1);
    });
  };

  traverse(tree, 0);
  return options;
}

export function getCategoryPath(categoryId: string, lookup: Map<string, Category>): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined | null = categoryId;

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }

    visited.add(currentId);
    const category = lookup.get(currentId);
    if (!category) {
      break;
    }

    path.push(category.name);
    currentId = category.parentId ?? null;
  }

  return path.reverse();
}

export function getCategoryAncestry(categoryId: string, lookup: Map<string, Category>): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined | null = categoryId;

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }

    visited.add(currentId);
    const category = lookup.get(currentId);
    if (!category) {
      break;
    }

    path.push(category.$id);
    currentId = category.parentId ?? null;
  }

  return path.reverse();
}

export function formatCategoryPath(path: string[]): string {
  return path.join(' > ');
}

export function createCategoryMeta(params: {
  category: Category;
  path: string[];
  ancestors: string[];
  label?: string;
}): CategoryMeta {
  const { category, path, ancestors, label } = params;
  const computedLabel =
    label && label.length > 0
      ? label
      : path.length > 0
        ? formatCategoryPath(path)
        : category.name;

  return {
    id: category.$id,
    slug: category.slug ?? null,
    label: computedLabel,
    path,
    ancestors,
  };
}

export function serializeCategoryMeta(meta: CategoryMeta): string {
  const payload: CategoryMeta = {
    id: meta.id,
    slug: typeof meta.slug === 'string' ? meta.slug : null,
    label: meta.label,
    path: Array.isArray(meta.path) ? meta.path : [],
    ancestors: Array.isArray(meta.ancestors) ? meta.ancestors : [],
  };
  return JSON.stringify(payload);
}

export function parseCategoryMeta(value: unknown): CategoryMeta | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const maybeMeta = parsed as Partial<CategoryMeta> & { id?: unknown };
    if (typeof maybeMeta.id !== 'string' || maybeMeta.id.length === 0) {
      return null;
    }

    const labelCandidates = Array.isArray(maybeMeta.path)
      ? (maybeMeta.path as unknown[]).filter((segment): segment is string => typeof segment === 'string' && segment.length > 0)
      : [];
    const ancestors = Array.isArray(maybeMeta.ancestors)
      ? (maybeMeta.ancestors as unknown[]).filter((segment): segment is string => typeof segment === 'string' && segment.length > 0)
      : [];

    const label =
      typeof maybeMeta.label === 'string' && maybeMeta.label.length > 0
        ? maybeMeta.label
        : labelCandidates.length > 0
          ? formatCategoryPath(labelCandidates)
          : maybeMeta.id;

    const slug =
      typeof maybeMeta.slug === 'string' && maybeMeta.slug.length > 0
        ? maybeMeta.slug
        : null;

    return {
      id: maybeMeta.id,
      slug,
      label,
      path: labelCandidates,
      ancestors,
    };
  } catch {
    return null;
  }
}

export function categoryMetaLabel(meta: CategoryMeta | null, fallback?: string | null): string | null {
  if (meta?.label) {
    return meta.label;
  }
  if (meta?.path && meta.path.length > 0) {
    return formatCategoryPath(meta.path);
  }
  return fallback ?? null;
}
