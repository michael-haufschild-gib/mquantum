[useWebGPUSupport] WebGPU supported: Object
useDeviceCapabilities.ts:97 [DeviceCapabilities] Detection complete: Object
2mdimension_core.js:874 WASM Module Initialized (with panic hook)
animation-wasm.ts:100 [AnimationWASM] Initialized successfully
WebGPUDevice.ts:172 [WebGPU] Initialized: Object
ToScreenPass.ts:249 ToScreenPass: Input texture not found: ldr-color
execute @ ToScreenPass.ts:249Understand this warning
(index):1 bindGroupLayoutCount (5) is larger than the maximum allowed (4).
 - While calling [Device].CreatePipelineLayout([PipelineLayoutDescriptor ""polytope-face-pipeline-layout""]).
Understand this warning
(index):1 bindGroupLayoutCount (5) is larger than the maximum allowed (4).
 - While calling [Device].CreatePipelineLayout([PipelineLayoutDescriptor ""polytope-edge-pipeline-layout""]).
Understand this warning
(index):1 Error while parsing WGSL: :297:43 error: unresolved type 'BasisVectors'
@group(4) @binding(0) var<uniform> basis: BasisVectors;
                                          ^^^^^^^^^^^^


 - While calling [Device].CreateShaderModule([ShaderModuleDescriptor ""polytope-face-fragment""]).
Understand this warning
(index):1 [Invalid PipelineLayout "polytope-face-pipeline-layout"] is invalid.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""polytope-face-pipeline""]).
Understand this warning
(index):1 [Invalid PipelineLayout "polytope-edge-pipeline-layout"] is invalid.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""polytope-edge-pipeline""]).
Understand this warning
(index):1 Error while parsing WGSL: :31:15 error: 'textureSample' must only be called from uniform control flow
  let color = textureSample(tMainObject, texSampler, uv);
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

:56:11 note: called by 'isHorizonPixel' from 'detectHorizonEdge'
      if (isHorizonPixel(sampleUv)) {
          ^^^^^^^^^^^^^^^^^^^^^^^^

:44:3 note: control flow depends on possibly non-uniform value
  if (centerIsHorizon) {
  ^^

:41:25 note: return value of 'isHorizonPixel' may be non-uniform
  let centerIsHorizon = isHorizonPixel(uv);
                        ^^^^^^^^^^^^^^^^^^


 - While calling [Device].CreateShaderModule([ShaderModuleDescriptor ""environment-composite-fragment""]).
Understand this warning
(index):1 [Invalid ShaderModule "environment-composite-fragment"] is invalid.
 - While validating fragment stage ([Invalid ShaderModule "environment-composite-fragment"], entryPoint: "main").
 - While validating fragment state.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""environment-composite""]).
Understand this warning
(index):1 Entry point ""main"" doesn't exist in the shader module [ShaderModule "tonemap-shader"].
 - While validating fragment stage ([ShaderModule "tonemap-shader"], entryPoint: "main").
 - While validating fragment state.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""tonemap""]).
Understand this warning
(index):1 bindGroupLayoutCount (5) is larger than the maximum allowed (4).
 - While calling [Device].CreatePipelineLayout([PipelineLayoutDescriptor ""polytope-face-pipeline-layout""]).
Understand this warning
(index):1 bindGroupLayoutCount (5) is larger than the maximum allowed (4).
 - While calling [Device].CreatePipelineLayout([PipelineLayoutDescriptor ""polytope-edge-pipeline-layout""]).
Understand this warning
(index):1 Error while parsing WGSL: :297:43 error: unresolved type 'BasisVectors'
@group(4) @binding(0) var<uniform> basis: BasisVectors;
                                          ^^^^^^^^^^^^


 - While calling [Device].CreateShaderModule([ShaderModuleDescriptor ""polytope-face-fragment""]).
Understand this warning
(index):1 [Invalid PipelineLayout "polytope-face-pipeline-layout"] is invalid.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""polytope-face-pipeline""]).
Understand this warning
(index):1 [Invalid PipelineLayout "polytope-edge-pipeline-layout"] is invalid.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""polytope-edge-pipeline""]).
Understand this warning
(index):1 Error while parsing WGSL: :31:15 error: 'textureSample' must only be called from uniform control flow
  let color = textureSample(tMainObject, texSampler, uv);
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

:56:11 note: called by 'isHorizonPixel' from 'detectHorizonEdge'
      if (isHorizonPixel(sampleUv)) {
          ^^^^^^^^^^^^^^^^^^^^^^^^

:44:3 note: control flow depends on possibly non-uniform value
  if (centerIsHorizon) {
  ^^

:41:25 note: return value of 'isHorizonPixel' may be non-uniform
  let centerIsHorizon = isHorizonPixel(uv);
                        ^^^^^^^^^^^^^^^^^^


 - While calling [Device].CreateShaderModule([ShaderModuleDescriptor ""environment-composite-fragment""]).
Understand this warning
(index):1 [Invalid ShaderModule "environment-composite-fragment"] is invalid.
 - While validating fragment stage ([Invalid ShaderModule "environment-composite-fragment"], entryPoint: "main").
 - While validating fragment state.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""environment-composite""]).
Understand this warning
(index):1 Entry point ""main"" doesn't exist in the shader module [ShaderModule "tonemap-shader"].
 - While validating fragment stage ([ShaderModule "tonemap-shader"], entryPoint: "main").
 - While validating fragment state.
 - While calling [Device].CreateRenderPipeline([RenderPipelineDescriptor ""tonemap""]).
Understand this warning
334ToScreenPass.ts:249 ToScreenPass: Input texture not found: ldr-color
execute @ ToScreenPass.ts:249Understand this warning
WebGPUResourcePool.ts:86 Uncaught TypeError: Cannot read properties of undefined (reading 'mode')
    at WebGPUResourcePool.setSize (WebGPUResourcePool.ts:86:23)
    at WebGPURenderGraph.setSize (WebGPURenderGraph.ts:230:15)
    at WebGPUCanvas.tsx:196:13
    at ResizeObserver.<anonymous> (WebGPUCanvas.tsx:211:7)Understand this error
ToScreenPass.ts:249 ToScreenPass: Input texture not found: ldr-color
