import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FigmaService } from "../services/figma.js";
import { Logger } from "../utils/logger.js";
import {
  downloadFigmaImagesTool,
  getFigmaDataTool,
  getTasksTool,
  getTaskTool,
  type DownloadImagesParams,
  type GetFigmaDataParams,
  type GetTaskParams,
  type GetTasksParams,
} from "./tools/index.js";
import type { AuthOptions } from "~/config.js";
import { FramelinkService } from "~/services/framelink.js";

const serverInfo = {
  name: "Figma MCP Server",
  version: process.env.NPM_PACKAGE_VERSION ?? "unknown",
};

type CreateServerOptions = {
  isHTTP?: boolean;
  outputFormat?: "yaml" | "json";
  skipImageDownloads?: boolean;
};

function createServer(
  authOptions: AuthOptions,
  { isHTTP = false, outputFormat = "yaml", skipImageDownloads = false }: CreateServerOptions = {},
) {
  const server = new McpServer(serverInfo);
  const figma = new FigmaService(authOptions.figma);
  const framelink = authOptions.framelink.active
    ? new FramelinkService(authOptions.framelink)
    : null;
  registerTools(server, { figma, framelink }, { outputFormat, skipImageDownloads });

  Logger.isHTTP = isHTTP;

  return server;
}

function registerTools(
  server: McpServer,
  { figma, framelink }: { figma: FigmaService; framelink?: FramelinkService | null },
  options: {
    outputFormat: "yaml" | "json";
    skipImageDownloads: boolean;
  },
): void {
  // Register get_figma_data tool
  server.tool(
    getFigmaDataTool.name,
    getFigmaDataTool.description,
    getFigmaDataTool.parameters,
    (params: GetFigmaDataParams) => getFigmaDataTool.handler(params, figma, options.outputFormat),
  );

  // Register download_figma_images tool if CLI flag or env var is not set
  if (!options.skipImageDownloads) {
    server.tool(
      downloadFigmaImagesTool.name,
      downloadFigmaImagesTool.description,
      downloadFigmaImagesTool.parameters,
      (params: DownloadImagesParams) => downloadFigmaImagesTool.handler(params, figma),
    );
  }

  if (framelink) {
    console.log("Registering Framelink tools", framelink);
    // Register get_tasks tool
    server.tool(
      getTasksTool.name,
      getTasksTool.description,
      getTasksTool.parameters,
      (params: GetTasksParams) => getTasksTool.handler(params, framelink),
    );

    // Register get_task tool
    server.tool(
      getTaskTool.name,
      getTaskTool.description,
      getTaskTool.parameters,
      (params: GetTaskParams) => getTaskTool.handler(params, framelink),
    );
  }
}

export { createServer };
