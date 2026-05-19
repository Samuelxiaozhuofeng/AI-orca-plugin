/**
 * Todoist API 服务
 * 提供任务的查询、创建、完成功能
 */

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

export interface TodoistTask {
  id: string;
  content: string;
  description: string;
  is_completed: boolean;
  priority: number; // 1-4, 4 是最高优先级
  due?: {
    date: string;        // "2024-01-15"
    string: string;      // "明天下午3点"
    datetime?: string;   // "2024-01-15T15:00:00"
    timezone?: string;
  };
  project_id: string;
  parent_id?: string;    // 父任务 ID（子任务才有）
  labels: string[];
  created_at: string;
  url: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  color: string;
  parent_id?: string;
  order: number;
  is_favorite: boolean;
  is_inbox_project: boolean;
  view_style: string;
}

export interface CreateTaskParams {
  content: string;
  description?: string;
  due_string?: string;  // 自然语言日期，如 "明天下午3点"
  due_date?: string;    // ISO 日期 "2024-01-15"
  priority?: number;    // 1-4
  project_id?: string;
  parent_id?: string;   // 父任务 ID（创建子任务）
  labels?: string[];
}

export interface UpdateTaskParams {
  content?: string;
  description?: string;
  due_string?: string;
  due_date?: string;
  priority?: number;
  labels?: string[];
}

export interface TodoistLabel {
  id: string;
  name: string;
  color: string;
  order: number;
  is_favorite: boolean;
}

export interface TodoistError {
  error: string;
  error_code?: number;
}

// 带项目信息的任务
export interface TaskWithProject extends TodoistTask {
  project?: TodoistProject;
  isOverdue?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Token 管理
// ═══════════════════════════════════════════════════════════════════════════

const TODOIST_TOKEN_KEY = "todoist-api-token";
let cachedToken: string | null = null;

/**
 * 获取 Todoist API Token
 */
export async function getTodoistToken(pluginName: string): Promise<string | null> {
  if (cachedToken) return cachedToken;
  
  try {
    const token = await orca.plugins.getData(pluginName, TODOIST_TOKEN_KEY);
    if (token) {
      cachedToken = token;
      return token;
    }
  } catch (e) {
    console.error("[todoist] Failed to get token:", e);
  }
  return null;
}

/**
 * 保存 Todoist API Token
 */
export async function setTodoistToken(pluginName: string, token: string): Promise<void> {
  await orca.plugins.setData(pluginName, TODOIST_TOKEN_KEY, token);
  cachedToken = token;
}

/**
 * 清除 Token 缓存
 */
export function clearTokenCache(): void {
  cachedToken = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// API 请求
// ═══════════════════════════════════════════════════════════════════════════

const TODOIST_API_BASE = "https://api.todoist.com/rest/v2";

async function todoistFetch<T>(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${TODOIST_API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (fetchErr: any) {
    const msg = fetchErr?.message || String(fetchErr);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      throw new Error("无法连接到 Todoist API，请检查网络连接");
    }
    throw new Error(`网络请求失败：${msg}`);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Todoist Token 无效（401 Unauthorized）。请检查 API Token 是否正确");
    }
    if (response.status === 403) {
      throw new Error("Todoist Token 无权限（403 Forbidden）。请检查 Token 权限范围");
    }
    let errorMsg = `Todoist API error: ${response.status}`;
    try {
      const errorData = await response.json() as TodoistError;
      errorMsg = errorData.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  // 204 No Content（如 close task）
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// 任务操作
// ═══════════════════════════════════════════════════════════════════════════

// 项目缓存
let projectsCache: Map<string, TodoistProject> = new Map();
let projectsCacheTime = 0;
const PROJECTS_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取所有项目
 */
export async function getProjects(token: string): Promise<TodoistProject[]> {
  // 检查缓存
  if (projectsCache.size > 0 && Date.now() - projectsCacheTime < PROJECTS_CACHE_TTL) {
    return Array.from(projectsCache.values());
  }
  
  const projects = await todoistFetch<TodoistProject[]>(token, "/projects");
  
  // 更新缓存
  projectsCache.clear();
  for (const project of projects) {
    projectsCache.set(project.id, project);
  }
  projectsCacheTime = Date.now();
  
  return projects;
}

/**
 * 获取项目（从缓存或API）
 */
export async function getProject(token: string, projectId: string): Promise<TodoistProject | undefined> {
  // 先检查缓存
  if (projectsCache.has(projectId)) {
    return projectsCache.get(projectId);
  }
  
  // 加载所有项目到缓存
  await getProjects(token);
  return projectsCache.get(projectId);
}

/**
 * 检查任务是否逾期
 */
export function isTaskOverdue(task: TodoistTask): boolean {
  if (!task.due) return false;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  if (task.due.datetime) {
    const dueDate = new Date(task.due.datetime);
    return dueDate < now;
  }
  
  if (task.due.date) {
    const dueDate = new Date(task.due.date + "T23:59:59");
    return dueDate < today;
  }
  
  return false;
}

/**
 * 获取今日任务（包含逾期任务）
 */
export async function getTodayTasks(token: string): Promise<TaskWithProject[]> {
  // 使用 filter 获取今日和逾期任务
  // Todoist filter: "today | overdue" 获取今日到期和逾期的任务
  const tasks = await todoistFetch<TodoistTask[]>(
    token,
    "/tasks?filter=" + encodeURIComponent("today | overdue")
  );
  
  // 加载项目信息
  await getProjects(token);
  
  // 添加项目信息和逾期标记
  const tasksWithProject: TaskWithProject[] = tasks.map(task => ({
    ...task,
    project: projectsCache.get(task.project_id),
    isOverdue: isTaskOverdue(task),
  }));
  
  // 排序：逾期任务在前，然后按优先级，最后按时间
  return tasksWithProject.sort((a, b) => {
    // 逾期任务优先
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    
    // 优先级高的在前（priority 4 最高）
    if (a.priority !== b.priority) return b.priority - a.priority;
    
    // 按截止时间排序
    const aTime = a.due?.datetime || a.due?.date || "";
    const bTime = b.due?.datetime || b.due?.date || "";
    return aTime.localeCompare(bTime);
  });
}

/**
 * 获取所有活跃任务
 */
export async function getAllTasks(token: string): Promise<TaskWithProject[]> {
  const tasks = await todoistFetch<TodoistTask[]>(token, "/tasks");
  
  // 加载项目信息
  await getProjects(token);
  
  // 添加项目信息和逾期标记
  const tasksWithProject: TaskWithProject[] = tasks.map(task => ({
    ...task,
    project: projectsCache.get(task.project_id),
    isOverdue: isTaskOverdue(task),
  }));
  
  // 按截止日期排序（逾期在前，无日期的排最后）
  return tasksWithProject.sort((a, b) => {
    // 逾期任务优先
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return (a.due.date || "").localeCompare(b.due.date || "");
  });
}

/**
 * 创建任务
 */
export async function createTask(
  token: string,
  params: CreateTaskParams
): Promise<TodoistTask> {
  const task = await todoistFetch<TodoistTask>(token, "/tasks", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return task;
}

/**
 * 完成任务
 */
export async function closeTask(token: string, taskId: string): Promise<void> {
  await todoistFetch<void>(token, `/tasks/${taskId}/close`, {
    method: "POST",
  });
}

/**
 * 重新打开任务
 */
export async function reopenTask(token: string, taskId: string): Promise<void> {
  await todoistFetch<void>(token, `/tasks/${taskId}/reopen`, {
    method: "POST",
  });
}

/**
 * 删除任务
 */
export async function deleteTask(token: string, taskId: string): Promise<void> {
  await todoistFetch<void>(token, `/tasks/${taskId}`, {
    method: "DELETE",
  });
}

/**
 * 更新任务
 */
export async function updateTask(
  token: string,
  taskId: string,
  params: UpdateTaskParams
): Promise<TodoistTask> {
  const task = await todoistFetch<TodoistTask>(token, `/tasks/${taskId}`, {
    method: "POST",
    body: JSON.stringify(params),
  });
  return task;
}

// ═══════════════════════════════════════════════════════════════════════════
// 标签操作
// ═══════════════════════════════════════════════════════════════════════════

// 标签缓存
let labelsCache: TodoistLabel[] = [];
let labelsCacheTime = 0;
const LABELS_CACHE_TTL = 5 * 60 * 1000;

/**
 * 获取所有标签
 */
export async function getLabels(token: string): Promise<TodoistLabel[]> {
  if (labelsCache.length > 0 && Date.now() - labelsCacheTime < LABELS_CACHE_TTL) {
    return labelsCache;
  }
  
  const labels = await todoistFetch<TodoistLabel[]>(token, "/labels");
  labelsCache = labels;
  labelsCacheTime = Date.now();
  return labels;
}

/**
 * 批量创建任务
 */
export async function createTasksBatch(
  token: string,
  tasks: CreateTaskParams[]
): Promise<TodoistTask[]> {
  const results: TodoistTask[] = [];
  for (const params of tasks) {
    const task = await createTask(token, params);
    results.push(task);
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 格式化任务日期显示
 */
export function formatTaskDue(task: TodoistTask): string {
  if (!task.due) return "";
  
  const { due } = task;
  
  // 如果有具体时间
  if (due.datetime) {
    const date = new Date(due.datetime);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const timeStr = date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    
    if (isToday) {
      return `今天 ${timeStr}`;
    }
    
    // 明天
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return `明天 ${timeStr}`;
    }
    
    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
    }) + " " + timeStr;
  }
  
  // 只有日期
  if (due.date) {
    const date = new Date(due.date + "T00:00:00");
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return "今天";
    }
    
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return "明天";
    }
    
    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
    });
  }
  
