# Shader loop unrolling / duplication policy

User explicitly noted in this project: in shaders, loop unrolling, duplicated code, and inlined code are often intentional performance optimizations. Do not treat WGSL repetition as an elegance/refactor smell by default. Only deduplicate or abstract shader code when emitted WGSL and measured performance remain equivalent or better, with tests/benchmarks proving parity.
