/** Shared limits and thresholds for coordinate entanglement diagnostics. */

/** Maximum supported single-dimension RDM size (grid points per dimension). */
export const MAX_RDM_SIZE = 64

/** Eigenvalue threshold: values below this are treated as zero in entropy. */
export const EIGENVALUE_THRESHOLD = 1e-12

/** Maximum joint RDM size for bipartition eigendecomp. */
export const MAX_BIPARTITION_RDM = 1024

/** Maximum joint RDM size for pairwise mutual information. */
export const MAX_PAIRWISE_RDM = 1024
