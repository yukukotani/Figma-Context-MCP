import fs from "fs";
import path from "path";
import type { Transform } from "@figma/rest-api-spec";

/**
 * Apply crop transform to an image based on Figma's transformation matrix
 * @param imagePath - Path to the original image file
 * @param cropTransform - Figma transform matrix [[scaleX, skewX, translateX], [skewY, scaleY, translateY]]
 * @returns Promise<string> - Path to the cropped image
 */
export async function applyCropTransform(
  imagePath: string,
  cropTransform: Transform,
): Promise<string> {
  // Extract transform values
  const scaleX = cropTransform[0]?.[0] ?? 1;
  const skewX = cropTransform[0]?.[1] ?? 0;
  const translateX = cropTransform[0]?.[2] ?? 0;
  const skewY = cropTransform[1]?.[0] ?? 0;
  const scaleY = cropTransform[1]?.[1] ?? 1;
  const translateY = cropTransform[1]?.[2] ?? 0;

  // TODO: Implement actual image cropping
  // For now, we'll just return the original path and log the transform info
  console.log(`Crop transform for ${imagePath}:`, {
    scaleX,
    skewX,
    translateX,
    skewY,
    scaleY,
    translateY,
  });

  // Return original path for now
  return imagePath;
}

/**
 * Get image dimensions from a file
 * @param imagePath - Path to the image file
 * @returns Promise<{width: number, height: number}>
 */
export async function getImageDimensions(imagePath: string): Promise<{
  width: number;
  height: number;
}> {
  // TODO: Implement actual image dimension reading
  // For now, return placeholder dimensions
  console.log(`Getting dimensions for ${imagePath}`);
  return { width: 1000, height: 1000 };
}

/**
 * Enhanced image download with post-processing
 * @param fileName - The filename to save as
 * @param localPath - The local path to save to
 * @param imageUrl - Image URL
 * @param needsCropping - Whether to apply crop transform
 * @param cropTransform - Transform matrix for cropping
 * @returns Promise<string> - Path to the final processed image
 */
export async function downloadAndProcessImage(
  fileName: string,
  localPath: string,
  imageUrl: string,
  needsCropping: boolean = false,
  cropTransform?: Transform,
): Promise<string> {
  // First download the original image
  const { downloadFigmaImage } = await import("./common.js");
  const originalPath = await downloadFigmaImage(fileName, localPath, imageUrl);

  // If no cropping needed, return original
  if (!needsCropping || !cropTransform) {
    return originalPath;
  }

  // Apply crop transform
  const croppedPath = await applyCropTransform(originalPath, cropTransform);

  // If we created a new cropped image, we might want to clean up the original
  // For now, keep both for debugging
  return croppedPath;
}

/**
 * Create CSS custom properties for image dimensions
 * @param imagePath - Path to the image file
 * @returns Promise<string> - CSS custom properties
 */
export async function generateImageCSSVariables(imagePath: string): Promise<string> {
  const { width, height } = await getImageDimensions(imagePath);
  return `--original-width: ${width}px; --original-height: ${height}px;`;
}