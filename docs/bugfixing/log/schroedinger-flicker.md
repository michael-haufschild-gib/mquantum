The bug will only appear when all of this true:
1. Selected object type is schroedinger
2. Bloom is on
3. Temporal reprojection is off
4. Rotation animation is on OR manually rotating the camera OR manually zooming in

Then the scene will randomly flicker. Not only the object itself will flicker but a big rectangular part of the whole scene with smaller unaffected areas on the left and right side which change in width randomly.

Additional information:
1. The Schroedinger object will not write to the depth buffer when temporal reprojection is on. Then it only writes to the temporal accumluation buffer.
2. When temporal reprojection is off, the schroedinger object will write to the normal depth buffer.
3. Temporal ON: VOLUMETRIC layer only → rendered by TemporalCloudPass at 1/4 res
4. Temporal OFF: MAIN_OBJECT layer only → rendered by MainObjectMRTPass at full res

  The MainObjectMRTPass only renders MAIN_OBJECT layer, so when Schroedinger is on VOLUMETRIC, it's skipped there.


Already tried and failed:
- Disabling double rendering for the schroedinger object.
