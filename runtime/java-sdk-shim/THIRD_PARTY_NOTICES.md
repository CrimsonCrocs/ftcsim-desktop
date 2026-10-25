# Third-party source notices

The portable runtime includes adapted source from the following pinned artifacts. Other simulator
implementations remain separately authored compatibility code; this file does not change the
repository's license.

Compiled TeamCode artifact bundles also carry this notice at
`META-INF/ftc-sim/THIRD_PARTY_NOTICES.md` alongside the bundled runtime classes.

## FIRST Vision 11.1.0

Source: [official Maven source archive](https://repo.maven.apache.org/maven2/org/firstinspires/ftc/Vision/11.1.0/Vision-11.1.0-sources.jar).
SHA-256: `f56f0ebdccf136448acea6e9610566ddabc916f30da86aec06981b497a47c308`.

Included files under `org/firstinspires/ftc/vision/opencv`:
`Circle.java`, `ColorSpace.java`, `ColorRange.java`, `ImageRegion.java`,
`PredominantColorProcessor.java`, `PredominantColorProcessorImpl.java`,
`ColorBlobLocatorProcessor.java`, and `ColorBlobLocatorProcessorImpl.java`.

Adaptations remove Android annotation/logging dependencies and tighten generic types without
changing the processor algorithms or defaults. The processors use the simulator's Java OpenCV
subset and Java2D annotation canvas. Existing upstream copyright/license headers are retained;
the package notice is also included on the blob implementation, which lacks a header in the
published source archive.

```text
/*
 * Copyright (c) 2024 FIRST
 *
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted (subject to the limitations in the disclaimer below) provided that
 * the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this list
 * of conditions and the following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright notice, this
 * list of conditions and the following disclaimer in the documentation and/or
 * other materials provided with the distribution.
 *
 * Neither the name of FIRST nor the names of its contributors may be used to
 * endorse or promote products derived from this software without specific prior
 * written permission.
 *
 * NO EXPRESS OR IMPLIED LICENSES TO ANY PARTY'S PATENT RIGHTS ARE GRANTED BY THIS
 * LICENSE. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
```

## OpenFTC EasyOpenCV 1.7.3

Source: [official Maven source archive](https://repo.maven.apache.org/maven2/org/openftc/easyopencv/1.7.3/easyopencv-1.7.3-sources.jar).
SHA-256: `974c57870b1c58d6f7b1bce226a6ab7302f004aadacac3dbe979ebc14933d885`.

Included file: `org/openftc/easyopencv/TimestampedOpenCvPipeline.java`, unchanged.

```text
/*
 * Copyright (c) 2020 OpenFTC Team
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
```

## FIRST RobotCore 11.1.0 navigation sources

Source: [official Maven source archive](https://repo.maven.apache.org/maven2/org/firstinspires/ftc/RobotCore/11.1.0/RobotCore-11.1.0-sources.jar).
SHA-256: `e8a594c7b9ded2bc73cf2f5abeca03b436fb4e7109e73938df64fa21f0d01ea2`.

Included files under `org/firstinspires/ftc/robotcore/external/navigation`:
`Orientation.java`, `AxesOrder.java`, `AxesReference.java`, `Axis.java`, `Position.java`,
`Velocity.java`, `Acceleration.java` and `DistanceUnit.java`. Existing notices are retained.
The orientation implementation replaces the Android-dependent assertion helper with a local
argument check and uses independently implemented portable matrix/vector operations. The other
listed value types are unchanged. These sources carry the following notice:

```text
/*
Copyright (c) 2016 Robert Atkinson

All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted (subject to the limitations in the disclaimer below) provided that
the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list
of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice, this
list of conditions and the following disclaimer in the documentation and/or
other materials provided with the distribution.

Neither the name of Robert Atkinson nor the names of his contributors may be used to
endorse or promote products derived from this software without specific prior
written permission.

NO EXPRESS OR IMPLIED LICENSES TO ANY PARTY'S PATENT RIGHTS ARE GRANTED BY THIS
LICENSE. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
```
