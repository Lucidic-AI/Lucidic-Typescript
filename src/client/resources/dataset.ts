import { HttpClient } from '../httpClient';

export interface DatasetItem {
  dataset_item_id: string;
  name: string;
  description?: string;
  tags: string[];
  input: Record<string, any>;
  expected_output?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface DatasetResponse {
  dataset_id: string;
  name: string;
  description?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  num_items: number;
  items: DatasetItem[];
}

export class DatasetResource {
  constructor(private http: HttpClient) {}

  async getDataset(datasetId: string): Promise<DatasetResponse> {
    return this.http.get('getdataset', { dataset_id: datasetId });
  }
}