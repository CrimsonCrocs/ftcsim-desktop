package ftc.desktop;

import java.nio.file.Files;
import java.nio.file.Path;

/** Scheduling belongs to the trusted host, outside the isolated FTC classloader. */
final class WorkPolicy {
    private static final boolean available;
    static {
        String library = System.getenv("FTC_DESKTOP_JAVA_WORK_POLICY");
        String root = System.getenv("FTC_DESKTOP_RESOURCE_ROOT");
        if (library == null && root != null) library = Path.of(root, "desktop/work-policy.dylib").toString();
        available = library != null && Files.isRegularFile(Path.of(library));
        if (available) System.load(library);
    }
    static int begin() { return available ? exchange(0x19) : -1; }
    static void end(int previous) { if (previous >= 0) exchange(previous); }
    static int current() { return available ? currentNative() : -1; }
    private static int exchange(int requested) {
        int previous = exchangeNative(requested);
        if (previous < 0) throw new IllegalStateException("Could not set JVM thread QoS: " + -previous);
        return previous;
    }
    private static native int exchangeNative(int requested);
    private static native int currentNative();
}
