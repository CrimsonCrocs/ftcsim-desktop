package org.firstinspires.ftc.sim;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.LockSupport;
import java.util.concurrent.TimeUnit;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;

/** A slow host must never turn a pending control loop into a completed tick. */
public final class ClockBarrierSmokeTest {
    public static void main(String[] args) throws Exception {
        if (args.length > 0 && "runner-probe".equals(args[0])) {
            PersistentOpModeRunnerCli.main(java.util.Arrays.copyOfRange(args, 1, args.length));
            DcMotor motor = NeverYieldOpMode.lastMotor;
            if (motor != null) require(motor.getPower() == 0, "failed control must leave the actual motor neutral");
            return;
        }
        slowCooperativeLoop();
        virtualSleep();
        initAndDeadline();
        persistentRunner();
        System.out.println("cooperative clock barrier tests passed");
    }

    private static void slowCooperativeLoop() throws Exception {
        SimulatorClock.reset();
        AtomicInteger completed = new AtomicInteger();
        Thread worker = new Thread(() -> {
            for (int i = 1; i <= 3; i++) {
                LockSupport.parkNanos(60_000_000L);
                completed.set(i);
                SimulatorClock.idle();
            }
            SimulatorClock.signalLinearWorkerCompletedForSimulator();
        });
        worker.start();
        try {
            for (int i = 1; i <= 3; i++) {
                if (i > 1) SimulatorClock.advance(20);
                require(SimulatorClock.awaitLinearLoopForCurrentTick(1000), "slow loop must reach a real yield");
                require(completed.get() == i, "barrier must not publish the previous generation");
                require(SimulatorClock.nowMillis() == (i - 1) * 20, "wall time must not advance simulation time");
            }
        } finally {
            SimulatorClock.close(); worker.join(1000);
        }
        require(!worker.isAlive(), "slow worker must exit");
    }

    private static void virtualSleep() throws Exception {
        SimulatorClock.reset();
        AtomicInteger completed = new AtomicInteger();
        Thread worker = new Thread(() -> {
            SimulatorClock.sleep(60);
            completed.set(1);
            SimulatorClock.idle();
            SimulatorClock.signalLinearWorkerCompletedForSimulator();
        });
        worker.start();
        try {
            require(SimulatorClock.awaitLinearLoopForCurrentTick(1000), "sleep must yield its first generation");
            for (int i = 1; i <= 3; i++) {
                SimulatorClock.advance(20);
                require(SimulatorClock.awaitLinearLoopForCurrentTick(1000), "sleep must yield each pending generation");
                require(completed.get() == (i == 3 ? 1 : 0), "sleep must finish on its requested simulation time");
            }
        } finally {
            SimulatorClock.close(); worker.join(1000);
        }
        require(!worker.isAlive(), "sleeping worker must exit");
    }

    private static void initAndDeadline() {
        SimulatorClock.reset();
        SimulatorClock.setWaitingForStartForSimulator(true);
        SimulatorClock.advance(20);
        require(SimulatorClock.awaitLinearLoopForCurrentTick(1), "INIT may advance while waiting for START");
        SimulatorClock.setWaitingForStartForSimulator(false);
        require(!SimulatorClock.awaitLinearLoopForCurrentTick(10), "a missed yield must be reported as a failure");
        require(SimulatorClock.nowMillis() == 20, "timeout must not advance time");
        SimulatorClock.close();
    }

    private static void persistentRunner() throws Exception {
        for (int[] configuration : new int[][] {{0, 60, 120}, {0, 180, 300}, {1, 0, 120}, {1, 0, 300}}) {
            boolean neverYields = configuration[0] == 1;
            Process process = new ProcessBuilder(System.getProperty("java.home") + "/bin/java",
                    "-Dftcsim.test.workMillis=" + configuration[1],
                    "-Dftcsim.cooperativeDeadlineMillis=" + configuration[2],
                    "-cp", System.getProperty("java.class.path"), ClockBarrierSmokeTest.class.getName(), "runner-probe",
                    "--class", (neverYields ? NeverYieldOpMode.class : SlowYieldOpMode.class).getName(),
                    "--robot-id", "red-1", "--motor-profile", "v1,drive,goBILDA-312rpm,537.7,312,0.85")
                    .redirectErrorStream(true).start();
            try {
                BufferedReader replies = new BufferedReader(new InputStreamReader(process.getInputStream()));
                PrintWriter commands = new PrintWriter(process.getOutputStream(), true);
                commands.println("INIT\tinit");
                require(replies.readLine().contains("\"ok\":true"), "fixture INIT must succeed");
                commands.println("START\tstart");
                String started = replies.readLine();
                if (neverYields) {
                    require(started.contains("\"ok\":false") && started.contains("did not yield"),
                            "a missed START barrier must fail instead of publishing stale motor output");
                } else {
                    require(started.contains("\"power\":0.1"), "START must wait for the delayed first command");
                    for (int i = 1; i <= 2; i++) {
                        commands.println("TICK\ttick" + i + "\t" + i + "\t20\t\t\tdrive,0,0,0,true"
                                + "\t0,0,0,0,0,0,12.5,0\tred-1\t" + i + "\t" + (i * 20) + "\t");
                        String frame = replies.readLine();
                        require(frame.contains("\"ok\":true") && frame.contains("\"power\":" + ((i + 1) / 10.0)),
                                "TICK must wait for its own delayed command " + java.util.Arrays.toString(configuration) + ": " + frame);
                    }
                    commands.println("CLOSE\tclose");
                    require(replies.readLine().contains("\"ok\":true"), "fixture CLOSE must succeed");
                }
                commands.close();
                require(process.waitFor(2, TimeUnit.SECONDS), "runner must close after its bounded control deadline");
                require(process.exitValue() == 0, "runner must pass its actual motor-neutrality check");
            } finally { process.destroyForcibly(); }
        }
    }

    public static final class SlowYieldOpMode extends LinearOpMode {
        @Override public void runOpMode() {
            DcMotor drive = hardwareMap.get(DcMotor.class, "drive");
            waitForStart();
            int count = 0;
            while (opModeIsActive()) {
                LockSupport.parkNanos(Integer.getInteger("ftcsim.test.workMillis", 60) * 1_000_000L);
                drive.setPower(++count / 10.0);
                idle();
            }
        }
    }

    public static final class NeverYieldOpMode extends LinearOpMode {
        static volatile DcMotor lastMotor;
        @Override public void runOpMode() {
            waitForStart();
            lastMotor = hardwareMap.get(DcMotor.class, "drive"); lastMotor.setPower(0.8);
            while (opModeIsActive()) LockSupport.parkNanos(1_000_000L);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
