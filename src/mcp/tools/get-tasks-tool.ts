import { z } from "zod";
import { apiCallWrapper, type ToolResult } from "~/utils/api-call-wrapper.js";

const parameters = {
  projectCode: z.string(),
};

const parametersSchema = z.object(parameters);
export type GetTasksParams = z.infer<typeof parametersSchema>;

async function getTasksHandler(params: GetTasksParams): Promise<ToolResult> {
  return await apiCallWrapper(
    `http://localhost:3000/mcp-api/v1/tasks?projectCode=${params.projectCode}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
    (data) => {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
      };
    },
  );
}

export const getTasksTool = {
  name: "get_tasks",
  description: "Call the get-tasks endpoint at localhost:3000",
  parameters,
  handler: getTasksHandler,
} as const;
