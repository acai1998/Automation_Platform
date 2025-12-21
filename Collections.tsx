import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Play, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

export default function Collections() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    file: null as File | null,
  });

  // Get collections list
  const { data: collections, isLoading: collectionsLoading, refetch } = trpc.collections.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Create collection mutation
  const createMutation = trpc.collections.create.useMutation({
    onSuccess: () => {
      toast.success('Collection created successfully');
      setIsCreateOpen(false);
      setCreateForm({ name: '', description: '', file: null });
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to create collection: ${error.message}`);
    },
  });

  // Run collection mutation
  const runMutation = trpc.execution.run.useMutation({
    onSuccess: (result) => {
      toast.success(`Collection executed: ${result.stats.passedRequests}/${result.stats.totalRequests} passed`);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to execute collection: ${error.message}`);
    },
  });

  // Delete collection mutation
  const deleteMutation = trpc.collections.delete.useMutation({
    onSuccess: () => {
      toast.success('Collection deleted successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to delete collection: ${error.message}`);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCreateForm({ ...createForm, file });
    }
  };

  const handleCreateCollection = async () => {
    if (!createForm.name || !createForm.file) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const text = await createForm.file.text();
      const jsonData = JSON.parse(text);

      createMutation.mutate({
        name: createForm.name,
        description: createForm.description,
        rawJson: jsonData,
      });
    } catch (error: any) {
      toast.error(`Invalid JSON file: ${error.message}`);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Collections</h1>
          <p className="text-gray-500 mt-2">Manage your Postman Collections</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Import Collection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Postman Collection</DialogTitle>
              <DialogDescription>
                Upload a Postman Collection JSON file to get started
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Collection Name</label>
                <Input
                  placeholder="e.g., My API Tests"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                <Textarea
                  placeholder="Describe your collection..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Collection File</label>
                <Input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                />
              </div>
              <Button
                onClick={handleCreateCollection}
                disabled={createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import Collection
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {collectionsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin" />
        </div>
      ) : collections && collections.length > 0 ? (
        <div className="grid gap-4">
          {collections.map((collection) => (
            <Card key={collection.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{collection.name}</CardTitle>
                    <CardDescription>{collection.description}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/collections/${collection.id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runMutation.mutate({ collectionId: collection.id })}
                      disabled={runMutation.isPending}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: collection.id })}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Created: {new Date(collection.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">No collections yet</p>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Collection
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Postman Collection</DialogTitle>
                  <DialogDescription>
                    Upload a Postman Collection JSON file to get started
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Collection Name</label>
                    <Input
                      placeholder="e.g., My API Tests"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                    <Textarea
                      placeholder="Describe your collection..."
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Collection File</label>
                    <Input
                      type="file"
                      accept=".json"
                      onChange={handleFileChange}
                    />
                  </div>
                  <Button
                    onClick={handleCreateCollection}
                    disabled={createMutation.isPending}
                    className="w-full"
                  >
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Import Collection
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
