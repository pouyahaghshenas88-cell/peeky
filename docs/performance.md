# Measuring Peeky resource use

Use Windows 10/11 and compare the same hardware, power mode, display scaling, theme,
and workload. Start the build, let it settle for at least 30 seconds, then measure
for at least a minute. Test the closed Iron Man theme with the pointer away, the
open panel, playing audio, and a fullscreen app separately. The renderer tests use
mocked DOM/canvas and do **not** measure actual Windows CPU or GPU usage.

From PowerShell in the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/measure-resources.ps1 -Seconds 60
```

If multiple copies are running, pass `-ProcessId <id>` for the desired Peeky process.
The script samples Peeky and its process descendants (including WebView2 children),
not just the host process. `CpuOneCorePct` uses 100% for a single logical core;
`CpuSystemPct` divides by the machine's logical processor count. The memory columns
are the sampled sum of private bytes and working sets, not deduplicated shared RAM.
Short-lived processes that begin and end between samples may be missed. To compare
before and after, save the output for each build under identical conditions. Use
Task Manager or Windows Performance Recorder as a second check if a WebView2 process
is not a descendant, or if investigating GPU, power, spikes, or a CPU regression.

Run the automated renderer tests (Node 20 or later):

```sh
npm ci --prefix tests
npm --prefix tests test
```

The tests check that settled Iron Man and black themes stop repainting; cursor
movement, controls, theme switching and full-screen transitions wake the renderer;
and audio capture is disabled while the overlay is tucked. They use mock platform
APIs and do not replace testing the packaged app on Windows.
