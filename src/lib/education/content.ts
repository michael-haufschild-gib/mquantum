/**
 * Educational Content
 * Information about n-dimensional geometry
 */

/**
 * Static educational topic shown in the documentation panel.
 */
export interface EducationTopic {
  id: string
  title: string
  description: string
  details: string[]
}

/**
 * Dimension-specific educational metadata for the documentation panel.
 */
export interface DimensionInfo {
  dimension: number
  name: string
  description: string
  examples: string[]
  properties: string[]
}

const MIN_EDUCATION_DIMENSION = 3
const MAX_EDUCATION_DIMENSION = 11

export const DIMENSION_INFO: Record<number, DimensionInfo> = {
  3: {
    dimension: 3,
    name: '3D Space',
    description: 'Three-dimensional space is the familiar physical space we inhabit.',
    examples: [
      'A cube has 8 vertices, 12 edges, and 6 faces',
      'We navigate 3D space using x, y, and z coordinates',
      'Objects can rotate around 3 axes (pitch, yaw, roll)',
    ],
    properties: [
      '3 perpendicular axes',
      '3 rotation planes (XY, XZ, YZ)',
      'Volume is measured in cubic units',
    ],
  },
  4: {
    dimension: 4,
    name: '4D Space',
    description:
      'Four-dimensional space extends 3D space with an additional perpendicular direction, often called W.',
    examples: [
      'A tesseract (4D hypercube) has 16 vertices, 32 edges, 24 faces, and 8 cells',
      'The 4th dimension is perpendicular to all 3D directions',
      'We can only see 3D "shadows" of 4D objects',
    ],
    properties: [
      '4 perpendicular axes (X, Y, Z, W)',
      '6 rotation planes (XY, XZ, XW, YZ, YW, ZW)',
      'Hypervolume is measured in 4D units',
    ],
  },
  5: {
    dimension: 5,
    name: '5D Space',
    description: 'Five-dimensional space adds a fifth perpendicular direction, often called V.',
    examples: [
      'A 5D hypercube (penteract) has 32 vertices',
      '10 rotation planes exist in 5D',
      'Each 4D "cell" becomes a 5D "teron"',
    ],
    properties: [
      '5 perpendicular axes (X, Y, Z, W, V)',
      '10 rotation planes',
      'Much harder to visualize than 4D',
    ],
  },
  6: {
    dimension: 6,
    name: '6D Space',
    description: 'Six-dimensional space extends into a sixth perpendicular direction.',
    examples: [
      'A 6D hypercube (hexeract) has 64 vertices',
      '15 rotation planes exist in 6D',
      'String theory uses 6 extra compact dimensions',
    ],
    properties: [
      '6 perpendicular axes',
      '15 rotation planes',
      'Used in theoretical physics models',
    ],
  },
}

export const PROJECTION_INFO: EducationTopic = {
  id: 'projection',
  title: 'Projection',
  description: 'Projection reduces higher-dimensional objects to 3D for visualization.',
  details: [
    'Perspective projection: objects farther away appear smaller',
    'Orthographic projection: parallel lines stay parallel',
    'Higher dimensions (4D+) are projected to 3D for display',
    'Projection distance affects how "spread out" the object appears',
  ],
}

export const ROTATION_INFO: EducationTopic = {
  id: 'rotation',
  title: 'Rotation',
  description: 'In n dimensions, rotations occur in planes, not around axes.',
  details: [
    'In 3D: 3 rotation planes (XY, XZ, YZ)',
    'In 4D: 6 rotation planes include XW, YW, ZW',
    'Each plane rotates two coordinates while others stay fixed',
  ],
}

function buildGeneratedDimensionInfo(dimension: number): DimensionInfo {
  const rotationPlaneCount = getRotationPlaneCount(dimension)
  const hypercubeVertexCount = 2 ** dimension

  return {
    dimension,
    name: `${dimension}D Space`,
    description: `${dimension}-dimensional space extends ${dimension - 1}D with one additional perpendicular direction.`,
    examples: [
      `An ${dimension}D hypercube has ${hypercubeVertexCount} vertices`,
      `${rotationPlaneCount} independent rotation planes exist in ${dimension}D`,
      `Visualization uses 3D projections and slices to inspect ${dimension}D structure`,
    ],
    properties: [
      `${dimension} perpendicular axes`,
      `${rotationPlaneCount} rotation planes`,
      'Interpreted through projected 3D volume rendering',
    ],
  }
}

/**
 * Get educational information for a dimension
 * @param dimension - The dimension to get info for
 * @returns Dimension info object or undefined if not found
 */
export function getDimensionInfo(dimension: number): DimensionInfo | undefined {
  if (!Number.isInteger(dimension)) {
    return undefined
  }

  if (dimension < MIN_EDUCATION_DIMENSION || dimension > MAX_EDUCATION_DIMENSION) {
    return undefined
  }

  return DIMENSION_INFO[dimension] ?? buildGeneratedDimensionInfo(dimension)
}

/**
 * Get the number of rotation planes for a dimension
 * @param dimension - The dimension
 * @returns Number of rotation planes (n*(n-1)/2)
 */
export function getRotationPlaneCount(dimension: number): number {
  // Formula: n*(n-1)/2
  return (dimension * (dimension - 1)) / 2
}
