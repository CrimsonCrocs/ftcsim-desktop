package org.firstinspires.ftc.sim;

import java.io.BufferedReader;
import java.io.OutputStreamWriter;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/** Exercises the real persistent CLI process across AUTO stop, TELEOP init, and TELEOP start. */
public final class PersistentRunnerHandoffSmokeTest {
    public static void main(String[] args) throws Exception {
        Process process = new ProcessBuilder(
                javaExecutable(), "-cp", System.getProperty("java.class.path"),
                PersistentOpModeRunnerCli.class.getName(),
                "--class", HandoffAutoOpMode.class.getName(),
                "--robot-id", "red-1",
                "--motor-profile", "v1,drive,RevRobotics20HDHexMotor,560,300,0.85",
                "--sensor", "v1,beam,DIGITAL").redirectErrorStream(true).start();

        BufferedReader replies = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
        PrintWriter commands = new PrintWriter(
                new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8), true);

        commands.println("INIT\tinit\tred-1\t0\t0\tdrive,100,0,0,true\t0,0,0,0,0,0,12.5,2\tdigital%3Abeam=false");
        readSuccess(replies, "INIT");
        commands.println("START\tstart");
        readSuccess(replies, "START");
        commands.println("TICK\ttick\t1\t20\t\t\tdrive,123,10,0.4,true\t0.1,0.2,0.3,0.01,0.02,0.03,12.4,2.5\tred-1\t1\t20\tdigital%3Abeam=true");
        readSuccess(replies, "TICK");

        commands.println("HANDOFF\thandoff\t" + HandoffTeleOpMode.class.getName()
                + "\tred-1\t2\t40\tdrive,987,0,0.7,true\t0.4,0.5,0.6,0.04,0.05,0.06,12.2,3.1\tdigital%3Abeam=true");
        String handoff = readSuccess(replies, "HANDOFF");
        require(handoff.contains("\"phase\":\"initialized\""), "TELEOP should be initialized but not started");
        require(handoff.contains("\"robotId\":\"red-1\""), "reply should retain robot identity");
        require(handoff.contains("\"tick\":2"), "reply should retain the boundary tick");
        require(handoff.contains("\"simulationTimeMillis\":40"), "reply should retain the match boundary time");
        require(handoff.contains("\"handoffMarker\":\"2027\""), "AUTO static state should survive class handoff");
        require(handoff.contains("\"handoffEncoder\":\"987\""), "TELEOP should see the boundary encoder frame");
        require(handoff.contains("\"autoStopped\":\"true\""), "AUTO stop should run before TELEOP init");
        require(handoff.contains("\"autoStopCalls\":\"1\""), "AUTO stop hook should run exactly once");
        require(handoff.contains("\"sameMotorObject\":\"true\""), "AUTO and TELEOP should share the same physical motor adapter");
        require(handoff.contains("\"motorMode\":\"RUN_USING_ENCODER\""), "motor mode should survive OpMode handoff");
        require(handoff.contains("\"zeroPower\":\"BRAKE\""), "motor braking configuration should survive OpMode handoff");
        require(handoff.contains("\"beam\":\"true\""), "TELEOP init should read the handoff sensor frame");
        require(handoff.contains("\"telemetryRevision\":2"), "TELEOP init telemetry should publish at the lifecycle boundary despite the interval");
        require(handoff.contains("\"power\":0.0"), "powered output should be neutral after handoff init");

