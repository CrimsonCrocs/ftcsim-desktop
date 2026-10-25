package com.qualcomm.robotcore.util;

import org.firstinspires.ftc.sim.SimulatorClock;
import org.firstinspires.ftc.sim.SimulatorLibraryRuntime;
import java.util.concurrent.TimeUnit;

/** FTC timer on the same deterministic epoch as library System.nanoTime calls. */
public class ElapsedTime {
    public enum Resolution { SECONDS, MILLISECONDS }
    public static final long SECOND_IN_NANO=1_000_000_000L,MILLIS_IN_NANO=1_000_000L;
    protected volatile long nsStartTime;
    protected final double resolution;
    public ElapsedTime() { this(Resolution.SECONDS); }
    public ElapsedTime(long startTime) { resolution=SECOND_IN_NANO;nsStartTime=startTime; }
    public ElapsedTime(Resolution value) { resolution=value==Resolution.MILLISECONDS?MILLIS_IN_NANO:SECOND_IN_NANO;reset(); }
    protected long nsNow() { return SimulatorClock.nanoTime(); }
    public long now(TimeUnit unit) { return unit.convert(nsNow(),TimeUnit.NANOSECONDS); }
    public void reset() { nsStartTime=nsNow(); }
    public double startTime() { return nsStartTime/resolution; }
    public long startTimeNanoseconds() { return nsStartTime; }
    public double time() { return nanoseconds()/resolution; }
    public long time(TimeUnit unit) { return unit.convert(nanoseconds(),TimeUnit.NANOSECONDS); }
    public double seconds() { return nanoseconds()/(double)SECOND_IN_NANO; }
    public double milliseconds() { return nanoseconds()/(double)MILLIS_IN_NANO; }
    public long nanoseconds() { return nsNow()-nsStartTime; }
    public Resolution getResolution() { return resolution==MILLIS_IN_NANO?Resolution.MILLISECONDS:Resolution.SECONDS; }
    public void log(String label) { SimulatorLibraryRuntime.record("timer."+label,time()); }
    @Override public String toString() { return String.format(java.util.Locale.ROOT,"%.3f %s",time(),getResolution()==Resolution.MILLISECONDS?"milliseconds":"seconds"); }
}
