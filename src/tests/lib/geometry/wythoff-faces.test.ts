/**
 * Test to debug Wythoff polytope face detection in higher dimensions
 */

import { describe, it, expect } from 'vitest'
import { generateGeometry } from '@/lib/geometry'
import { detectFaces, getFaceDetectionMethod } from '@/lib/geometry'
import { DEFAULT_EXTENDED_OBJECT_PARAMS } from '@/lib/geometry/extended/types'

describe('Wythoff polytope face detection', () => {
  it('should detect faces for wythoff-polytope in 4D', () => {
    const geo = generateGeometry('wythoff-polytope', 4, {
      ...DEFAULT_EXTENDED_OBJECT_PARAMS,
      wythoffPolytope: {
        symmetryGroup: 'B',
        preset: 'regular',
        customSymbol: [],
        scale: 1.0,
        snub: false,
      },
    })

    console.log('=== 4D Wythoff Regular (Tesseract) ===')
    console.log('Vertices:', geo.vertices.length)
    console.log('Edges:', geo.edges.length)
    console.log('Metadata:', JSON.stringify(geo.metadata, null, 2))

    const faceMethod = getFaceDetectionMethod('wythoff-polytope')
    console.log('Face detection method:', faceMethod)

    const faces = detectFaces(geo.vertices, geo.edges, 'wythoff-polytope', geo.metadata)
    console.log('Detected faces:', faces.length)

    // Tesseract has 24 square 2-faces, should detect some faces
    expect(faces.length).toBeGreaterThan(0)
  })

  it('should detect faces for wythoff-polytope in 6D', () => {
    const geo = generateGeometry('wythoff-polytope', 6, {
      ...DEFAULT_EXTENDED_OBJECT_PARAMS,
      wythoffPolytope: {
        symmetryGroup: 'B',
        preset: 'regular',
        customSymbol: [],
        scale: 1.0,
        snub: false,
      },
    })

    console.log('=== 6D Wythoff Regular ===')
    console.log('Vertices:', geo.vertices.length)
    console.log('Edges:', geo.edges.length)
    console.log(
      'analyticalFaces in metadata:',
      (geo.metadata?.properties?.analyticalFaces as number[][] | undefined)?.length ?? 'MISSING'
    )

    const faceMethod = getFaceDetectionMethod('wythoff-polytope')
    console.log('Face detection method:', faceMethod)

    const faces = detectFaces(geo.vertices, geo.edges, 'wythoff-polytope', geo.metadata)
    console.log('Detected faces:', faces.length)

    expect(faces.length).toBeGreaterThan(0)
  })

  it('should detect faces for wythoff-polytope rectified preset', () => {
    const geo = generateGeometry('wythoff-polytope', 4, {
      ...DEFAULT_EXTENDED_OBJECT_PARAMS,
      wythoffPolytope: {
        symmetryGroup: 'B',
        preset: 'rectified',
        customSymbol: [],
        scale: 1.0,
        snub: false,
      },
    })

    console.log('=== 4D Wythoff Rectified ===')
    console.log('Vertices:', geo.vertices.length)
    console.log('Edges:', geo.edges.length)
    console.log(
      'analyticalFaces in metadata:',
      (geo.metadata?.properties?.analyticalFaces as number[][] | undefined)?.length ?? 'MISSING'
    )

    const faceMethod = getFaceDetectionMethod('wythoff-polytope')
    console.log('Face detection method:', faceMethod)

    const faces = detectFaces(geo.vertices, geo.edges, 'wythoff-polytope', geo.metadata)
    console.log('Detected faces:', faces.length)

    // Even for rectified, should have faces
    expect(faces.length).toBeGreaterThan(0)
  })

  it('should detect faces for root-system in 6D', () => {
    const geo = generateGeometry('root-system', 6, {
      ...DEFAULT_EXTENDED_OBJECT_PARAMS,
      rootSystem: {
        rootType: 'D',
        scale: 1.0,
      },
    })

    console.log('=== 6D Root System D_6 ===')
    console.log('Vertices:', geo.vertices.length)
    console.log('Edges:', geo.edges.length)

    const faceMethod = getFaceDetectionMethod('root-system')
    console.log('Face detection method:', faceMethod)

    const faces = detectFaces(geo.vertices, geo.edges, 'root-system', geo.metadata)
    console.log('Detected faces:', faces.length)

    // D_6 should have many faces
    expect(faces.length).toBeGreaterThan(0)
  })

  it('should cover all vertices with faces for A_7 root-system (8D)', () => {
    // This is the specific case from the bug report where convex-hull was failing
    const geo = generateGeometry('root-system', 8, {
      ...DEFAULT_EXTENDED_OBJECT_PARAMS,
      rootSystem: {
        rootType: 'A',
        scale: 1.0,
      },
    })

    console.log('=== 8D Root System A_7 ===')
    console.log('Vertices:', geo.vertices.length)
    console.log('Edges:', geo.edges.length)

    const faceMethod = getFaceDetectionMethod('root-system')
    console.log('Face detection method:', faceMethod)
    expect(faceMethod).toBe('metadata') // Now uses metadata, not convex-hull

    const faces = detectFaces(geo.vertices, geo.edges, 'root-system', geo.metadata)
    console.log('Detected faces:', faces.length)

    // A_7 should have many faces
    expect(faces.length).toBeGreaterThan(0)

    // Collect all vertices covered by faces
    const coveredVertices = new Set<number>()
    faces.forEach((face) => {
      face.vertices.forEach((idx) => coveredVertices.add(idx))
    })

    console.log('Vertices covered by faces:', coveredVertices.size, 'of', geo.vertices.length)

    // All 56 vertices should be covered (this was failing with convex-hull)
    expect(geo.vertices.length).toBe(56)
    expect(coveredVertices.size).toBe(56)
  })
})
