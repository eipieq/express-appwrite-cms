'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { account, databases, storage, DATABASE_ID, COLLECTIONS, STORAGE_BUCKET_ID } from '@/lib/appwrite';
import { useRouter } from 'next/navigation';
import { ID, Query } from 'appwrite';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Category = {
  $id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  parentId: string | null;
  sortOrder: number;
};

export default function CategoriesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState('');
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await account.get();
        setUserId(user.$id);
        await loadCategories(user.$id);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [router]);

  const loadCategories = async (uid: string) => {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.CATEGORIES,
        [
          Query.equal('userId', uid),
          Query.orderAsc('sortOrder'),
          Query.limit(100)
        ]
      );
      setCategories(response.documents as unknown as Category[]);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!editingId) {
      setSlug(generateSlug(value));
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null;

    try {
      const fileId = ID.unique();
      const response = await storage.createFile(
        STORAGE_BUCKET_ID,
        fileId,
        imageFile
      );

      return `${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${STORAGE_BUCKET_ID}/files/${response.$id}/view?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID}`;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId || !name.trim() || !slug.trim()) {
      alert('Name and slug are required');
      return;
    }

    try {
      let imageUrl = existingImage;
      if (imageFile) {
        const uploaded = await uploadImage();
        if (uploaded) imageUrl = uploaded;
      }

      const categoryData = {
        userId,
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        image: imageUrl || null,
        parentId: parentId || null,
        sortOrder: parseInt(sortOrder) || 0
      };

      if (editingId) {
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.CATEGORIES,
          editingId,
          categoryData
        );
        alert('Category updated!');
      } else {
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.CATEGORIES,
          ID.unique(),
          categoryData
        );
        alert('Category created!');
      }

      resetForm();
      if (userId) await loadCategories(userId);
    } catch (error) {
      console.error('Error saving category:', error);
      alert('Failed to save category');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.$id);
    setName(category.name);
    setSlug(category.slug);
    setDescription(category.description || '');
    setParentId(category.parentId || '');
    setSortOrder(String(category.sortOrder));
    setExistingImage(category.image || '');
    setImagePreview(category.image || '');
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? This cannot be undone.')) return;

    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.CATEGORIES, id);
      if (userId) await loadCategories(userId);
      alert('Category deleted');
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSlug('');
    setDescription('');
    setParentId('');
    setSortOrder('0');
    setImageFile(null);
    setExistingImage('');
    setImagePreview('');
    setShowForm(false);
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Categories</h1>
        <div className="flex gap-2">
          {showForm ? (
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
          ) : (
            <Button onClick={() => setShowForm(true)}>+ Add Category</Button>
          )}
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Category' : 'Add Category'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Category Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Cabinet Handles"
                  required
                />
              </div>

              <div>
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="cabinet-handles"
                  required
                />
                <p className="text-xs text-gray-600 mt-1">URL-friendly version (auto-generated)</p>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Category description..."
                  className="min-h-[80px]"
                />
              </div>

              <div>
                <Label htmlFor="parentId">Parent Category (optional)</Label>
                <select
                  id="parentId"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="">None (Top Level)</option>
                  {categories.filter(c => c.$id !== editingId).map(cat => (
                    <option key={cat.$id} value={cat.$id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  placeholder="0"
                />
              </div>

              <div>
                <Label htmlFor="image">Category Image</Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                />
                {imagePreview && (
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    width={128}
                    height={128}
                    unoptimized
                    className="mt-2 h-32 w-32 rounded object-cover"
                  />
                )}
              </div>

              <Button type="submit" className="w-full">
                {editingId ? 'Update Category' : 'Create Category'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Categories ({categories.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-gray-600 text-center py-8">No categories yet. Create one to get started!</p>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => (
                <div key={category.$id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50">
                  {category.image && (
                    <Image
                      src={category.image}
                      alt={category.name}
                      width={64}
                      height={64}
                      unoptimized
                      className="h-16 w-16 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{category.name}</h3>
                    <p className="text-sm text-gray-600">{category.slug}</p>
                    {category.description && (
                      <p className="text-sm text-gray-500 mt-1">{category.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(category)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(category.$id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
