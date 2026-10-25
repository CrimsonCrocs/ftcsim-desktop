package org.firstinspires.ftc.sim;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.util.Map;
import java.util.LinkedHashMap;

/** Loads team and library bytecode with simulation time, while runner watchdogs keep wall time. */
public final class SimulatorClassLoader extends ClassLoader {
    public SimulatorClassLoader(ClassLoader parent) { super(parent); }

    @Override protected synchronized Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        if (name.startsWith("java.") || name.startsWith("javax.") || name.startsWith("jdk.")
                || name.startsWith("sun.") || name.startsWith("com.qualcomm.")
                || name.startsWith("org.firstinspires.ftc.robotcore.")
                || name.startsWith("org.firstinspires.ftc.vision.")
                || name.startsWith("org.opencv.") || name.startsWith("org.openftc.easyopencv.")
                || name.startsWith("android.")
                || name.startsWith("org.firstinspires.ftc.sim.")) {
            return super.loadClass(name, resolve);
        }
        Class<?> loaded = findLoadedClass(name);
        if (loaded == null) {
            try (InputStream input = getParent().getResourceAsStream(name.replace('.', '/') + ".class")) {
                if (input == null) return super.loadClass(name, resolve);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] block = new byte[8192]; int count;
                while ((count = input.read(block)) != -1) output.write(block, 0, count);
                byte[] bytes = virtualizeClock(output.toByteArray());
                loaded = defineClass(name, bytes, 0, bytes.length);
            } catch (IOException failure) { throw new ClassNotFoundException(name, failure); }
        }
        if (resolve) resolveClass(loaded);
        return loaded;
    }

    /** Changes only exact method owners; string literals and other System/Thread APIs stay intact. */
    static byte[] virtualizeClock(byte[] bytes) throws IOException {
        if (bytes.length < 10 || u4(bytes, 0) != 0xcafebabe) throw new IOException("Invalid JVM class");
        int size = u2(bytes, 8), cursor = 10;
        int[] tags = new int[size], offsets = new int[size], first = new int[size], second = new int[size];
        String[] strings = new String[size];
        for (int index = 1; index < size; index++) {
            offsets[index] = cursor;
            int tag = bytes[cursor++] & 255; tags[index] = tag;
            switch (tag) {
                case 1:
                    int length = u2(bytes, cursor); cursor += 2;
                    strings[index] = new String(bytes, cursor, length, "UTF-8"); cursor += length; break;
                case 3: case 4: cursor += 4; break;
                case 5: case 6: cursor += 8; index++; break;
                case 7: case 8: case 16: case 19: case 20:
                    first[index] = u2(bytes, cursor); cursor += 2; break;
                case 9: case 10: case 11: case 12: case 17: case 18:
                    first[index] = u2(bytes, cursor); second[index] = u2(bytes, cursor + 2); cursor += 4; break;
                case 15: cursor += 3; break;
                default: throw new IOException("Unknown JVM constant pool tag " + tag);
            }
            if (cursor > bytes.length) throw new IOException("Truncated JVM class");
        }
        String currentClass = strings[first[u2(bytes, cursor + 2)]];
        boolean virtualPinpoint = "com/pedropathing/ftc/localization/localizers/PinpointLocalizer".equals(currentClass)
                || "com/pedropathing/revhub/localizers/PinpointLocalizer".equals(currentClass);
        boolean changed = false;
        ByteArrayOutputStream appended = new ByteArrayOutputStream();
        DataOutputStream constants = new DataOutputStream(appended);
        Map<String, Integer> owners = new LinkedHashMap<String, Integer>();
        int nextConstant = size;
        for (int index = 1; index < size; index++) {
            if (tags[index] != 10) continue;
            String owner = strings[first[first[index]]];
            int nameAndType = second[index];
            String method = strings[first[nameAndType]], descriptor = strings[second[nameAndType]];
            boolean clock = "java/lang/System".equals(owner)
                    && ("nanoTime".equals(method) || "currentTimeMillis".equals(method)) && "()J".equals(descriptor);
            boolean sleep = "java/lang/Thread".equals(owner) && "sleep".equals(method)
                    && ("(J)V".equals(descriptor) || "(JI)V".equals(descriptor));
            boolean legacyLog = owner != null && owner.endsWith("/util/LogFiles") && "record".equals(method)
                    && "(Lcom/acmerobotics/roadrunner/geometry/Pose2d;Lcom/acmerobotics/roadrunner/geometry/Pose2d;DLjava/util/List;Ljava/util/List;Ljava/util/List;Ljava/util/List;)V".equals(descriptor);
            String target = sleep && virtualPinpoint ? "org/firstinspires/ftc/sim/SimulatorHardwareClock"
                    : clock || sleep ? "org/firstinspires/ftc/sim/SimulatorClock"
                    : legacyLog ? "com/acmerobotics/roadrunner/simulator/LegacyLogFiles" : null;
            if (target != null) {
                Integer ownerIndex = owners.get(target);
                if (ownerIndex == null) {
                    if (nextConstant > 65533) throw new IOException("JVM constant pool has no room for library adapters");
                    int utfIndex = nextConstant++;
                    ownerIndex = nextConstant++;
                    constants.writeByte(1); constants.writeUTF(target);
                    constants.writeByte(7); constants.writeShort(utfIndex);
                    owners.put(target, ownerIndex);
                }
                bytes[offsets[index] + 1] = (byte) (ownerIndex >>> 8);
                bytes[offsets[index] + 2] = (byte) (int)ownerIndex;
                changed = true;
            }
        }
        if (!changed) return bytes;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        DataOutputStream data = new DataOutputStream(output);
        data.write(bytes, 0, 8); data.writeShort(nextConstant); data.write(bytes, 10, cursor - 10);
        data.write(appended.toByteArray());
        data.write(bytes, cursor, bytes.length - cursor);
        return output.toByteArray();
    }
    private static int u2(byte[] bytes, int offset) { return (bytes[offset] & 255) << 8 | (bytes[offset + 1] & 255); }
    private static int u4(byte[] bytes, int offset) { return u2(bytes, offset) << 16 | u2(bytes, offset + 2); }
}
