import type { TaskDTO } from "@/features/tasks/types";

/** Sample tasks for the style comparison pages. Never written to the database. */
export const SAMPLE_TASKS: TaskDTO[] = [
  {
    id: "preview-1",
    title: "Draft the launch announcement",
    notes: "Keep it under 200 words.",
    done: false,
    dueDate: "2026-12-04",
    createdAt: "2026-11-20T09:00:00.000Z",
  },
  {
    id: "preview-2",
    title: "Book the venue",
    notes: null,
    done: true,
    dueDate: null,
    createdAt: "2026-11-18T09:00:00.000Z",
  },
  {
    id: "preview-3",
    title: "A much longer task title that wraps onto a second line so you can judge the line height",
    notes: null,
    done: false,
    dueDate: "2026-11-01",
    createdAt: "2026-11-10T09:00:00.000Z",
  },
];
