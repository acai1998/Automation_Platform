import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Play, Trash2, Eye, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

// Mock data for demo
const mockCollections = [
  { id: 1, name: '示例 API 集合', description: '演示 API 测试', createdAt: new Date().toISOString() }
];

export default function Collections() {
  const [, setLocation] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [collections, setCollections] = useState(mockCollections);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    file: null as File | null,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCreateForm({ ...createForm, file });
    }
  };

  const handleCreateCollection = async () => {
    if (!createForm.name || !createForm.file) {
      toast.error('请填写所有必填项');
      return;
    }

    try {
      const text = await createForm.file.text();
      JSON.parse(text); // Validate JSON

      setCollections([...collections, {
        id: Date.now(),
        name: createForm.name,
        description: createForm.description,
        createdAt: new Date().toISOString()
      }]);
      toast.success('集合创建成功');
      setIsCreateOpen(false);
      setCreateForm({ name: '', description: '', file: null });
    } catch (error: any) {
      toast.error(`无效的 JSON 文件: ${error.message}`);
    }
  };

  const handleRun = (id: number) => {
    toast.success('集合执行已开始');
  };

  const handleDelete = (id: number) => {
    setCollections(collections.filter(c => c.id !== id));
    toast.success('集合已删除');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold">测试集合</h1>
            <p className="text-gray-500">管理您的 Postman 测试集合</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-end mb-8">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                导入集合
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>导入 Postman 集合</DialogTitle>
                <DialogDescription>
                  上传 Postman Collection JSON 文件开始使用
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">集合名称</label>
                  <Input
                    placeholder="例如：我的 API 测试"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">描述（可选）</label>
                  <Textarea
                    placeholder="描述您的集合..."
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">集合文件</label>
                  <Input
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                  />
                </div>
                <Button onClick={handleCreateCollection} className="w-full">
                  导入集合
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {collections.length > 0 ? (
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
                        title="查看详情"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRun(collection.id)}
                        title="运行测试"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(collection.id)}
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500">
                    创建时间：{new Date(collection.createdAt).toLocaleDateString('zh-CN')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500 mb-4">暂无集合</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                创建您的第一个集合
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
