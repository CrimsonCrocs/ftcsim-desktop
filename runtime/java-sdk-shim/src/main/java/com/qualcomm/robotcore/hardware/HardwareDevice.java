package com.qualcomm.robotcore.hardware;

/** Common FTC hardware identity contract with deterministic simulator defaults. */
public interface HardwareDevice {
    enum Manufacturer {
        Unknown,
        Lego,
        HiTechnic,
        ModernRobotics,
        Adafruit,
        Matrix,
        Lynx,
        AMS,
        STMicroelectronics,
        Other,
        Broadcom,
        SparkFun,
        DigitalChickenLabs,
        GoBilda,
        DFRobot,
        LimelightVision,
        MaxBotix
    }

    default Manufacturer getManufacturer() { return Manufacturer.Other; }

    default String getDeviceName() { return "FTC Simulator Hardware"; }

    default String getConnectionInfo() { return "FTC Simulator"; }

    default int getVersion() { return 1; }

    default void resetDeviceConfigurationForOpMode() {}

    default void close() {}
}
