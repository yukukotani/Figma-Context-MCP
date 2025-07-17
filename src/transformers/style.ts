import type { Node as FigmaDocumentNode, Paint, Vector, RGBA, Transform } from "@figma/rest-api-spec";
import { generateCSSShorthand, isVisible } from "~/utils/common.js";
import { hasValue, isStrokeWeights } from "~/utils/identity.js";

export type CSSRGBAColor = `rgba(${number}, ${number}, ${number}, ${number})`;
export type CSSHexColor = `#${string}`;
export interface ColorValue {
  hex: CSSHexColor;
  opacity: number;
}

export type SimplifiedImageFill = {
  type: "IMAGE";
  imageRef: string;
  scaleMode: "FILL" | "FIT" | "TILE" | "STRETCH";
  scalingFactor?: number;
  // CSS properties for background-image usage (when node has children)
  backgroundSize?: string;
  backgroundRepeat?: string;
  // CSS properties for img tag usage (when node has no children)
  objectFit?: string;
  // Image processing metadata (NOT for CSS translation)
  imageDownloadArguments?: {
    needsCropping: boolean;
    requiresImageDimensions: boolean;
    cropTransform?: Transform;
  };
};

export type SimplifiedGradientFill = {
  type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND";
  gradientHandlePositions?: Vector[];
  gradientStops?: {
    position: number;
    color: ColorValue | string;
  }[];
};

export type SimplifiedPatternFill = {
  type: "PATTERN";
};

export type SimplifiedFill =
  | SimplifiedImageFill
  | SimplifiedGradientFill
  | SimplifiedPatternFill
  | CSSRGBAColor
  | CSSHexColor;

export type SimplifiedStroke = {
  colors: SimplifiedFill[];
  strokeWeight?: string;
  strokeDashes?: number[];
  strokeWeights?: string;
};

/**
 * Translate Figma scale modes to CSS properties based on usage context
 */
