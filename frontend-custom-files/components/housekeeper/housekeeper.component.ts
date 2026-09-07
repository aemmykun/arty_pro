import { Component, OnInit } from '@angular/core';
import { ApiService, Task } from '../../services/api.service';

@Component({
  selector: 'app-housekeeper',
  template: `
    <main class="container">
      <h2>My Tasks</h2>

      <p *ngIf="loading">Loading tasks...</p>
      <p *ngIf="error">{{ error }}</p>

      <section *ngFor="let task of tasks" class="card">
        <h3>Room {{ task.roomNumber }}</h3>
        <p>Status: {{ task.status }}</p>

        <button
          *ngIf="task.status !== 'CLEAN'"
          [disabled]="savingTaskId === task.id"
          (click)="markClean(task)"
        >
          {{ savingTaskId === task.id ? 'Saving...' : 'MARK CLEAN' }}
        </button>
      </section>
    </main>
  `
})
export class HousekeeperComponent implements OnInit {
  tasks: Task[] = [];
  loading = false;
  error = '';
  savingTaskId = '';

  constructor(private api: ApiService) {}

  async ngOnInit() {
    this.loading = true;

    try {
      this.tasks = await this.api.getMyTasks();
    } catch {
      this.error = 'Could not load tasks.';
    } finally {
      this.loading = false;
    }
  }

  async markClean(task: Task) {
    this.savingTaskId = task.id;

    try {
      await this.api.updateStatus(task.id, 'CLEAN', task.roomNumber);
      task.status = 'CLEAN';
    } catch {
      this.error = `Could not update room ${task.roomNumber}.`;
    } finally {
      this.savingTaskId = '';
    }
  }
}
