/**
 * Wavefunction Buffer GPU Readback
 *
 * Reads the full psiRe/psiIm wavefunction buffers from GPU to CPU.
 * Supports mode-aware buffer layouts (TDSE: 1 component, Pauli: 2, Dirac: S).
 *
 * @module rendering/webgpu/utils/wavefunctionReadback
 */

/** Result of a wavefunction readback operation. */
export interface WavefunctionReadbackResult {
  /** Real parts of the wavefunction (interleaved for multi-component) */
  re: Float32Array
  /** Imaginary parts of the wavefunction */
  im: Float32Array
  /** Total number of lattice sites */
  totalSites: number
  /** Number of components per site (1 for TDSE/BEC, 2 for Pauli, S for Dirac) */
  componentCount: number
}

/**
 * Read back the full wavefunction state from GPU compute buffers.
 *
 * Creates staging buffers, copies data from compute buffers, maps and reads.
 * The staging buffers are destroyed after readback.
 *
 * @param device - GPU device
 * @param psiReBuffer - Source buffer for real parts
 * @param psiImBuffer - Source buffer for imaginary parts
 * @param totalElements - Total number of f32 elements (componentCount * totalSites)
 * @param totalSites - Number of lattice sites
 * @param componentCount - Number of complex components per site
 * @returns Promise resolving to the readback result
 */
export async function readbackWavefunction(
  device: GPUDevice,
  psiReBuffer: GPUBuffer,
  psiImBuffer: GPUBuffer,
  totalElements: number,
  totalSites: number,
  componentCount: number
): Promise<WavefunctionReadbackResult> {
  const byteSize = totalElements * 4

  const stagingRe = device.createBuffer({
    label: 'wavefunction-readback-re',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  const stagingIm = device.createBuffer({
    label: 'wavefunction-readback-im',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  const encoder = device.createCommandEncoder({ label: 'wavefunction-readback' })
  encoder.copyBufferToBuffer(psiReBuffer, 0, stagingRe, 0, byteSize)
  encoder.copyBufferToBuffer(psiImBuffer, 0, stagingIm, 0, byteSize)
  device.queue.submit([encoder.finish()])

  await device.queue.onSubmittedWorkDone()

  await Promise.all([stagingRe.mapAsync(GPUMapMode.READ), stagingIm.mapAsync(GPUMapMode.READ)])

  const re = new Float32Array(new Float32Array(stagingRe.getMappedRange()).slice(0))
  const im = new Float32Array(new Float32Array(stagingIm.getMappedRange()).slice(0))

  stagingRe.unmap()
  stagingIm.unmap()
  stagingRe.destroy()
  stagingIm.destroy()

  return { re, im, totalSites, componentCount }
}