function translateScaleMode(
  scaleMode: "FILL" | "FIT" | "TILE" | "STRETCH",
  hasChildren: boolean,
  scalingFactor?: number
): { css: Partial<SimplifiedImageFill>; processing: NonNullable<SimplifiedImageFill["imageDownloadArguments"]> } {
  const isBackground = hasChildren;
  
  switch (scaleMode) {
    case "FILL":
      return {
        css: isBackground 
          ? { backgroundSize: "cover", backgroundRepeat: "no-repeat" }
          : { objectFit: "cover" },
        processing: { needsCropping: false, requiresImageDimensions: false }
      };
    
    case "FIT":
      return {
        css: isBackground
          ? { backgroundSize: "contain", backgroundRepeat: "no-repeat" }
          : { objectFit: "contain" },
        processing: { needsCropping: false, requiresImageDimensions: false }
      };
    
    case "TILE":
      return {
        css: isBackground
          ? { 
              backgroundRepeat: "repeat",
              backgroundSize: scalingFactor ? `calc(var(--original-width) * ${scalingFactor}) calc(var(--original-height) * ${scalingFactor})` : "auto"
            }
          : { objectFit: "none" }, // Tiling doesn't make sense for img tags
        processing: { needsCropping: false, requiresImageDimensions: true }
      };
    
    case "STRETCH":
      return {
        css: isBackground
          ? { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" }
          : { objectFit: "fill" },
        processing: { needsCropping: false, requiresImageDimensions: false }
      };
    
    default:
      return {
        css: {},
        processing: { needsCropping: false, requiresImageDimensions: false }
      };
  }
}

/**
 * Handle imageTransform for post-processing (not CSS translation)
 */
function handleImageTransform(imageTransform: Transform): NonNullable<SimplifiedImageFill["imageDownloadArguments"]> {
  return {
    needsCropping: true,
    requiresImageDimensions: false,
    cropTransform: imageTransform
  };
}

export function buildSimplifiedStrokes(n: FigmaDocumentNode, hasChildren: boolean = false): SimplifiedStroke {
  let strokes: SimplifiedStroke = { colors: [] };
  if (hasValue("strokes", n) && Array.isArray(n.strokes) && n.strokes.length) {
    strokes.colors = n.strokes.filter(isVisible).map((stroke) => parsePaint(stroke, hasChildren));
  }

  if (hasValue("strokeWeight", n) && typeof n.strokeWeight === "number" && n.strokeWeight > 0) {
    strokes.strokeWeight = `${n.strokeWeight}px`;
  }

  if (hasValue("strokeDashes", n) && Array.isArray(n.strokeDashes) && n.strokeDashes.length) {
    strokes.strokeDashes = n.strokeDashes;
  }

  if (hasValue("individualStrokeWeights", n, isStrokeWeights)) {
    strokes.strokeWeight = generateCSSShorthand(n.individualStrokeWeights);
  }

  return strokes;
}
/**
 * Convert a Figma paint (solid, image, gradient) to a SimplifiedFill
 * @param raw - The Figma paint to convert
 * @param hasChildren - Whether the node has children (determines CSS properties)
 * @returns The converted SimplifiedFill
 */
export function parsePaint(raw: Paint, hasChildren: boolean = false): SimplifiedFill {
  if (raw.type === "IMAGE") {
    const baseImageFill: SimplifiedImageFill = {
      type: "IMAGE",
      imageRef: raw.imageRef,
      scaleMode: raw.scaleMode as "FILL" | "FIT" | "TILE" | "STRETCH",
      scalingFactor: raw.scalingFactor,
    };

    // Get CSS properties and processing metadata from scale mode
    const { css, processing } = translateScaleMode(
      baseImageFill.scaleMode,
      hasChildren,
      raw.scalingFactor
    );

    // Handle imageTransform for post-processing if it exists
    let combinedProcessing = processing;
    if (raw.imageTransform) {
      const transformProcessing = handleImageTransform(raw.imageTransform);
      combinedProcessing = { ...processing, ...transformProcessing };
    }

    return {
      ...baseImageFill,
      ...css,
      imageDownloadArguments: combinedProcessing,
    };
  } else if (raw.type === "SOLID") {
    // treat as SOLID
    const { hex, opacity } = convertColor(raw.color!, raw.opacity);
    if (opacity === 1) {
      return hex;
    } else {
      return formatRGBAColor(raw.color!, opacity);
    }
  } else if (raw.type === "PATTERN") {
    return {
      type: raw.type,
    };
  } else if (
    ["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"].includes(
      raw.type,
    )
  ) {
    return {
      type: raw.type as "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND",
      gradientHandlePositions: raw.gradientHandlePositions,
      gradientStops: raw.gradientStops.map(({ position, color }) => ({
        position,
        color: convertColor(color),
      })),
    };
  } else {
    throw new Error(`Unknown paint type: ${raw.type}`);
  }
}

/**
 * Convert hex color value and opacity to rgba format
 * @param hex - Hexadecimal color value (e.g., "#FF0000" or "#F00")
 * @param opacity - Opacity value (0-1)
 * @returns Color string in rgba format
 */
export function hexToRgba(hex: string, opacity: number = 1): string {
  // Remove possible # prefix
  hex = hex.replace("#", "");

  // Handle shorthand hex values (e.g., #FFF)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  // Convert hex to RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Ensure opacity is in the 0-1 range
  const validOpacity = Math.min(Math.max(opacity, 0), 1);

  return `rgba(${r}, ${g}, ${b}, ${validOpacity})`;
}

/**
 * Convert color from RGBA to { hex, opacity }
 *
 * @param color - The color to convert, including alpha channel
 * @param opacity - The opacity of the color, if not included in alpha channel
 * @returns The converted color
 **/
export function convertColor(color: RGBA, opacity = 1): ColorValue {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  // Alpha channel defaults to 1. If opacity and alpha are both and < 1, their effects are multiplicative
  const a = Math.round(opacity * color.a * 100) / 100;

  const hex = ("#" +
    ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()) as CSSHexColor;

  return { hex, opacity: a };
}

/**
 * Convert color from Figma RGBA to rgba(#, #, #, #) CSS format
 *
 * @param color - The color to convert, including alpha channel
 * @param opacity - The opacity of the color, if not included in alpha channel
 * @returns The converted color
 **/
export function formatRGBAColor(color: RGBA, opacity = 1): CSSRGBAColor {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  // Alpha channel defaults to 1. If opacity and alpha are both and < 1, their effects are multiplicative
  const a = Math.round(opacity * color.a * 100) / 100;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