        commands.println("START\tteleop-start");
        String started = readSuccess(replies, "TELEOP START");
        require(started.contains("\"power\":0.25"), "TELEOP start should enable its commanded motor output");
        commands.println("CLOSE\tclose");
        readSuccess(replies, "CLOSE");
        commands.close();
        require(process.waitFor() == 0, "persistent runner should exit successfully after close");
        runLinearStopThenHandoff();
        runNaturalLinearCompletion();
        runImuAxisFrame();
        System.out.println("persistent JVM AUTO-to-TELEOP handoff tests passed");
    }

    private static void runLinearStopThenHandoff() throws Exception {
        Process process = new ProcessBuilder(
                javaExecutable(), "-cp", System.getProperty("java.class.path"),
                PersistentOpModeRunnerCli.class.getName(),
                "--class", HandoffLinearAutoOpMode.class.getName(),
                "--robot-id", "red-1",
                "--motor-profile", "v1,drive,RevRobotics20HDHexMotor,560,300,0.85",
                "--sensor", "v1,beam,DIGITAL").redirectErrorStream(true).start();
        BufferedReader replies = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
        PrintWriter commands = new PrintWriter(
                new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8), true);

        commands.println("INIT\tINIT_LINEAR\tred-1\t0\t0\tdrive,100,0,0,true\t0,0,0,0,0,0,12.5,2\tdigital%3Abeam=false");
        readSuccess(replies, "LINEAR INIT");

        commands.println("TICK\tINIT_TICK_1\t1\t20\t\t\tdrive,120,0,0,true\t0,0,0,0,0,0,12.5,2\tred-1\t1\t20\tdigital%3Abeam=false");
        String initTick1 = readSuccess(replies, "LINEAR INIT TICK 1");
        require(initTick1.contains("\"phase\":\"initialized\""), "AUTO should remain in INIT after its first tick");
        require(initTick1.contains("\"simulationTimeMillis\":20"), "first INIT tick should advance the world clock by 20 ms");
        commands.println("TICK\tINIT_TICK_2\t2\t20\t\t\tdrive,220,0,0,true\t0,0,0,0,0,0,12.5,2\tred-1\t2\t40\tdigital%3Abeam=false");
        String initTick2 = readSuccess(replies, "LINEAR INIT TICK 2");
        require(initTick2.contains("\"simulationTimeMillis\":40"), "second INIT tick should advance the world clock by another 20 ms");
        commands.println("TICK\tINIT_TICK_3\t3\t20\t\t\tdrive,320,0,0,true\t0,0,0,0,0,0,12.5,2\tred-1\t3\t60\tdigital%3Abeam=false");
        String initTick3 = readSuccess(replies, "LINEAR INIT TICK 3");
        require(initTick3.contains("\"simulationTimeMillis\":60"), "third INIT tick should advance the world clock by another 20 ms");

        commands.println("START\tSTART_LINEAR");
        String startedAuto = readSuccess(replies, "LINEAR START");
        require(startedAuto.contains("\"simulationTimeMillis\":60"), "AUTO START should preserve time accumulated during INIT ticks");
        commands.println("STOP\tSTOP_LINEAR");
        String stopped = readSuccess(replies, "LINEAR STOP");
        require(stopped.contains("\"phase\":\"stopped\""), "explicit STOP should leave a handoff-ready worker");

        commands.println("HANDOFF\tHANDOFF_AFTER_STOP\t" + HandoffTeleOpMode.class.getName()
                + "\tred-1\t4\t80\tdrive,987,0,0.7,true\t0.4,0.5,0.6,0.04,0.05,0.06,12.2,3.1\tdigital%3Abeam=true");
        String handoff = readSuccess(replies, "HANDOFF AFTER STOP");
        require(handoff.contains("\"phase\":\"initialized\""), "TELEOP should initialize after explicit STOP");
        require(handoff.contains("\"simulationTimeMillis\":80"), "handoff should continue from the clock accumulated before START");
        require(handoff.contains("\"handoffMarker\":\"31337\""), "Linear AUTO static state should survive STOP and HANDOFF");
        require(handoff.contains("\"autoStopped\":\"true\""), "Linear AUTO should finish its stop path before TELEOP init");
        require(handoff.contains("\"autoStopCalls\":\"1\""), "explicit STOP and HANDOFF must not invoke AUTO stop twice");
        require(handoff.contains("\"handoffEncoder\":\"987\""), "TELEOP should receive the handoff encoder sample");
        require(handoff.contains("\"sameMotorObject\":\"true\""), "hardware adapters should survive explicit STOP");
        require(handoff.contains("\"beam\":\"true\""), "TELEOP should receive the handoff sensor frame");
        require(handoff.contains("\"power\":0.0"), "outputs should stay neutral until TELEOP START");

        commands.println("START\tSTART_TELEOP_AFTER_STOP");
        String started = readSuccess(replies, "TELEOP START AFTER STOP");
        require(started.contains("\"power\":0.25"), "TELEOP should run after the stopped clock reopens");
        commands.println("CLOSE\tCLOSE_AFTER_STOP");
        readSuccess(replies, "CLOSE AFTER STOP");
        commands.close();
        require(process.waitFor() == 0, "runner should exit successfully after STOP-to-HANDOFF");
    }

    private static void runNaturalLinearCompletion() throws Exception {
        Process process = new ProcessBuilder(
                javaExecutable(), "-cp", System.getProperty("java.class.path"),
                PersistentOpModeRunnerCli.class.getName(),
                "--class", ReturningLinearAutoOpMode.class.getName(),
                "--robot-id", "red-1",
                "--motor-profile", "v1,drive,goBILDA-312rpm,537.7,312,0.85")
                .redirectErrorStream(true).start();
        BufferedReader replies = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
        PrintWriter commands = new PrintWriter(
                new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8), true);

        commands.println("INIT\tRETURN_INIT\tred-1\t0\t0\tdrive,0,0,0,true\t0,0,0,0,0,0,12.5,0\t");
        String initialized = readSuccess(replies, "RETURNING LINEAR INIT");
        require(initialized.contains("\"programStatus\":\"running\""),
                "LinearOpMode should report active while waiting for START");

        commands.println("START\tRETURN_START");
        String started = readSuccess(replies, "RETURNING LINEAR START");
        require(started.contains("\"phase\":\"running\""),
                "normal LinearOpMode return must not stop the match/session clock");

        long simulationTime = 0;
        String frame = started;
        for (int tick = 1; tick <= 5 && !frame.contains("\"programStatus\":\"completed\""); tick++) {
            simulationTime += 20;
            frame = sendTick(commands, replies, tick, simulationTime);
        }
        require(frame.contains("\"programStatus\":\"completed\""),
                "normally returned LinearOpMode should report completion");
        require(frame.contains("\"power\":0.0"),
                "outputs must be neutral when a LinearOpMode returns");

        long waitStart = System.nanoTime();
        for (int tick = 6; tick < 38; tick++) {
            simulationTime += 20;
            frame = sendTick(commands, replies, tick, simulationTime);
            require(frame.contains("\"phase\":\"running\""),
                    "the full-match clock should keep its running phase after AUTO returns");
            require(frame.contains("\"programStatus\":\"completed\""),
                    "completion status should persist on later ticks");
            require(frame.contains("\"power\":0.0"),
                    "returned OpMode must keep motor outputs neutral");
        }
        long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - waitStart);
        require(elapsedMillis < 500,
                "ticks after LinearOpMode completion should not wait 20 ms each; elapsed "
                        + elapsedMillis + " ms");
        require(frame.contains("\"simulationTimeMillis\":" + simulationTime),
                "simulation time should continue advancing after program completion");

        commands.println("CLOSE\tRETURN_CLOSE");
        readSuccess(replies, "RETURNING LINEAR CLOSE");
        commands.close();
        require(process.waitFor() == 0, "runner should close cleanly after natural completion");
    }

    private static String sendTick(
            PrintWriter commands, BufferedReader replies, int tick, long simulationTime)
            throws Exception {
        commands.println("TICK\tRETURN_TICK_" + tick + "\t" + tick + "\t20\t\t\tdrive,0,0,0,true"
                + "\t0,0,0,0,0,0,12.5,0\tred-1\t" + tick + "\t" + simulationTime + "\t");
        return readSuccess(replies, "RETURNING LINEAR TICK " + tick);
    }

    private static void runImuAxisFrame() throws Exception {
        Process process = new ProcessBuilder(
                javaExecutable(), "-cp", System.getProperty("java.class.path"),
                PersistentOpModeRunnerCli.class.getName(),
                "--class", ImuAxisReportingOpMode.class.getName(),
                "--robot-id", "red-1").redirectErrorStream(true).start();
        BufferedReader replies = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
        PrintWriter commands = new PrintWriter(
                new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8), true);

        // Values are already converted by the v3 adapter from simulator XYZ (.4, -.5, .6)
        // into FTC XYZ (.6, .4, -.5). Keep all three distinct to catch axis swaps.
        commands.println("INIT\tIMU_AXIS_INIT\tred-1\t9\t180\t\t0.1,-0.2,0.3,0.6,0.4,-0.5,12.1,4.2\t");
        String initialized = readSuccess(replies, "IMU AXIS INIT");
        require(initialized.contains("\"imuRateX\":\"0.6\""), "FTC IMU X must receive world Z rate");
        require(initialized.contains("\"imuRateY\":\"0.4\""), "FTC IMU Y must receive world X rate");
        require(initialized.contains("\"imuRateZ\":\"-0.5\""), "FTC IMU Z must receive world Y rate");
        commands.println("CLOSE\tIMU_AXIS_CLOSE");
        readSuccess(replies, "IMU AXIS CLOSE");
        commands.close();
        require(process.waitFor() == 0, "runner should close cleanly after IMU axis readback");
    }

    private static String readSuccess(BufferedReader replies, String operation) throws Exception {
        String response = replies.readLine();
        if (response == null) throw new AssertionError(operation + " returned no worker frame");
        if (!response.contains("\"ok\":true")) {
            throw new AssertionError(operation + " returned a worker error: " + response);
        }
        return response;
    }

    private static String javaExecutable() {
        String executable = System.getProperty("os.name", "").toLowerCase().contains("win")
                ? "java.exe" : "java";
        return System.getProperty("java.home") + java.io.File.separator + "bin"
                + java.io.File.separator + executable;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
