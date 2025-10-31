import { NextRequest, NextResponse } from 'next/server';
import { Client, Databases, Query } from 'appwrite';
import { categoryMetaLabel, parseCategoryMeta } from '@/lib/categories';
import { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';

const BASE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const allowedOrigins =
  process.env.PRODUCTS_API_ALLOWED_ORIGINS?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean) ?? [];

function resolveAllowedOrigin(request?: NextRequest): string {
  if (allowedOrigins.length === 0) {
    return '*';
  }

  const requestOrigin = request?.headers.get('origin');
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Fall back to the first configured origin so responses always contain a value.
  return allowedOrigins[0];
}

function getCorsHeaders(request?: NextRequest): HeadersInit {
  return {
    ...BASE_CORS_HEADERS,
    'Access-Control-Allow-Origin': resolveAllowedOrigin(request),
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(request)
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');

    if (!businessId) {
      return NextResponse.json(
        { error: 'businessId parameter is required' },
        { status: 400, headers: getCorsHeaders(request) }
      );
    }

    // Create Appwrite client
    const client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

    const databases = new Databases(client);

    // Fetch products for this business
    const productsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PRODUCTS,
      [
        Query.equal('businessId', businessId),
        Query.orderDesc('$createdAt'),
        Query.limit(100)
      ]
    );

    const activeProductDocuments = productsResponse.documents.filter((product) => {
      const archivedValue = product.archived;
      return !(
        archivedValue === true ||
        archivedValue === 'true' ||
        archivedValue === 1 ||
        archivedValue === '1'
      );
    });

    // Fetch all variants for this business
    const variantsResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.PRODUCT_VARIANTS,
      [
        Query.equal('businessId', businessId),
        Query.limit(1000)
      ]
    );

    // Group variants by productId
    const variantsByProduct = new Map();
    variantsResponse.documents.forEach(variant => {
      if (!variantsByProduct.has(variant.productId)) {
        variantsByProduct.set(variant.productId, []);
      }
      variantsByProduct.get(variant.productId).push({
        id: variant.$id,
        variantName: variant.variantName,
        attributes: JSON.parse(variant.attributes),
        price: variant.price,
        sku: variant.sku,
        enabled: variant.enabled,
        images: variant.images || []
      });
    });

    // Combine products with their variants
    const productsWithVariants = activeProductDocuments.map(product => {
      const categoryMeta = parseCategoryMeta(product.category);
      const categoryLabel = categoryMetaLabel(
        categoryMeta,
        typeof product.category === 'string' ? product.category : null
      );

      return {
        id: product.$id,
        name: product.name,
        description: product.description,
        category: product.category,
        categoryLabel,
        categoryMeta,
        basePrice: product.basePrice,
        images: product.images || [],
        hasVariants: product.hasVariants,
        variants: variantsByProduct.get(product.$id) || [],
        createdAt: product.$createdAt,
        updatedAt: product.$updatedAt
      };
    });

    return NextResponse.json(
      {
        success: true,
        count: productsWithVariants.length,
        products: productsWithVariants
      },
      {
        status: 200,
        headers: {
          ...getCorsHeaders(request),
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch products',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500,
      headers: getCorsHeaders(request)
      }
    );
  }
}
