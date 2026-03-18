/**
 * Skybox core shader modules index
 */
export { constantsBlock } from './constants.wgsl'
export { uniformAliasesBlock, uniformBindingsBlock, uniformStructBlock } from './uniforms.wgsl'
export {
  fragmentOutputStruct,
  fragmentOutputStructSingle,
  generateVertexOutputStruct,
} from './varyings.wgsl'
