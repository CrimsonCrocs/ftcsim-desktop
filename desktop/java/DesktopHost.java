package ftc.desktop;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import javax.tools.*;

/** Local development host. Each runtime generation owns an isolated FTC classloader. */
public final class DesktopHost {
    private static final PrintStream protocol = System.out;
    private static final JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    private static final StandardJavaFileManager files = compiler.getStandardFileManager(null, Locale.ROOT, StandardCharsets.UTF_8);
    private static RuntimeGeneration generation;

    public static void main(String[] ignored) throws Exception {
        BufferedReader input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        protocol.println("READY");
        String line;
        while ((line = input.readLine()) != null) {
            String[] fields = line.split("\t", -1);
            String id = fields.length > 1 ? fields[1] : "invalid";
            long start = System.nanoTime();
            try {
                String command = fields[0];
                List<String> args = new ArrayList<>();
                for (int i = 2; i < fields.length; i++) args.add(decode(fields[i]));
                if (command.equals("COMPILE")) compile(id, args, start);
                else if (command.equals("INVOKE")) invoke(id, args, start);
                else if (command.equals("OPEN")) {
                    dispose();
                    generation = new RuntimeGeneration(args.remove(0), args.toArray(new String[0]));
                    result(id, 0, "", "", start);
                } else if (command.equals("FRAME")) {
                    if (generation == null) throw new IllegalStateException("No loaded runtime");
                    result(id, 0, generation.frame(args.get(0)), "", start);
                } else if (command.equals("DISPOSE")) {
                    dispose(); result(id, 0, "", "", start);
                } else throw new IllegalArgumentException("Unknown host command");
            } catch (Throwable error) {
                StringWriter trace = new StringWriter();
                error.printStackTrace(new PrintWriter(trace));
                result(id, 1, "", trace.toString(), start);
            }
        }
        dispose(); files.close();
    }

    private static void compile(String id, List<String> arguments, long start) throws Exception {
        String cwd = arguments.remove(0);
        List<String> options = new ArrayList<>();
        List<String> sources = new ArrayList<>();
        for (String argument : arguments) {
            if (argument.startsWith("-J")) continue;
            if (argument.endsWith(".java") && !argument.startsWith("-")) sources.add(Paths.get(cwd).resolve(argument).normalize().toString());
            else options.add(argument);
        }
        StringWriter output = new StringWriter();
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        boolean success = compiler.getTask(output, files, diagnostics, options, null, files.getJavaFileObjectsFromStrings(sources)).call();
        for (Diagnostic<? extends JavaFileObject> diagnostic : diagnostics.getDiagnostics()) {
            String source = diagnostic.getSource() == null ? "javac" : Paths.get(diagnostic.getSource().toUri()).toString();
            output.append(source).append(":").append(Long.toString(diagnostic.getLineNumber())).append(": ")
                .append(diagnostic.getKind() == Diagnostic.Kind.ERROR ? "error" : "warning")
                .append(": ").append(diagnostic.getMessage(Locale.ROOT)).append("\n");
        }
        result(id, success ? 0 : 1, "", output.toString(), start);
    }

    private static void invoke(String id, List<String> args, long start) throws Exception {
        String classpath = args.remove(0), main = args.remove(0);
        PrintStream previous = System.out;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (URLClassLoader loader = loader(classpath)) {
            System.setOut(new PrintStream(output, true, "UTF-8"));
            Thread.currentThread().setContextClassLoader(loader);
            loader.loadClass(main).getMethod("main", String[].class).invoke(null, (Object)args.toArray(new String[0]));
        } finally {
            Thread.currentThread().setContextClassLoader(DesktopHost.class.getClassLoader());
            System.setOut(previous);
        }
        result(id, 0, output.toString("UTF-8"), "", start);
    }

    private static URLClassLoader loader(String classpath) throws Exception {
        String[] entries = classpath.split(java.util.regex.Pattern.quote(File.pathSeparator));
        URL[] urls = new URL[entries.length];
        for (int i = 0; i < entries.length; i++) urls[i] = Paths.get(entries[i]).toUri().toURL();
        return new URLClassLoader(urls, ClassLoader.getPlatformClassLoader());
    }

    private static void dispose() throws Exception {
        if (generation == null) return;
        RuntimeGeneration previous = generation; generation = null;
        previous.close();
    }

    private static final class RuntimeGeneration implements AutoCloseable {
        final URLClassLoader loader;
        final PipedOutputStream input = new PipedOutputStream();
        final PipedInputStream output;
        final BufferedReader reader;
        final Thread thread;
        volatile Throwable failure;
        RuntimeGeneration(String classpath, String[] arguments) throws Exception {
            loader = loader(classpath);
            PipedInputStream runtimeInput = new PipedInputStream(input, 1024 * 1024);
            output = new PipedInputStream(1024 * 1024);
            PipedOutputStream runtimeOutput = new PipedOutputStream(output);
            reader = new BufferedReader(new InputStreamReader(output, StandardCharsets.UTF_8));
            thread = new Thread(() -> {
                try {
                    loader.loadClass("org.firstinspires.ftc.sim.PersistentOpModeRunnerCli")
                        .getMethod("runForDesktop", String[].class, InputStream.class, OutputStream.class)
                        .invoke(null, arguments, runtimeInput, runtimeOutput);
                } catch (Throwable error) { failure = error; }
                finally { try { runtimeOutput.close(); } catch (IOException ignored) {} }
            }, "FTC desktop OpMode");
            thread.setContextClassLoader(loader);
            thread.setDaemon(true); thread.start();
        }
        String frame(String line) throws Exception {
            input.write((line + "\n").getBytes(StandardCharsets.UTF_8)); input.flush();
            String result = reader.readLine();
            if (result == null) throw new IllegalStateException("Runtime ended", failure);
            return result;
        }
        public void close() throws Exception {
            if (thread.isAlive()) {
                input.close(); thread.join(700);
                if (thread.isAlive()) {
                    thread.interrupt(); thread.join(100);
                    if (thread.isAlive()) throw new IllegalStateException("Runtime did not terminate; replace host");
                }
            }
            reader.close(); loader.close();
        }
    }

    private static String decode(String value) { return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8); }
    private static String encode(String value) { return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8)); }
    private static void result(String id, int code, String out, String err, long start) {
        protocol.println("RESULT\t" + id + "\t" + code + "\t" + encode(out) + "\t" + encode(err) + "\t" + ((System.nanoTime() - start) / 1000000));
        protocol.flush();
    }
}
