import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/** JDK 17 host debugger. TeamCode remains Java 8; JDWP never leaves loopback. */
public final class DebugRunner {
    private final VirtualMachine vm;
    private final PrintStream output = System.out;
    private final List<String> sourcePaths = new ArrayList<>();
    private final List<Point> points = new ArrayList<>();
    private final List<String> watches = new ArrayList<>();
    private final Object lock = new Object();
    private ThreadReference stoppedThread;
    private EventSet stoppedEvents;
    private boolean manualSuspend;
    private String reason = "running";
    private int selectedFrame;
    private int variableBudget;
    private int textBudget;
    private volatile boolean closed;
    private static final String[] EXCLUDES = {"java.*", "javax.*", "sun.*", "jdk.*", "com.sun.*", "kotlin.*", "android.*", "com.qualcomm.*", "org.firstinspires.ftc.sim.*"};

    private static final class Point {
        String id, path;
        int line;
        boolean enabled, verified;
        Point(String[] values) { id = values[0]; path = decode(values[1]); line = Integer.parseInt(values[2]); enabled = values[3].equals("1"); }
    }

    public static void main(String[] args) throws Exception {
        LaunchingConnector connector = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> options = connector.defaultArguments();
        options.get("options").setValue(decode(args[0]));
        options.get("main").setValue(decode(args[1]));
        options.get("suspend").setValue("true");
        DebugRunner runner = new DebugRunner(connector.launch(options));
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            runner.closed = true;
            runner.vm.process().destroyForcibly();
        }));
        runner.configure(decode(args[2]));
        runner.run();
    }

    DebugRunner(VirtualMachine vm) { this.vm = vm; }

    private void run() throws Exception {
        ClassPrepareRequest prepare = vm.eventRequestManager().createClassPrepareRequest();
        for (String pattern : EXCLUDES) prepare.addClassExclusionFilter(pattern);
        prepare.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        prepare.enable();
        Thread stdout = new Thread(() -> forward(vm.process().getInputStream(), output), "debug-target-output");
        stdout.setDaemon(true); stdout.start();
        Thread stderr = new Thread(() -> forward(vm.process().getErrorStream(), System.err), "debug-target-error");
        stderr.setDaemon(true); stderr.start();
        Thread events = new Thread(this::events, "debug-events");
        events.setDaemon(true); events.start();
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while (!closed && (line = input.readLine()) != null) {
            if (!line.startsWith("DEBUG\t")) {
                vm.process().getOutputStream().write((line + "\n").getBytes(StandardCharsets.UTF_8));
                vm.process().getOutputStream().flush();
                continue;
            }
            String[] fields = line.split("\t", -1);
            String id = fields.length > 1 ? fields[1] : "";
            try {
                synchronized (lock) {
                    String action = fields[2];
                    switch (action) {
                        case "configure": configure(decode(fields[3])); break;
                        case "pause":
                            if (stoppedThread == null) {
                                vm.suspend(); manualSuspend = true;
                                stoppedThread = vm.allThreads().stream().filter(t -> t.name().equals("ftc-linear-opmode")).findFirst()
                                    .orElseGet(() -> vm.allThreads().stream().filter(t -> t.name().equals("main")).findFirst().orElseThrow());
                                reason = "pause"; selectedFrame = 0;
                            }
                            break;
                        case "inspect":
                            requirePaused(); selectedFrame = Integer.parseInt(fields[3]);
                            if (selectedFrame >= Math.min(64, stoppedThread.frameCount())) throw new IllegalArgumentException("Stack frame is no longer available");
                            break;
                        case "continue": resume(); break;
                        case "step-in": case "step-over": case "step-out":
                            requirePaused();
                            vm.eventRequestManager().deleteEventRequests(new ArrayList<>(vm.eventRequestManager().stepRequests()));
                            int depth = action.equals("step-in") ? StepRequest.STEP_INTO : action.equals("step-out") ? StepRequest.STEP_OUT : StepRequest.STEP_OVER;
                            StepRequest step = vm.eventRequestManager().createStepRequest(stoppedThread, StepRequest.STEP_LINE, depth);
                            for (String pattern : EXCLUDES) step.addClassExclusionFilter(pattern);
                            step.addCountFilter(1); step.setSuspendPolicy(EventRequest.SUSPEND_ALL); step.enable();
                            resume(); break;
                        default: throw new IllegalArgumentException("Unknown debugger command");
                    }
                    emit("{\"debugReply\":true,\"requestId\":" + quote(id) + ",\"ok\":true,\"state\":" + state() + "}");
                }
            } catch (Exception error) {
                emit("{\"debugReply\":true,\"requestId\":" + quote(id) + ",\"ok\":false,\"error\":" + quote(error.getMessage()) + "}");
            }
        }
        closed = true;
        try { vm.dispose(); } catch (VMDisconnectedException ignored) {}
        vm.process().destroyForcibly();
    }

    private void events() {
        try {
            while (!closed) {
                EventSet set = vm.eventQueue().remove();
                boolean hold = false;
                synchronized (lock) {
                    for (Event event : set) {
                        if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) { closed = true; return; }
                        if (event instanceof ClassPrepareEvent) {
                            bind(((ClassPrepareEvent) event).referenceType());
                        } else if (event instanceof BreakpointEvent || event instanceof StepEvent) {
                            LocatableEvent located = (LocatableEvent) event;
                            stoppedThread = located.thread(); stoppedEvents = set; manualSuspend = false;
                            reason = event instanceof BreakpointEvent ? "breakpoint" : "step";
                            selectedFrame = 0; hold = true;
                            if (event instanceof StepEvent) vm.eventRequestManager().deleteEventRequest(event.request());
                        }
                    }
                    if (hold || set.stream().anyMatch(e -> e instanceof VMStartEvent)) publish();
                    if (!hold) set.resume();
                }
            }
        } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        catch (VMDisconnectedException ignored) { closed = true; }
    }

    private void configure(String encoded) {
        String[] groups = encoded.split("\t", -1);
        sourcePaths.clear(); points.clear(); watches.clear();
        if (!groups[0].isEmpty()) for (String path : groups[0].split(",")) sourcePaths.add(decode(path));
        if (!groups[1].isEmpty()) for (String point : groups[1].split(",")) points.add(new Point(point.split(":")));
        if (!groups[2].isEmpty()) for (String watch : groups[2].split(",")) watches.add(decode(watch));
        vm.eventRequestManager().deleteEventRequests(new ArrayList<>(vm.eventRequestManager().breakpointRequests()));
        for (ReferenceType type : vm.allClasses()) if (type.isPrepared()) bind(type);
    }

    private String source(Location location) {
        try {
            String relative = location.sourcePath().replace('\\', '/');
            List<String> candidates = sourcePaths.stream().filter(p -> p.equals(relative) || p.endsWith("/" + relative)).collect(Collectors.toList());
            if (candidates.size() == 1) return candidates.get(0);
            if (candidates.size() > 1 && relative.indexOf('/') < 0) {
                String className = location.declaringType().name();
                int separator = className.lastIndexOf('.');
                String qualified = (separator < 0 ? "" : className.substring(0, separator).replace('.', '/') + "/") + relative;
                List<String> exact = candidates.stream().filter(p -> p.equals(qualified) || p.endsWith("/" + qualified)).collect(Collectors.toList());
                if (exact.size() == 1) return exact.get(0);
            }
            return null;
        } catch (AbsentInformationException ignored) { return null; }
    }

    private void bind(ReferenceType type) {
        for (Point point : points) {
            if (!point.enabled) continue;
            try {
                for (Location location : type.locationsOfLine(point.line)) {
                    if (!point.path.equals(source(location))) continue;
                    boolean exists = vm.eventRequestManager().breakpointRequests().stream().anyMatch(r -> r.location().equals(location));
                    if (!exists) {
                        BreakpointRequest request = vm.eventRequestManager().createBreakpointRequest(location);
                        request.setSuspendPolicy(EventRequest.SUSPEND_ALL); request.enable();
                    }
                    point.verified = true;
                }
            } catch (AbsentInformationException | ClassNotPreparedException ignored) {}
        }
    }

    private void requirePaused() { if (stoppedThread == null) throw new IllegalStateException("Pause the program to inspect or step"); }

    private void resume() {
        requirePaused();
        if (manualSuspend) vm.resume();
        else if (stoppedEvents != null) stoppedEvents.resume();
        stoppedThread = null; stoppedEvents = null; manualSuspend = false; reason = "running";
    }

    private String state() {
        variableBudget = 512;
        textBudget = 32768;
        StringBuilder json = new StringBuilder("{\"status\":").append(quote(stoppedThread == null ? "running" : "paused"));
        json.append(",\"reason\":").append(quote(reason)).append(",\"frames\":[");
        if (stoppedThread != null) {
            try {
                List<StackFrame> frames = stoppedThread.frames(0, Math.min(64, stoppedThread.frameCount()));
                for (int i = 0; i < frames.size(); i++) {
                    if (i > 0) json.append(',');
                    StackFrame frame = frames.get(i); Location location = frame.location();
                    json.append("{\"id\":").append(i).append(",\"method\":").append(quote(location.declaringType().name() + "." + location.method().name()));
                    json.append(",\"line\":").append(Math.max(1, location.lineNumber()));
                    String path = source(location);
                    if (path != null) json.append(",\"path\":").append(quote(path));
                    json.append(",\"variables\":[");
                    if (i == selectedFrame) {
                        boolean first = true;
                        if (frame.thisObject() != null) { json.append(variable("this", frame.thisObject(), 0, new HashSet<>())); first = false; }
                        try {
                            List<LocalVariable> locals = frame.visibleVariables();
                            for (LocalVariable local : locals.subList(0, Math.min(100, locals.size()))) {
                                if (!first) json.append(','); first = false;
                                json.append(variable(local.name(), frame.getValue(local), 0, new HashSet<>()));
                            }
                        } catch (AbsentInformationException absent) {
                            json.append(first ? "" : ",").append("{\"name\":\"Locals\",\"type\":\"unavailable\",\"value\":\"Rebuild with local variable debug information\"}");
                        }
                    }
                    json.append("]}");
                }
            } catch (IncompatibleThreadStateException | InvalidStackFrameException error) { /* A disconnect is terminal upstream. */ }
        }
        json.append("],\"watches\":[");
        for (int i = 0; i < watches.size(); i++) {
            if (i > 0) json.append(','); String watch = watches.get(i);
            try {
                requirePaused();
                json.append(variable(watch, evaluate(stoppedThread.frame(selectedFrame), watch), 0, new HashSet<>()));
            } catch (Exception error) {
                json.append("{\"name\":").append(quote(watch)).append(",\"type\":\"unavailable\",\"value\":\"\",\"error\":").append(quote(error.getMessage())).append('}');
            }
        }
        json.append("],\"breakpoints\":[");
        for (int i = 0; i < points.size(); i++) {
            if (i > 0) json.append(','); Point p = points.get(i);
            json.append("{\"id\":").append(quote(p.id)).append(",\"path\":").append(quote(p.path)).append(",\"line\":").append(p.line)
                .append(",\"enabled\":").append(p.enabled).append(",\"verified\":").append(p.verified);
            if (!p.verified) json.append(",\"message\":\"Pending class load or no executable code on this line\"");
            json.append('}');
        }
        json.append(']');
        if (stoppedThread != null) json.append(",\"threadId\":").append(quote(Long.toString(stoppedThread.uniqueID())));
        return json.append('}').toString();
    }

    /** Deliberately supports field/array reads only; never invokes TeamCode methods. */
    private Value evaluate(StackFrame frame, String expression) throws Exception {
        if (!expression.matches("(?:this\\.)?[A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*|\\[\\d{1,5}\\])*")) throw new IllegalArgumentException("Use a variable, field, or array element path");
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("[A-Za-z_$][\\w$]*|\\[\\d+\\]").matcher(expression);
        matcher.find(); String root = matcher.group(); Value current;
        if (root.equals("this")) current = frame.thisObject();
        else {
            LocalVariable local = null;
            try { local = frame.visibleVariableByName(root); } catch (AbsentInformationException ignored) {}
            if (local != null) current = frame.getValue(local);
            else {
                ObjectReference instance = frame.thisObject();
                Field field = frame.location().declaringType().fieldByName(root);
                if (field == null) throw new IllegalArgumentException("Variable is not in scope");
                current = field.isStatic() ? field.declaringType().getValue(field) : instance == null ? null : instance.getValue(field);
            }
        }
        while (matcher.find()) {
            String part = matcher.group();
            if (current == null) throw new IllegalArgumentException("Cannot read a field of null");
            if (part.startsWith("[")) {
                if (!(current instanceof ArrayReference)) throw new IllegalArgumentException("Value is not an array");
                current = ((ArrayReference) current).getValue(Integer.parseInt(part.substring(1, part.length() - 1)));
            } else {
                if (!(current instanceof ObjectReference)) throw new IllegalArgumentException("Value has no fields");
                ObjectReference object = (ObjectReference) current;
                if (object instanceof ArrayReference && part.equals("length")) current = vm.mirrorOf(((ArrayReference) object).length());
                else {
                    Field field = object.referenceType().fieldByName(part);
                    if (field == null) throw new IllegalArgumentException("Field does not exist");
                    current = field.isStatic() ? field.declaringType().getValue(field) : object.getValue(field);
                }
            }
        }
        return current;
    }

    private String variable(String name, Value value, int depth, Set<Long> visited) {
        if (--variableBudget < 0) return "{\"name\":" + quote(name) + ",\"type\":\"unavailable\",\"value\":\"Snapshot limit reached\",\"truncated\":true}";
        String type = value == null ? "null" : value.type().name();
        boolean oversizedString = false;
        if (value instanceof StringReference) {
            Field storage = ((StringReference) value).referenceType().fieldByName("value");
            Value backing = storage == null ? null : ((StringReference) value).getValue(storage);
            oversizedString = backing instanceof ArrayReference && ((ArrayReference) backing).length() > 4096;
        }
        String text = value == null ? "null" : value instanceof StringReference ? oversizedString ? "<string exceeds snapshot limit>" : ((StringReference) value).value()
            : value instanceof ObjectReference ? type.substring(type.lastIndexOf('.') + 1) + "@" + ((ObjectReference) value).uniqueID() : value.toString();
        int limit = Math.min(2048, Math.max(0, textBudget));
        boolean textTruncated = text.length() > limit;
        textBudget -= Math.min(text.length(), limit);
        StringBuilder json = new StringBuilder("{\"name\":").append(quote(name)).append(",\"type\":").append(quote(type)).append(",\"value\":").append(quote(textTruncated ? text.substring(0, limit) : text));
        if (textTruncated || oversizedString) json.append(",\"truncated\":true");
        if (value instanceof ObjectReference && !(value instanceof StringReference)) {
            ObjectReference object = (ObjectReference) value;
            if (depth >= 2 || !visited.add(object.uniqueID())) json.append(",\"truncated\":true");
            else {
                json.append(",\"children\":[");
                if (object instanceof ArrayReference) {
                    ArrayReference array = (ArrayReference) object;
                    for (int i = 0; i < Math.min(32, array.length()) && variableBudget > 0; i++) {
                        if (i > 0) json.append(','); json.append(variable("[" + i + "]", array.getValue(i), depth + 1, visited));
                    }
                    json.append(']');
                    if (array.length() > 32) json.append(",\"truncated\":true");
                } else {
                    List<Field> fields = object.referenceType().allFields().stream().filter(f -> !f.isSynthetic() && !f.declaringType().name().startsWith("com.qualcomm.")).limit(33).collect(Collectors.toList());
                    for (int i = 0; i < Math.min(32, fields.size()) && variableBudget > 0; i++) {
                        if (i > 0) json.append(','); Field f = fields.get(i);
                        json.append(variable(f.name(), f.isStatic() ? f.declaringType().getValue(f) : object.getValue(f), depth + 1, visited));
                    }
                    json.append(']'); if (fields.size() > 32) json.append(",\"truncated\":true");
                }
            }
        }
        return json.append('}').toString();
    }

    private void publish() { emit("{\"debugEvent\":true,\"state\":" + state() + "}"); }
    private void emit(String line) { synchronized (output) { output.println(line); output.flush(); } }
    private static void forward(InputStream input, PrintStream output) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line; while ((line = reader.readLine()) != null) synchronized (output) { output.println(line); output.flush(); }
        } catch (IOException ignored) {}
    }
    private static String decode(String text) { return new String(Base64.getDecoder().decode(text), StandardCharsets.UTF_8); }
    private static String quote(String text) {
        if (text == null) return "null";
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 32) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
}
