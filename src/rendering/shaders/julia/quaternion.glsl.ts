export const quaternionBlock = `
// ============================================
// Quaternion Operations for Julia Sets
// OPT: Fast paths for powers 2-4 are inlined in SDF
// This file handles powers 5+ and non-integer powers
// ============================================

// Quaternion multiplication: q1 * q2
vec4 quatMul(vec4 q1, vec4 q2) {
    return vec4(
        q1.x * q2.x - q1.y * q2.y - q1.z * q2.z - q1.w * q2.w,
        q1.x * q2.y + q1.y * q2.x + q1.z * q2.w - q1.w * q2.z,
        q1.x * q2.z - q1.y * q2.w + q1.z * q2.x + q1.w * q2.y,
        q1.x * q2.w + q1.y * q2.z - q1.z * q2.y + q1.w * q2.x
    );
}

// Quaternion squared: q * q (optimized, avoids full multiplication)
vec4 quatSqr(vec4 q) {
    float xx = q.x * q.x;
    float yy = q.y * q.y;
    float zz = q.z * q.z;
    float ww = q.w * q.w;
    return vec4(
        xx - yy - zz - ww,
        2.0 * q.x * q.y,
        2.0 * q.x * q.z,
        2.0 * q.x * q.w
    );
}

// Quaternion power using hyperspherical coordinates
// For generalized power n (including non-integer)
// NOTE: Powers 2, 3, 4 are inlined in SDF for maximum performance
// This function handles powers 5+ and non-integer powers
vec4 quatPow(vec4 q, float n) {
    // Fast path for power 5: q^5 = q^4 * q = (q^2)^2 * q
    if (n == 5.0) {
        vec4 q2 = quatSqr(q);
        vec4 q4 = quatSqr(q2);
        return quatMul(q4, q);
    }

    // Fast path for power 6: q^6 = (q^2)^3 = (q^2)^2 * q^2
    if (n == 6.0) {
        vec4 q2 = quatSqr(q);
        vec4 q4 = quatSqr(q2);
        return quatMul(q4, q2);
    }

    // Fast path for power 7: q^7 = q^6 * q
    if (n == 7.0) {
        vec4 q2 = quatSqr(q);
        vec4 q4 = quatSqr(q2);
        vec4 q6 = quatMul(q4, q2);
        return quatMul(q6, q);
    }

    // Fast path for power 8: q^8 = ((q^2)^2)^2
    if (n == 8.0) {
        vec4 q2 = quatSqr(q);
        vec4 q4 = quatSqr(q2);
        return quatSqr(q4);
    }

    // General hyperspherical approach for other powers
    float r = length(q);
    if (r < EPS) return vec4(0.0);

    // Normalize the vector part
    vec3 v = q.yzw;
    float vLen = length(v);

    if (vLen < EPS) {
        // Pure scalar quaternion
        float rn = pow(r, n);
        return vec4(rn * (q.x >= 0.0 ? 1.0 : -1.0), 0.0, 0.0, 0.0);
    }

    // Convert to hyperspherical: q = r * (cos(theta) + sin(theta) * v_hat)
    float theta = acos(clamp(q.x / r, -1.0, 1.0));
    vec3 vHat = v / vLen;

    // Apply power: q^n = r^n * (cos(n*theta) + sin(n*theta) * v_hat)
    float rn = pow(r, n);
    float nTheta = n * theta;
    float cosNT = cos(nTheta);
    float sinNT = sin(nTheta);

    return vec4(rn * cosNT, rn * sinNT * vHat);
}
`
