package org.firstinspires.ftc.sim;

import java.lang.reflect.Method;
import java.util.function.LongSupplier;

public final class LibraryClockSmokeTest {
    public static void main(String[] args) throws Exception {
        SimulatorClock.reset();
        Class<?> type = new SimulatorClassLoader(LibraryClockSmokeTest.class.getClassLoader())
                .loadClass("org.firstinspires.ftc.teamcode.SimulationClockProbe");
        Method nanos = type.getMethod("nanos"), millis = type.getMethod("millis");
        require(((Long) nanos.invoke(null)) == 1_000_000_000L, "Nonzero simulation epoch");
        Thread.sleep(30);
        require(((Long) nanos.invoke(null)) == 1_000_000_000L, "Wall time must not advance library clocks");
        com.qualcomm.robotcore.util.ElapsedTime timer = new com.qualcomm.robotcore.util.ElapsedTime(com.qualcomm.robotcore.util.ElapsedTime.Resolution.MILLISECONDS);
        require(timer.startTimeNanoseconds() == ((Long)nanos.invoke(null)), "SDK and library timers share their epoch");
        SimulatorClock.advance(50);
        require(timer.time()==50 && timer.seconds()==.05, "ElapsedTime honors millisecond resolution");
        require(((Long) nanos.invoke(null)) == 1_050_000_000L, "Library clock follows control ticks");
        require(((Long) millis.invoke(null)) == 1050L, "Millis clock follows control ticks");
        LongSupplier reference = (LongSupplier) type.getMethod("reference").invoke(null);
        require(reference.getAsLong() == 1_050_000_000L, "Method references use the same simulation clock");
        require("java/lang/System".equals(type.getMethod("literal").invoke(null)), "Do not rewrite string constants");
        require(System.lineSeparator().equals(type.getMethod("lineSeparator").invoke(null)), "Keep other System methods intact");
        Thread sleeper = new Thread(() -> { try { type.getMethod("sleep").invoke(null); } catch (Exception failure) { throw new RuntimeException(failure); } });
        sleeper.setDaemon(true); sleeper.start(); Thread.sleep(30);
        require(sleeper.isAlive(), "Thread.sleep must wait for simulated time");
        SimulatorClock.advance(25); sleeper.join(1000);
        require(!sleeper.isAlive(), "Simulation sleep completes after the requested ticks");
        System.out.println("library simulation clock tests passed");
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
