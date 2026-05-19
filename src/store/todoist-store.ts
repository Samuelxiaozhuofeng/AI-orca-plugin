/**
 * Todoist Modal 状态管理
 */

const { proxy } = window.Valtio as any;

export type TodoistViewMode = "today" | "all";

export interface TodoistModalState {
  showTaskList: boolean;
  showAddTask: boolean;
  addTaskContent: string;
  viewMode: TodoistViewMode;
}

export const todoistModalStore: TodoistModalState = proxy({
  showTaskList: false,
  showAddTask: false,
  addTaskContent: "",
  viewMode: "today" as TodoistViewMode,
});

