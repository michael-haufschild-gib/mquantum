export const classicBlock = `
vec3 getClassic(vec3 dir, float time) {
    // Simple texture sampling at full quality (LOD 0)
    vec3 color = textureLod(uTex, dir, 0.0).rgb;

    // Classic tinting
    color *= uIntensity;

    if (uHue != 0.0 || uSaturation != 1.0) {
        vec3 hsv = rgb2hsv(color);
        hsv.x += uHue;
        hsv.y *= uSaturation;
        color = hsv2rgb(hsv);
    }
    return color;
}
`
