import { resolveAppUrl } from './environment';
import type {
  ClassSummary,
  CurriculumSnapshot,
  GPUStatus,
  Identifier,
  ImportResponse,
  JobProgress,
  LectureAsset,
  LectureDetail,
  LectureSummary,
  ModuleSummary,
  PaginatedResponse,
  SettingsPayload,
  SlideProcessingRequest,
  SlidePreview,
  StorageListing,
  StorageUsage,
  UploadDescriptor,
} from './types';

interface RequestOptions extends RequestInit {
  searchParams?: Record<string, string | number | boolean | undefined | null>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.searchParams);
  const init: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  };

  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Request failed with status ${response.status}: ${text}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

function buildUrl(
  path: string,
  searchParams?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!searchParams) {
    return resolveAppUrl(path);
  }
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    params.append(key, String(value));
  });
  const query = params.toString();
  if (!query) {
    return resolveAppUrl(path);
  }
  return `${resolveAppUrl(path)}?${query}`;
}

export async function fetchCurriculumSnapshot(): Promise<CurriculumSnapshot> {
  return request<CurriculumSnapshot>('/api/curriculum/overview');
}

export async function listClasses(
  offset = 0,
  limit = 50,
): Promise<PaginatedResponse<ClassSummary>> {
  return request<PaginatedResponse<ClassSummary>>('/api/classes', { searchParams: { offset, limit } });
}

export async function listModules(
  classId: Identifier,
  offset = 0,
  limit = 50,
): Promise<PaginatedResponse<ModuleSummary>> {
  return request<PaginatedResponse<ModuleSummary>>(`/api/classes/${classId}/modules`, {
    searchParams: { offset, limit },
  });
}

export async function listLectures(
  classId: Identifier,
  moduleId: Identifier,
  offset = 0,
  limit = 50,
): Promise<PaginatedResponse<LectureSummary>> {
  return request<PaginatedResponse<LectureSummary>>(
    `/api/classes/${classId}/modules/${moduleId}/lectures`,
    { searchParams: { offset, limit } },
  );
}

export async function getLecture(lectureId: Identifier): Promise<LectureDetail> {
  return request<LectureDetail>(`/api/lectures/${lectureId}`);
}

