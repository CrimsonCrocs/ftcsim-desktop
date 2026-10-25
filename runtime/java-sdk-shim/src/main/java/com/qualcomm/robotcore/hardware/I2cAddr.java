package com.qualcomm.robotcore.hardware;

/** FTC 11.1 I2C address value object used by ColorSensor. */
public final class I2cAddr {
    private final int address7Bit;

    public I2cAddr(int address7Bit) {
        if (address7Bit < 0 || address7Bit > 0x7f) {
            throw new IllegalArgumentException("7-bit I2C address must be from 0 through 127");
        }
        this.address7Bit = address7Bit;
    }

    public static I2cAddr zero() { return new I2cAddr(0); }

    public static I2cAddr create7bit(int address) { return new I2cAddr(address); }

    public static I2cAddr create8bit(int address) {
        if (address < 0 || address > 0xff) {
            throw new IllegalArgumentException("8-bit I2C address must be from 0 through 255");
        }
        return new I2cAddr(address >>> 1);
    }

    public int get8Bit() { return address7Bit << 1; }

    public int get7Bit() { return address7Bit; }
}
