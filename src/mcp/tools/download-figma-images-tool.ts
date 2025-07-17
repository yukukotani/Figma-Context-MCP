import { z } from "zod";
import { FigmaService } from "../../services/figma.js";
import { Logger } from "../../utils/logger.js";

const parameters = {
  fileKey: z.string().describe("The key of the Figma file containing the images"),
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
      fileName: z
        .string()
        .describe(
          "The local name for saving the fetched file, including extension. Either png or svg.",
        ),
      needsCropping: z
        .boolean()
        .optional()
        .describe("Whether this image needs cropping based on its transform matrix"),
      cropTransform: z
        .array(z.array(z.number()))
        .optional()
        .describe("Figma transform matrix for image cropping"),
      requiresImageDimensions: z
        .boolean()
        .optional()
        .describe("Whether this image requires dimension information for CSS variables"),
      filenameSuffix: z
        .string()
        .optional()
        .describe(
          "Suffix to add to filename for unique cropped images, provided in the Figma data (e.g., 'abc123')",
        ),
    })
    .array()
    .describe("The nodes to fetch as images"),
  pngScale: z
    .number()
    .positive()
    .optional()
    .default(2)
    .describe(
      "Export scale for PNG images. Optional, defaults to 2 if not specified. Affects PNG images only.",
    ),
  localPath: z
    .string()
    .describe(
      "The absolute path to the directory where images are stored in the project. If the directory does not exist, it will be created. The format of this path should respect the directory format of the operating system you are running on. Don't use any special character escaping in the path name either.",
    ),
};

const parametersSchema = z.object(parameters);
export type DownloadImagesParams = z.infer<typeof parametersSchema>;

// Enhanced handler function with image processing support
async function downloadFigmaImages(params: DownloadImagesParams, figmaService: FigmaService) {
  try {
    const { fileKey, nodes, localPath, pngScale = 2 } = params;

    // Deduplicate identical imageRefs without filenameSuffix to avoid redundant downloads
    const deduplicatedItems: Array<{
      imageRef?: string;
      nodeId?: string;
      fileName: string;
      needsCropping: boolean;
      cropTransform?: any;
      requiresImageDimensions: boolean;
    }> = [];
    const imageRefMap = new Map<
      string,
      { canonicalFileName: string; requestedFileNames: string[] }
    >();

    nodes.forEach((node) => {
      // Apply filename suffix if provided (for unique cropped images)
      let finalFileName = node.fileName;
      if (node.filenameSuffix && !node.fileName.includes(node.filenameSuffix)) {
        const ext = finalFileName.split(".").pop();
        const nameWithoutExt = finalFileName.substring(0, finalFileName.lastIndexOf("."));
        finalFileName = `${nameWithoutExt}-${node.filenameSuffix}.${ext}`;
      }

      const baseItem = {
        fileName: finalFileName,
        needsCropping: node.needsCropping || false,
        cropTransform: node.cropTransform,
        requiresImageDimensions: node.requiresImageDimensions || false,
      };

      if (node.imageRef) {
        // For image fills, check if we can deduplicate
        const dedupeKey = `${node.imageRef}-${node.filenameSuffix || "none"}`;

        if (!node.filenameSuffix && imageRefMap.has(dedupeKey)) {
          // Same imageRef without suffix - add to requested filenames but don't download again
          const existing = imageRefMap.get(dedupeKey)!;
          existing.requestedFileNames.push(finalFileName);

          // If ANY of the deduplicated items needs dimensions, update the download item
          if (baseItem.requiresImageDimensions) {
            const existingItemIndex = deduplicatedItems.findIndex(
              (item) =>
                item.imageRef === node.imageRef && item.fileName === existing.canonicalFileName,
            );
            if (existingItemIndex !== -1) {
              deduplicatedItems[existingItemIndex].requiresImageDimensions = true;
            }
          }
        } else {
          // New unique image (either different imageRef or has filenameSuffix)
          deduplicatedItems.push({ ...baseItem, imageRef: node.imageRef });
          imageRefMap.set(dedupeKey, {
            canonicalFileName: finalFileName,
            requestedFileNames: [finalFileName],
          });
        }
      } else {
        // Rendered nodes - always unique
        deduplicatedItems.push({ ...baseItem, nodeId: node.nodeId });
      }
    });

    const items = deduplicatedItems;

    const allDownloads = await figmaService.downloadImages(fileKey, localPath, items, {
      pngScale,
    });

    const successCount = allDownloads.filter(Boolean).length;

    // Format concise output focused on CSS generation needs
    const imagesList = allDownloads
      .map((result) => {
        const fileName = result.filePath.split("/").pop() || result.filePath;
        const dimensions = `${result.finalDimensions.width}x${result.finalDimensions.height}`;
        const cropStatus = result.wasCropped ? " (cropped)" : "";

        // For images with CSS variables, show them explicitly instead of just dimensions
        let dimensionInfo = dimensions;
        if (result.cssVariables) {
          dimensionInfo = `${dimensions} | ${result.cssVariables}`;
        }

        // Check if this file was requested under multiple names (deduplication)
        const matchingDedupeEntry = [...imageRefMap.values()].find(
          (entry) => entry.canonicalFileName === fileName,
        );

        if (matchingDedupeEntry && matchingDedupeEntry.requestedFileNames.length > 1) {
          const aliases = matchingDedupeEntry.requestedFileNames.filter(
            (name) => name !== fileName,
          );
          const aliasText = aliases.length > 0 ? ` (also requested as: ${aliases.join(", ")})` : "";
          return `- ${fileName}: ${dimensionInfo}${cropStatus}${aliasText}`;
        }

        return `- ${fileName}: ${dimensionInfo}${cropStatus}`;
      })
      .join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: `Downloaded ${successCount} images:\n${imagesList}`,
        },
      ],
    };
  } catch (error) {
    Logger.error(`Error downloading images from ${params.fileKey}:`, error);
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Failed to download images: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

// Export tool configuration
export const downloadFigmaImagesTool = {
  name: "download_figma_images",
  description:
    "Download SVG and PNG images used in a Figma file based on the IDs of image or icon nodes",
  parameters,
  handler: downloadFigmaImages,
} as const;
