import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Auth, getIdToken } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';

export interface Task {
  id: string;
  tenant_id: string;
  roomNumber: string;
  status: 'DIRTY' | 'IN_PROGRESS' | 'CLEAN' | 'INSPECTED';
  assigned_to?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private apiUrl = '/api';

  constructor(private http: HttpClient, private auth: Auth) {}

  private async getHeaders(): Promise<HttpHeaders> {
    if (!this.auth.currentUser) {
      throw new Error('Not logged in');
    }

    const token = await getIdToken(this.auth.currentUser);
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  async getMyTasks(): Promise<Task[]> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.get<Task[]>(`${this.apiUrl}/my-tasks`, { headers }));
  }

  async getManagerTasks(): Promise<Task[]> {
    const headers = await this.getHeaders();
    return firstValueFrom(this.http.get<Task[]>(`${this.apiUrl}/manager/tasks`, { headers }));
  }

  async updateStatus(
    taskId: string,
    status: Task['status'],
    roomNumber: string
  ): Promise<unknown> {
    const headers = await this.getHeaders();

    return firstValueFrom(
      this.http.patch(
        `${this.apiUrl}/tasks/${taskId}/status`,
        { status, roomNumber },
        { headers }
      )
    );
  }

  async assignTask(taskId: string, userId: string): Promise<unknown> {
    const headers = await this.getHeaders();

    return firstValueFrom(
      this.http.patch(
        `${this.apiUrl}/manager/assign`,
        { taskId, userId },
        { headers }
      )
    );
  }
}
