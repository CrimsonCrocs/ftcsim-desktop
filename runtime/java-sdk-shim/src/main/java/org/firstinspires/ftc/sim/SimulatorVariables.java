package org.firstinspires.ftc.sim;

import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.IdentityHashMap;

/** Bounded field reads at a control barrier. No getters, expressions, or user toString calls. */
final class SimulatorVariables {
    private int remaining = 256;
    private int textBudget = 32768;
    private final IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<Object, Boolean>();

    static String snapshot(Object opMode) {
        SimulatorVariables reader = new SimulatorVariables();
        return reader.fields(opMode, opMode.getClass(), 0);
    }

    private String fields(Object object, Class<?> type, int depth) {
        StringBuilder json = new StringBuilder("[");
        int count = 0;
        for (Class<?> current = type; current != null && readable(current); current = current.getSuperclass()) {
            for (Field field : current.getDeclaredFields()) {
                if (field.isSynthetic() || count >= 32 || remaining <= 0) continue;
                if (count++ > 0) json.append(',');
                try {
                    field.setAccessible(true);
                    json.append(variable(field.getName(), field.get(Modifier.isStatic(field.getModifiers()) ? null : object), field.getType(), depth));
                } catch (Exception error) {
                    json.append("{\"name\":").append(quote(field.getName())).append(",\"type\":\"unavailable\",\"value\":\"\",\"error\":\"Field cannot be read\"}");
                }
            }
        }
        return json.append(']').toString();
    }

    private String variable(String name, Object value, Class<?> type, int depth) {
        remaining--;
        boolean scalar = value == null || type.isPrimitive() || (value instanceof Number && value.getClass().getName().startsWith("java.")) || value instanceof Boolean || value instanceof Character || value instanceof String || value instanceof Enum<?>;
        String text = value == null ? "null" : scalar ? value instanceof Enum<?> ? ((Enum<?>) value).name() : String.valueOf(value)
            : type.isArray() ? "length " + Array.getLength(value) : type.getName();
        int limit = Math.min(2048, Math.max(0, textBudget));
        boolean truncated = text.length() > limit;
        textBudget -= Math.min(text.length(), limit);
        if (truncated) text = text.substring(0, limit);
        StringBuilder json = new StringBuilder("{\"name\":").append(quote(name)).append(",\"type\":").append(quote(type.getName())).append(",\"value\":").append(quote(text));
        if (truncated) json.append(",\"truncated\":true");
        if (!scalar) {
            if (depth >= 2 || remaining <= 0 || seen.put(value, Boolean.TRUE) != null) json.append(",\"truncated\":true");
            else if (type.isArray()) {
                json.append(",\"children\":["); int length = Array.getLength(value), count = Math.min(Math.min(length, 32), remaining);
                for (int i = 0; i < count; i++) { if (i > 0) json.append(','); json.append(variable("[" + i + "]", Array.get(value, i), type.getComponentType(), depth + 1)); }
                json.append(']'); if (length > count) json.append(",\"truncated\":true");
            } else if (readable(type)) json.append(",\"children\":").append(fields(value, type, depth + 1));
            else json.append(",\"truncated\":true");
        }
        return json.append('}').toString();
    }

    private static boolean readable(Class<?> type) {
        String name = type.getName();
        return !(name.startsWith("java.") || name.startsWith("javax.") || name.startsWith("com.qualcomm.")
            || name.startsWith("org.firstinspires.ftc.sim.") || name.startsWith("kotlin.") || name.startsWith("android."));
    }
    private static String quote(String text) {
        StringBuilder json = new StringBuilder("\"");
        for (int i = 0; i < Math.min(2048, text.length()); i++) {
            char c = text.charAt(i);
            if (c == '\\' || c == '"') json.append('\\').append(c);
            else if (c < 32) json.append(String.format("\\u%04x", (int) c));
            else json.append(c);
        }
        return json.append('"').toString();
    }
}
