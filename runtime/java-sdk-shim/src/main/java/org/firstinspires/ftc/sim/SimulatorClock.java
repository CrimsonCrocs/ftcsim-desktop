package org.firstinspires.ftc.sim;

/** One-JVM deterministic clock advanced exclusively by simulator control ticks. */
public final class SimulatorClock {
    private static final Object LOCK = new Object();
    private static long nowMillis;
    private static long runtimeStartMillis;
    private static long tickGeneration;
    private static long lastIdleGeneration;
    private static boolean closed;
    private static boolean linearWorkerCompleted;

    private SimulatorClock() {}

    public static void reset() {
        synchronized (LOCK) {
            nowMillis = 0;
            runtimeStartMillis = 0;
            tickGeneration = 0;
            lastIdleGeneration = -1;
            closed = false;
            linearWorkerCompleted = false;
            LOCK.notifyAll();
        }
    }

    public static void advance(long deltaMillis) {
        if (deltaMillis < 0) throw new IllegalArgumentException("deltaMillis cannot be negative");
        synchronized (LOCK) {
            nowMillis += deltaMillis;
            tickGeneration++;
            LOCK.notifyAll();
        }
    }

    /** Advances one control generation to an authoritative browser/world timestamp. */
    public static void advanceTo(long simulationTimeMillis) {
        synchronized (LOCK) {
            if (closed) throw new IllegalStateException("Simulation clock is closed");
            if (simulationTimeMillis <= nowMillis) {
                throw new IllegalArgumentException("Simulation time must advance monotonically");
            }
            nowMillis = simulationTimeMillis;
            tickGeneration++;
            LOCK.notifyAll();
        }
    }

    /** Synchronizes a lifecycle boundary without pretending that another robot-control tick ran. */
    public static void synchronizeTo(long simulationTimeMillis) {
        synchronized (LOCK) {
            if (closed) throw new IllegalStateException("Simulation clock is closed");
            if (simulationTimeMillis < nowMillis) {
                throw new IllegalArgumentException("Simulation time cannot move backwards");
            }
            nowMillis = simulationTimeMillis;
            LOCK.notifyAll();
        }
    }

    public static long nowMillis() {
        synchronized (LOCK) { return nowMillis; }
    }

    /** Bytecode clock adapters use a nonzero epoch so zero remains a library's unset sentinel. */
    public static long nanoTime() { return (nowMillis() + 1000L) * 1_000_000L; }
    public static long currentTimeMillis() { return nowMillis() + 1000L; }

    public static void sleep(long milliseconds, int nanoseconds) {
        if (nanoseconds < 0 || nanoseconds > 999999) throw new IllegalArgumentException("Invalid nanoseconds");
        sleep(milliseconds + (nanoseconds == 0 ? 0 : 1));
    }

    public static void resetRuntime() {
        synchronized (LOCK) { runtimeStartMillis = nowMillis; }
    }

    public static double secondsSinceRuntimeReset() {
        synchronized (LOCK) { return (nowMillis - runtimeStartMillis) / 1000.0; }
    }

    /** Stage the next OpMode time before advancing the generation that wakes linear code. */
    public static double secondsSinceRuntimeResetAtForSimulator(long simulationTimeMillis) {
        synchronized (LOCK) { return (simulationTimeMillis - runtimeStartMillis) / 1000.0; }
    }

    public static void idle() {
        synchronized (LOCK) {
            lastIdleGeneration = tickGeneration;
            LOCK.notifyAll();
            long observed = tickGeneration;
            while (!closed && tickGeneration == observed) {
                try {
                    LOCK.wait();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    public static void awaitLinearLoopForCurrentTick(long wallTimeoutMillis) {
        synchronized (LOCK) {
            // The host debugger bounds active execution and total pause time.
            // Wall-clock waits inside a suspended target must survive a breakpoint.
            long deadline = System.nanoTime() + (Boolean.getBoolean("ftcsim.debug") ? 86400000L : wallTimeoutMillis) * 1_000_000L;
            while (!closed && !linearWorkerCompleted && lastIdleGeneration < tickGeneration) {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) return;
                try {
                    LOCK.wait(Math.max(1L, remaining / 1_000_000L));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    /** Marks a newly initialized LinearOpMode worker as active for tick-barrier waits. */
    public static void beginLinearWorkerForSimulator() {
        synchronized (LOCK) {
            linearWorkerCompleted = false;
        }
    }

    /** Wakes a control-tick barrier as soon as a LinearOpMode worker exits. */
    public static void signalLinearWorkerCompletedForSimulator() {
        synchronized (LOCK) {
            linearWorkerCompleted = true;
            LOCK.notifyAll();
        }
    }

    public static void sleep(long durationMillis) {
        if (durationMillis < 0) throw new IllegalArgumentException("duration cannot be negative");
        synchronized (LOCK) {
            long target = nowMillis + durationMillis;
            while (!closed && nowMillis < target) {
                try {
                    LOCK.wait();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    public static void close() {
        synchronized (LOCK) {
            closed = true;
            LOCK.notifyAll();
        }
    }

    /** Reopens the same worker clock for a new OpMode after an explicit STOP then HANDOFF. */
    public static void reopenForSimulatorHandoff() {
        synchronized (LOCK) {
            closed = false;
            LOCK.notifyAll();
        }
    }
}
