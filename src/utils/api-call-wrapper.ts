import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { Logger } from "./logger.js";

export type ToolResult = z.infer<typeof CallToolResultSchema>;

export async function apiCallWrapper<T>(
  url: string,
  options: RequestInit,
  callback: (data: T) => ToolResult,
): Promise<ToolResult> {
  try {
    Logger.log(`Fetching ${url}`);
    const response = await fetch(url, options);

    const error = await handleFetchError(response);
    if (error) return error;

    const data = await response.json();
    return await callback(data);
  } catch (error) {
    return {
      isError: true,
      content: [
        { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
      ],
    };
  }
}

/**
 * Handle fetch errors by checking to see if the invalid response is an MCP-formatted error
 * and returning. Otherwise, throw a generic error.
 */
export async function handleFetchError(response: Response) {
  if (!response.ok) {
    const errorMessage = JSON.parse(await response.text());

    // If the error message is a valid MCP response, return it as is
    if (CallToolResultSchema.safeParse(errorMessage).success) {
      return errorMessage as ToolResult;
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}
