export interface GitHubRepository {
  id: string;
  name: string;
  description?: string;
  url: string;
  language?: string;
  status: 'active' | 'inactive' | 'archived';
  stars?: number;
  lastSync?: string;
  createdAt: string;
}
