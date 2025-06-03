import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService, type FigmaAuthOptions } from "./services/figma.js";
import type { SimplifiedDesign } from "./services/simplify-node-response.js";
import { Logger } from "./utils/logger.js";
import { calcStringSize } from './utils/calc-string-size.js';
import yaml from 'js-yaml';

const serverInfo = {
  name: "Figma MCP Server",
  version: "0.2.1",
};

function createServer(
  authOptions: FigmaAuthOptions,
  { isHTTP = false }: { isHTTP?: boolean } = {},
) {
  const server = new McpServer(serverInfo);
  // const figmaService = new FigmaService(figmaApiKey);
  const figmaService = new FigmaService(authOptions);
  registerTools(server, figmaService);

  Logger.isHTTP = isHTTP;

  return server;
}

const fileKeyDescription = "The key of the Figma file to fetch, often found in a provided URL like figma.com/(file|design)/<fileKey>/...";
const nodeIdDescription = "The ID of the node to fetch, often found as URL parameter node-id=nodeId, always use if provided. If there are multiple node IDs that need to be obtained simultaneously, they can be combined and passed in with commas as separators.";
const depthDescription = "Optional parameter, Controls how many levels deep to traverse the node tree";


function registerTools(server: McpServer, figmaService: FigmaService): void {

  const sizeLimit = process.env.GET_NODE_SIZE_LIMIT ? parseInt(process.env.GET_NODE_SIZE_LIMIT) : undefined;

  // Tool to get node size
  server.tool(
    "get_figma_data_size",
    `Obtain the memory size of a figma data, return the nodeId and size in KB, e.g 
- nodeId: '1234:5678'
  size: 1024 KB

Allowed to pass in multiple node IDs to batch obtain the sizes of multiple nodes at one time.
`,
    {
      fileKey: z
        .string()
        .describe(fileKeyDescription),
      nodeId: z
        .string()
        .optional()
        .describe(nodeIdDescription),
      depth: z
        .number()
        .optional()
        .describe(depthDescription),
    },
    async ({ fileKey, nodeId, depth }) => {
      try {
        Logger.log(`Getting size for ${nodeId ? `node ${nodeId}` : 'full file'} from file ${fileKey}`);

        let file: SimplifiedDesign;
        if (nodeId) {
          file = await figmaService.getNode(fileKey, nodeId, depth);
        } else {
          file = await figmaService.getFile(fileKey, depth);
        }

        const { nodes, globalVars, ...metadata } = file;

        const results = nodes.map((node) => {
          const result = {
            metadata,
            nodes: [node],
            // TODO: globalVars is not very accurate here
            globalVars,
          };
          const yamlResult = yaml.dump(result)
          const sizeInKB = calcStringSize(yamlResult);
          return {
            nodeId: node.id,
            size: `${sizeInKB} KB`,
          };
        });

        return {
          content: [{ type: "text", text: yaml.dump(results) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        Logger.error(`Error getting node size for ${fileKey}:`, message);
        return {
          isError: true,
          content: [{ type: "text", text: `Error getting node size: ${message}` }],
        };
      }
    },
  );

  const needLimitPrompt = sizeLimit && sizeLimit > 0;

  // Tool to get file information
  server.tool(
    "get_figma_data",
    `When the nodeId cannot be obtained, obtain the layout information about the entire Figma file.

Allowed to pass in multiple node IDs to batch obtain data of multiple nodes at one time.

${needLimitPrompt ? `
## Data Obtained Strategy

For target Figma node (initial or recursive child), follow these steps:

1. **Assess Node Data Size**
    * Use \`get-figma-node-size\` tool to estimate current node size

2. **Determine Method Based on Data Size**

    * **Scenario 1: Node exceeds \`${sizeLimit}\` KB**
      a. **Shallow Obtain**: Call \`get_figma_data\` with \`depth: 1\`
        * Gets direct properties and immediate child nodes list only
      b. **Process Children Recursively**: For each child, repeat from Step 1

    * **Scenario 2: Node under \`${sizeLimit}\` KB**
      a. **Full Obtain**: Call \`get_figma_data\` without depth parameter
        * Gets complete data of current node and all descendants

**Core Idea**: Uses "pruning" concept. For large nodes, get shallow info first, then process children individually. Avoids single large requests while ensuring all data is obtained.
` : ""}
        `,
    {
      fileKey: z
        .string()
        .describe(fileKeyDescription),
      nodeId: z
        .string()
        .optional()
        .describe(nodeIdDescription),
      depth: z
        .number()
        .optional()
        .describe(depthDescription + ',Do NOT use unless explicitly requested.')
    },
    async ({ fileKey, nodeId, depth }) => {
      try {
        Logger.log(
          `Fetching ${depth ? `${depth} layers deep` : "all layers"
          } of ${nodeId ? `node ${nodeId} from file` : `full file`} ${fileKey}`,
        );

        let file: SimplifiedDesign;
        if (nodeId) {
          file = await figmaService.getNode(fileKey, nodeId, depth);
        } else {
          file = await figmaService.getFile(fileKey, depth);
        }

        Logger.log(`Successfully fetched file: ${file.name}`);
        const { nodes, globalVars, ...metadata } = file;

        const result = {
          metadata,
          nodes,
          globalVars,
        };

        const yamlResult = yaml.dump(result);
        const yamlResultSize = calcStringSize(yamlResult);

        Logger.log(`Data size: ${yamlResultSize} KB (YAML)`);

        if (sizeLimit && yamlResultSize > sizeLimit) {
          Logger.log(`Data size exceeds ${sizeLimit} KB, performing truncated reading`);
          return {
            isError: true,
            content: [{ type: "text", text: `Data size exceeds ${sizeLimit} KB, performing truncated reading` }],
          };
        }

        Logger.log("Sending result to client");
        return {
          content: [{ type: "text", text: yamlResult }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        Logger.error(`Error fetching file ${fileKey}:`, message);
        return {
          isError: true,
          content: [{ type: "text", text: `Error fetching file: ${message}` }],
        };
      }
    },
  );

  // TODO: Clean up all image download related code, particularly getImages in Figma service
  // Tool to download images
  server.tool(
    "download_figma_images",
    "Download SVG and PNG images used in a Figma file based on the IDs of image or icon nodes",
    {
      fileKey: z.string().describe("The key of the Figma file containing the node"),
      nodes: z
        .object({
          nodeId: z
            .string()
            .describe("The ID of the Figma image node to fetch, formatted as 1234:5678"),
          imageRef: z
            .string()
            .optional()
            .describe(
              "If a node has an imageRef fill, you must include this variable. Leave blank when downloading Vector SVG images.",
            ),
          fileName: z.string().describe("The local name for saving the fetched file"),
        })
        .array()
        .describe("The nodes to fetch as images"),
      scale: z
        .number()
        .positive()
        .optional()
        .describe(
          "Export scale for PNG images. Optional, generally 2 is best, though users may specify a different scale.",
        ),
      localPath: z
        .string()
        .describe(
          "The absolute path to the directory where images are stored in the project. If the directory does not exist, it will be created. The format of this path should respect the directory format of the operating system you are running on. Don't use any special character escaping in the path name either.",
        ),
    },
    async ({ fileKey, nodes, scale, localPath }) => {
      try {
        const imageFills = nodes.filter(({ imageRef }) => !!imageRef) as {
          nodeId: string;
          imageRef: string;
          fileName: string;
        }[];
        const fillDownloads = figmaService.getImageFills(fileKey, imageFills, localPath);
        const renderRequests = nodes
          .filter(({ imageRef }) => !imageRef)
          .map(({ nodeId, fileName }) => ({
            nodeId,
            fileName,
            fileType: fileName.endsWith(".svg") ? ("svg" as const) : ("png" as const),
          }));

        const renderDownloads = figmaService.getImages(fileKey, renderRequests, localPath, scale);

        const downloads = await Promise.all([fillDownloads, renderDownloads]).then(([f, r]) => [
          ...f,
          ...r,
        ]);

        // If any download fails, return false
        const saveSuccess = !downloads.find((success) => !success);
        return {
          content: [
            {
              type: "text",
              text: saveSuccess
                ? `Success, ${downloads.length} images downloaded: ${downloads.join(", ")}`
                : "Failed",
            },
          ],
        };
      } catch (error) {
        Logger.error(`Error downloading images from file ${fileKey}:`, error);
        return {
          isError: true,
          content: [{ type: "text", text: `Error downloading images: ${error}` }],
        };
      }
    },
  );
}

export { createServer };