export async function updateLecture(
  lectureId: Identifier,
  payload: Partial<LectureDetail>,
): Promise<LectureDetail> {
  return request<LectureDetail>(`/api/lectures/${lectureId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteLecture(lectureId: Identifier): Promise<void> {
  await request(`/api/lectures/${lectureId}`, { method: 'DELETE' });
}

export async function createLecture(
  payload: Pick<LectureDetail, 'classId' | 'moduleId' | 'name' | 'description'>,
): Promise<LectureDetail> {
  return request<LectureDetail>('/api/lectures', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function uploadAsset({
  lectureId,
  kind,
  file,
  chunkSize = 1024 * 1024 * 8,
  signal,
  onProgress,
}: UploadDescriptor): Promise<LectureAsset> {
  const total = file.size;
  let uploaded = 0;
  const chunkRequests: Promise<Response>[] = [];

  const sendChunk = async (start: number, end: number): Promise<Response> => {
    const slice = file.slice(start, end);
    const chunk = await slice.arrayBuffer();
    const body = new Uint8Array(chunk);
    const response = await fetch(resolveAppUrl(`/api/lectures/${lectureId}/assets/${kind}`), {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Chunk-Start': String(start),
        'X-Chunk-End': String(end),
        'X-Chunk-Total': String(total),
        'X-Chunked-Upload': '1',
        'X-Filename': encodeURIComponent(file.name),
      },
      body,
      signal,
    });
    if (!response.ok) {
      throw new Error(`Chunk upload failed with status ${response.status}`);
    }
    uploaded = Math.min(total, end);
    onProgress?.(uploaded, total);
    return response;
  };

  for (let offset = 0; offset < total; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, total);
    chunkRequests.push(sendChunk(offset, end));
  }

  let finalResponse: Response | null = null;
  for (const chunkPromise of chunkRequests) {
    finalResponse = await chunkPromise;
  }

  if (!finalResponse) {
    throw new Error('Unable to upload file');
  }
  return (await finalResponse.json()) as LectureAsset;
}

export async function removeAsset(lectureId: Identifier, kind: string): Promise<void> {
  await request(`/api/lectures/${lectureId}/assets/${kind}`, { method: 'DELETE' });
}

export async function triggerTranscription(
  lectureId: Identifier,
  payload: { model: string; useGPU: boolean; language?: string | null },
): Promise<JobProgress> {
  return request<JobProgress>(`/api/lectures/${lectureId}/transcribe`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function triggerSlideProcessing(
  lectureId: Identifier,
  payload: SlideProcessingRequest,
): Promise<JobProgress> {
  return request<JobProgress>(`/api/lectures/${lectureId}/process-slides`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchProgressQueue(): Promise<JobProgress[]> {
  return request<JobProgress[]>('/api/progress');
}

export async function cancelProgress(lectureId: Identifier, type: string): Promise<void> {
  await request(`/api/progress/${lectureId}/${type}`, { method: 'DELETE' });
}

export function subscribeToProgress(
  handler: (progress: JobProgress) => void,
): () => void {
  const source = new EventSource(resolveAppUrl('/api/progress/stream'));
  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as JobProgress;
      handler(payload);
    } catch (error) {
      console.error('Failed to parse progress event', error);
    }
  };
  source.onerror = (event) => {
    console.warn('Progress event stream error', event);
  };
  return () => {
    source.close();
  };
}

export async function getStorageListing(path = ''): Promise<StorageListing> {
  return request<StorageListing>('/api/storage/list', {
    searchParams: { path },
  });
}

export async function getStorageUsage(): Promise<StorageUsage> {
  return request<StorageUsage>('/api/storage/usage');
}

export async function purgeProcessedAudio(): Promise<void> {
  await request('/api/storage/purge-audio', { method: 'POST' });
}

export async function downloadStorageArchive(paths: string[]): Promise<Blob> {
  const response = await fetch(resolveAppUrl('/api/storage/download'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  });
  if (!response.ok) {
    throw new Error('Failed to download archive');
  }
  return response.blob();
}

export async function getSettings(): Promise<SettingsPayload> {
  return request<SettingsPayload>('/api/settings');
}

export async function updateSettings(payload: Partial<SettingsPayload>): Promise<SettingsPayload> {
  return request<SettingsPayload>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getGPUStatus(): Promise<GPUStatus> {
  return request<GPUStatus>('/api/settings/whisper-gpu/status');
}

export async function testGPU(): Promise<GPUStatus> {
  return request<GPUStatus>('/api/settings/whisper-gpu/test', { method: 'POST' });
}

export async function exportLibrary(): Promise<Blob> {
  const response = await fetch(resolveAppUrl('/api/settings/export'), {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to export library');
  }
  return response.blob();
}

export async function importLibrary(
  file: File,
  mode: 'merge' | 'replace',
  signal?: AbortSignal,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
): Promise<ImportResponse> {
  const total = file.size;
  const chunkSize = 1024 * 1024 * 8;
  let uploaded = 0;

  for (let offset = 0; offset < total; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, total);
    const slice = file.slice(offset, end);
    const form = new FormData();
    form.append('payload', slice, file.name);
    form.append('mode', mode);
    form.append('chunkStart', String(offset));
    form.append('chunkEnd', String(end));
    form.append('chunkTotal', String(total));

    const response = await fetch(resolveAppUrl('/api/settings/import'), {
      method: 'POST',
      body: form,
      signal,
    });
    if (!response.ok) {
      throw new Error(`Failed to import archive (status ${response.status})`);
    }
    uploaded = end;
    onProgress?.(uploaded, total);
    if (end === total) {
      return (await response.json()) as ImportResponse;
    }
  }
  throw new Error('Import did not complete');
}

export async function listSlidePreviews(lectureId: Identifier): Promise<SlidePreview[]> {
  return request<SlidePreview[]>(`/api/lectures/${lectureId}/slides/previews`);
}

export async function deleteSlidePreview(lectureId: Identifier, previewId: Identifier): Promise<void> {
  await request(`/api/lectures/${lectureId}/slides/previews/${previewId}`, { method: 'DELETE' });
}

