package org.firstinspires.ftc.robotcore.internal.system;

import java.util.Locale;

/** The formatting helpers used by the legacy Road Runner firmware check; no Android facilities. */
public final class Misc {
    private Misc() {}
    public static String formatInvariant(String format,Object... arguments) { return String.format(Locale.ROOT,format,arguments); }
    public static String formatForUser(String format,Object... arguments) { return String.format(Locale.getDefault(),format,arguments); }
}
