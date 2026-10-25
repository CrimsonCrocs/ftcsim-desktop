package com.qualcomm.hardware.lynx;

import com.qualcomm.robotcore.hardware.HardwareDevice;

/** Virtual hub: sensor frames are already atomic snapshots for each control tick. */
public final class LynxModule implements HardwareDevice {
    public enum BulkCachingMode { OFF, MANUAL, AUTO }
    private BulkCachingMode bulkCachingMode = BulkCachingMode.OFF;
    public void setBulkCachingMode(BulkCachingMode mode) {
        if (mode == null) throw new IllegalArgumentException("Bulk caching mode cannot be null");
        bulkCachingMode = mode;
    }
    public BulkCachingMode getBulkCachingMode() { return bulkCachingMode; }
    public void clearBulkCache() { /* The next parent-world tick replaces the atomic sensor frame. */ }
    public String getNullableFirmwareVersionString() { return "HW: 20, Maj: 1, Min: 8, Eng: 2"; }
    public String getFirmwareVersionString() { return getNullableFirmwareVersionString(); }
    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "Simulated REV Control Hub"; }
}
