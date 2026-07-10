export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

type ApiErrorBody = {
  error?: unknown;
  message?: unknown;
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await this.parseResponse<T>(response);

    if (!response.ok) {
      throw new ApiError(this.getErrorMessage(data, response.statusText), response.status, data);
    }

    return data;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    if (!text) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(text) as T;
      } catch {
        if (!response.ok) {
          return { error: text } as T;
        }
        throw new Error('服务器返回了无效的 JSON 数据');
      }
    }

    return text as T;
  }

  private getErrorMessage(data: unknown, fallback: string) {
    if (typeof data === 'string' && data.trim()) {
      return data;
    }

    if (data && typeof data === 'object') {
      const body = data as ApiErrorBody;
      if (typeof body.error === 'string' && body.error.trim()) {
        return body.error;
      }
      if (typeof body.message === 'string' && body.message.trim()) {
        return body.message;
      }
    }

    return fallback || 'Request failed';
  }

  get<T>(endpoint: string, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: any, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  put<T>(endpoint: string, body?: any, options?: RequestInit) {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete<T>(endpoint: string, options?: RequestInit) {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
