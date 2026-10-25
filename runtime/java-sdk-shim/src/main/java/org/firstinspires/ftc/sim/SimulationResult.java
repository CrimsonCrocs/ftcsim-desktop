package org.firstinspires.ftc.sim;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Immutable summary from a short proof-run. */
public final class SimulationResult {
    private final int completedCycles;
    private final Map<String, String> latestTelemetry;

    SimulationResult(int completedCycles, Map<String, String> latestTelemetry) {
        this.completedCycles = completedCycles;
        this.latestTelemetry = Collections.unmodifiableMap(
                new LinkedHashMap<String, String>(latestTelemetry));
    }

    public int getCompletedCycles() {
        return completedCycles;
    }

    public Map<String, String> getLatestTelemetry() {
        return latestTelemetry;
    }
}