  return due.string || "";
}

/**
 * 获取优先级颜色
 */
export function getPriorityColor(priority: number): string {
  switch (priority) {
    case 4: return "#d1453b"; // 红色 - 最高
    case 3: return "#eb8909"; // 橙色
    case 2: return "#246fe0"; // 蓝色
    default: return "var(--orca-color-text-secondary)"; // 默认
  }
}

/**
 * 验证 Token 是否有效
 */
export async function validateToken(token: string): Promise<{ valid: boolean; error?: string }> {
  try {
    // 尝试获取任务列表来验证 token
    // 使用简单的 tasks 端点（不用 filter 参数，避免 filter 语法问题）
    const response = await fetch(`${TODOIST_API_BASE}/tasks`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    // HTTP 错误：区分认证失败和其他错误
    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: "Token 无效或无权限（401/403）。请检查 Token 是否正确" };
    }

    let errorMsg = `HTTP ${response.status}`;
    try {
      const errorData = await response.json() as TodoistError;
      errorMsg = errorData.error || errorMsg;
    } catch {}
    return { valid: false, error: `API 返回错误：${errorMsg}` };
  } catch (err: any) {
    // 网络错误 / CORS / DNS 解析失败 等
    const msg = err?.message || String(err);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      return { valid: false, error: "网络连接失败，无法访问 Todoist API。请检查网络连接" };
    }
    if (msg.includes("timeout") || msg.includes("abort")) {
      return { valid: false, error: "请求超时，请检查网络连接后重试" };
    }
    return { valid: false, error: `连接失败：${msg}` };
  }
}
