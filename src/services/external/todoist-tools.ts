/**
 * Todoist AI 工具定义和执行
 * 只有在 /todoist-ai 模式下才会启用这些工具
 */

import type { OpenAITool } from "../ai/openai-client";
import {
  getTodayTasks,
  getAllTasks,
  createTask,
  createTasksBatch,
  updateTask,
  closeTask,
  getTodoistToken,
  formatTaskDue,
  getProjects,
  getLabels,
  type TodoistTask,
  type CreateTaskParams,
} from "./todoist-service";
import { getAiChatPluginName } from "../../ui/ai-chat-ui";

// ═══════════════════════════════════════════════════════════════════════════
// Todoist 工具定义
// ═══════════════════════════════════════════════════════════════════════════

export const TODOIST_TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "todoist_get_tasks",
      description: `获取 Todoist 任务列表。

【何时使用】用户问"我今天有什么任务"、"我的待办"、"有哪些事情要做"
【参数】
- filter: "today"=今日任务（含逾期）, "all"=全部未完成任务
【返回】任务列表，包含标题、截止日期、优先级、ID`,
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["today", "all"],
            description: "过滤条件：today=今日任务，all=全部未完成",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_create_task",
      description: `在 Todoist 创建新任务。

【何时使用】用户说"帮我创建任务"、"提醒我..."、"添加待办"
【参数】
- content: 任务内容（必填）
- description: 任务描述/备注（可选）
- due_string: 截止日期，支持自然语言。不填默认今天
- priority: 优先级 1-4，4最高
- project_id: 项目ID（可选，从 todoist_get_projects 获取）
- labels: 标签数组，如 ["工作", "重要"]
【注意】如果用户没有指定日期，任务会默认设为今天`,
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "任务内容",
          },
          description: {
            type: "string",
            description: "任务描述或备注",
          },
          due_string: {
            type: "string",
            description: "截止日期，自然语言格式。不填默认今天",
          },
          priority: {
            type: "number",
            enum: [1, 2, 3, 4],
            description: "优先级：1=普通，2=低，3=中，4=高",
          },
          project_id: {
            type: "string",
            description: "项目ID，从 todoist_get_projects 获取",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "标签列表",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_create_tasks_batch",
      description: `批量创建多个 Todoist 任务。

【何时使用】用户说"帮我创建这些任务"、"添加以下待办"、一次性创建多个任务
【参数】
- tasks: 任务数组，每个任务包含 content（必填）、due_string、priority、project_id、labels
【示例】用户说"帮我创建：买菜、取快递、交水电费"，则创建3个任务`,
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string", description: "任务内容" },
                due_string: { type: "string", description: "截止日期" },
                priority: { type: "number", description: "优先级1-4" },
                project_id: { type: "string", description: "项目ID" },
                labels: { type: "array", items: { type: "string" } },
              },
              required: ["content"],
            },
            description: "任务列表",
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_update_task",
      description: `更新已有的 Todoist 任务。

【何时使用】用户说"修改任务"、"把xxx改成"、"更新任务日期"
【参数】
- task_id: 任务ID（必填，从 todoist_get_tasks 获取）
- content: 新的任务内容
- description: 新的描述
- due_string: 新的截止日期
- priority: 新的优先级
【注意】只需传入要修改的字段`,
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "任务ID",
          },
          content: {
            type: "string",
            description: "新的任务内容",
          },
          description: {
            type: "string",
            description: "新的任务描述",
          },
          due_string: {
            type: "string",
            description: "新的截止日期",
          },
          priority: {
            type: "number",
            enum: [1, 2, 3, 4],
            description: "新的优先级",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_complete_task",
      description: `标记 Todoist 任务为完成。

【何时使用】用户说"完成了xxx任务"、"把xxx标记完成"
【参数】
- task_id: 任务ID（从 todoist_get_tasks 返回的结果中获取）
【注意】需要先调用 todoist_get_tasks 获取任务列表和ID`,
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "任务ID",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_get_projects",
      description: `获取 Todoist 项目列表。

【何时使用】用户问"我有哪些项目"、需要知道项目ID来创建任务到特定项目
【返回】项目列表，包含名称和ID`,
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_get_labels",
      description: `获取 Todoist 标签列表。

【何时使用】用户问"我有哪些标签"、需要知道可用标签
【返回】标签列表`,
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// 工具执行
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 格式化任务列表为可读文本
 */
function formatTaskList(tasks: TodoistTask[], filter: string): string {
  if (tasks.length === 0) {
    return filter === "today" 
      ? "🎉 今日没有待办任务！" 
      : "🎉 没有未完成的任务！";
  }

  const title = filter === "today" ? "📋 今日任务" : "📋 全部任务";
  const lines = tasks.map((task, i) => {
    const due = formatTaskDue(task);
    const priority = task.priority > 1 ? ` [P${5 - task.priority}]` : "";
    const dueStr = due ? ` 📅 ${due}` : "";
    return `${i + 1}. ${task.content}${priority}${dueStr}\n   ID: ${task.id}`;
  });

  return `${title}（共 ${tasks.length} 项）\n\n${lines.join("\n\n")}`;
}

/**
 * 执行 Todoist 工具
 */
export async function executeTodoistTool(
  toolName: string,
  args: any
): Promise<string> {
  const pluginName = getAiChatPluginName();
  const token = await getTodoistToken(pluginName);

  if (!token) {
    return "❌ 未配置 Todoist API Token。请先在设置中配置（AI Chat 面板 → ⋮ 菜单 → Todoist）。";
  }

  try {
    if (toolName === "todoist_get_tasks") {
      const filter = args.filter || "today";
      const tasks = filter === "today" 
        ? await getTodayTasks(token)
        : await getAllTasks(token);
      return formatTaskList(tasks, filter);
    }

    if (toolName === "todoist_create_task") {
      const content = args.content;
      if (!content) {
        return "❌ 缺少任务内容。请告诉我要创建什么任务。";
      }

      const params: CreateTaskParams = { content };
      // 如果没有指定日期，默认为今天
      params.due_string = args.due_string || "今天";
      if (args.priority) params.priority = args.priority;
      if (args.description) params.description = args.description;
      if (args.labels) params.labels = args.labels;
      if (args.project_id) params.project_id = args.project_id;

      const task = await createTask(token, params);
      const due = task.due ? ` 📅 ${formatTaskDue(task)}` : "";
      return `✅ 任务已创建：${task.content}${due}`;
    }

    if (toolName === "todoist_create_tasks_batch") {
      const tasks = args.tasks;
      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return "❌ 缺少任务列表。请提供要创建的任务数组。";
      }

      // 为每个任务设置默认日期
      const tasksWithDefaults = tasks.map((t: any) => ({
        ...t,
        due_string: t.due_string || "今天",
      }));

      const createdTasks = await createTasksBatch(token, tasksWithDefaults);
      const taskList = createdTasks.map((t, i) => `${i + 1}. ${t.content}`).join("\n");
      return `✅ 已创建 ${createdTasks.length} 个任务：\n${taskList}`;
    }

    if (toolName === "todoist_update_task") {
      const taskId = args.task_id;
      if (!taskId) {
        return "❌ 缺少任务 ID。请先用 todoist_get_tasks 获取任务列表。";
      }

      const updateParams: any = {};
      if (args.content) updateParams.content = args.content;
      if (args.description !== undefined) updateParams.description = args.description;
      if (args.due_string) updateParams.due_string = args.due_string;
      if (args.priority) updateParams.priority = args.priority;
      if (args.labels) updateParams.labels = args.labels;

      if (Object.keys(updateParams).length === 0) {
        return "❌ 没有提供要更新的字段。";
      }

      const updatedTask = await updateTask(token, taskId, updateParams);
      return `✅ 任务已更新：${updatedTask.content}`;
    }

    if (toolName === "todoist_complete_task") {
      const taskId = args.task_id;
      if (!taskId) {
        return "❌ 缺少任务 ID。请先用 todoist_get_tasks 获取任务列表。";
      }

      await closeTask(token, taskId);
      return `✅ 任务已完成！`;
    }

    if (toolName === "todoist_get_projects") {
      const projects = await getProjects(token);
      if (projects.length === 0) {
        return "📁 没有找到项目。";
      }
      const projectList = projects.map((p, i) => 
        `${i + 1}. ${p.name}${p.is_inbox_project ? " (收件箱)" : ""}\n   ID: ${p.id}`
      ).join("\n\n");
      return `📁 项目列表（共 ${projects.length} 个）\n\n${projectList}`;
    }

    if (toolName === "todoist_get_labels") {
      const labels = await getLabels(token);
      if (labels.length === 0) {
        return "🏷️ 没有找到标签。";
      }
      const labelList = labels.map((l, i) => `${i + 1}. ${l.name}`).join("\n");
      return `🏷️ 标签列表（共 ${labels.length} 个）\n\n${labelList}`;
    }

    return `❌ 未知的 Todoist 工具：${toolName}`;
  } catch (err: any) {
    console.error("[todoist-tools] Error:", err);
    return `❌ Todoist 操作失败：${err.message}`;
  }
}

/**
 * 检查是否是 Todoist 工具
 */
export function isTodoistTool(toolName: string): boolean {
  return toolName.startsWith("todoist_");
}
