package ftc.desktop;

public final class WorkPolicySmoke {
    public static void main(String[] ignored) throws Exception {
        int before = WorkPolicy.current();
        if (before < 0) throw new AssertionError("Native work policy was not loaded");
        int previous = WorkPolicy.begin();
        int active = WorkPolicy.current();
        String[] names = {"ftc-linear-opmode", "FTC desktop OpMode", "Daemon worker", "Execution worker", "ordinary-worker"};
        int[] classes = new int[names.length];
        for (int index = 0; index < names.length; index++) {
            final int selected = index;
            Thread worker = new Thread(() -> classes[selected] = WorkPolicy.current(), names[index]);
            worker.start(); worker.join(2000);
            if (worker.isAlive()) throw new AssertionError("Worker did not finish");
        }
        WorkPolicy.end(previous);
        int restored = WorkPolicy.current();
        if (active != 25 || classes[0] != 25 || classes[1] != 25 || classes[2] != 25 || classes[3] != 25 || classes[4] != 21 || before != restored)
            throw new AssertionError("JVM scheduling did not match: " + java.util.Arrays.toString(classes));
        System.out.println("{\"status\":\"PASS\",\"before\":" + before + ",\"active\":" + active + ",\"threads\":" + java.util.Arrays.toString(classes) + ",\"restored\":" + restored + "}");
    }
}
