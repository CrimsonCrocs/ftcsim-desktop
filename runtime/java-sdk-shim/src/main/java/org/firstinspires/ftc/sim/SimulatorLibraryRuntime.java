package org.firstinspires.ftc.sim;

import org.firstinspires.ftc.robotcore.external.Telemetry;
import java.util.LinkedHashMap;
import java.util.Map;

/** Per-worker bounded library diagnostics; never opens Android servers or writes host files. */
public final class SimulatorLibraryRuntime {
    private static Telemetry telemetry;
    private static final Map<String, Object> records = new LinkedHashMap<String, Object>();
    private SimulatorLibraryRuntime() {}
    public static synchronized void begin(Telemetry value) { telemetry = value; records.clear(); }
    public static synchronized Telemetry telemetry() {
        if (telemetry == null) throw new IllegalStateException("No active simulator telemetry context");
        return telemetry;
    }
    public static synchronized void record(String channel, Object value) {
        if (channel == null) throw new IllegalArgumentException("Channel cannot be null");
        if (records.size() >= 128 && !records.containsKey(channel)) records.remove(records.keySet().iterator().next());
        records.put(channel, value);
    }
    public static synchronized Object recordForSimulator(String channel) { return records.get(channel); }
}
