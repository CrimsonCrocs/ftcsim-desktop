package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.Disabled;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Reflects over compiled bytecode without constructing or initializing user classes. */
public final class OpModeDiscoveryCli {
    private OpModeDiscoveryCli() {}

    public static void main(String[] args) {
        if (args.length != 1) {
            System.out.println("{\"ok\":false,\"error\":\"classes root is required\"}");
            System.exit(2);
            return;
        }
        try {
            File root = new File(args[0]).getCanonicalFile();
            List<String> classes = new ArrayList<String>();
            collect(root, root, classes);
            Collections.sort(classes);
            StringBuilder json = new StringBuilder("{\"ok\":true,\"opModes\":[");
            boolean first = true;
            ClassLoader loader = Thread.currentThread().getContextClassLoader();
            for (String className : classes) {
                if (className.startsWith("com.qualcomm.")
                        || className.startsWith("org.firstinspires.ftc.sim.")
                        || className.startsWith("org.firstinspires.ftc.robotcore.")) continue;
                Class<?> type;
                try {
                    type = Class.forName(className, false, loader);
                } catch (LinkageError failure) {
                    continue;
                }
                if (type.getAnnotation(Disabled.class) != null) continue;
                TeleOp teleOp = type.getAnnotation(TeleOp.class);
                Autonomous autonomous = type.getAnnotation(Autonomous.class);
                if (teleOp == null && autonomous == null) continue;
                if (!LinearOpMode.class.isAssignableFrom(type)
                        && !OpMode.class.isAssignableFrom(type)) continue;
                if (!first) json.append(',');
                first = false;
                json.append("{\"className\":"); appendString(json, className);
                String name = teleOp != null ? teleOp.name() : autonomous.name();
                String group = teleOp != null ? teleOp.group() : autonomous.group();
                json.append(",\"displayName\":");
                appendString(json, name.length() == 0 ? type.getSimpleName() : name);
                json.append(",\"group\":"); appendString(json, group);
                json.append(",\"kind\":\"")
                        .append(teleOp != null ? "teleop" : "autonomous").append("\"}");
            }
            json.append("]}");
            System.out.println(json.toString());
        } catch (Throwable failure) {
            System.out.println("{\"ok\":false,\"error\":\"discovery failed\"}");
            System.exit(3);
        }
    }

    private static void collect(File root, File current, List<String> classes) {
        File[] children = current.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) collect(root, child, classes);
            else if (child.getName().endsWith(".class") && child.getName().indexOf('$') < 0) {
                String relative = root.toURI().relativize(child.toURI()).getPath();
                classes.add(relative.substring(0, relative.length() - 6).replace('/', '.'));
            }
        }
    }

    private static void appendString(StringBuilder json, String value) {
        json.append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '"') json.append("\\\"");
            else if (character == '\\') json.append("\\\\");
            else if (character == '\n') json.append("\\n");
            else if (character == '\r') json.append("\\r");
            else if (character == '\t') json.append("\\t");
            else json.append(character);
        }
        json.append('"');
    }
}
