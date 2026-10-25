package com.qualcomm.robotcore.hardware;

/** Public field layout for the common FTC gamepad controls. */
public class Gamepad {
    public static final int RUMBLE_DURATION_CONTINUOUS = -1;
    public static final float DEFAULT_TRIGGER_THRESHOLD = 0.5f;
    public static final int ID_UNASSOCIATED = -1, ID_SYNTHETIC = -2;
    public volatile int id = ID_UNASSOCIATED;
    public volatile long timestamp;
    public volatile boolean left_trigger_pressed, right_trigger_pressed;
    private volatile float triggerThreshold = DEFAULT_TRIGGER_THRESHOLD;
    public volatile float left_stick_x;
    public volatile float left_stick_y;
    public volatile float right_stick_x;
    public volatile float right_stick_y;
    public volatile float left_trigger;
    public volatile float right_trigger;
    public volatile boolean a;
    public volatile boolean b;
    public volatile boolean x;
    public volatile boolean y;
    public volatile boolean dpad_up;
    public volatile boolean dpad_down;
    public volatile boolean dpad_left;
    public volatile boolean dpad_right;
    public volatile boolean left_bumper;
    public volatile boolean right_bumper;
    public volatile boolean left_stick_button;
    public volatile boolean right_stick_button;
    public volatile boolean start;
    public volatile boolean back;
    public volatile boolean guide;
    public volatile boolean cross;
    public volatile boolean circle;
    public volatile boolean square;
    public volatile boolean triangle;
    public volatile boolean share;
    public volatile boolean options;
    public volatile boolean ps;
    public volatile boolean touchpad;

    private final boolean[] last = new boolean[25], pressed = new boolean[25], released = new boolean[25];
    private RumbleCommand pendingRumble;
    private boolean rumbling;

    public static final class RumbleCommand {
        public final double rumble1;
        public final double rumble2;
        public final int durationMs;

        private RumbleCommand(double rumble1, double rumble2, int durationMs) {
            this.rumble1 = rumble1;
            this.rumble2 = rumble2;
            this.durationMs = durationMs;
        }
    }

    public synchronized void rumble(int durationMs) { rumble(1, 1, durationMs); }

    public synchronized void rumble(double rumble1, double rumble2, int durationMs) {
        if (!Double.isFinite(rumble1) || !Double.isFinite(rumble2)
                || rumble1 < 0 || rumble1 > 1 || rumble2 < 0 || rumble2 > 1
                || durationMs < RUMBLE_DURATION_CONTINUOUS) {
            throw new IllegalArgumentException("Invalid rumble parameters");
        }
        pendingRumble = new RumbleCommand(rumble1, rumble2, durationMs);
        rumbling = rumble1 > 0 || rumble2 > 0;
    }

    public synchronized void rumbleBlips(int count) {
        if (count < 0) throw new IllegalArgumentException("count cannot be negative");
        if (count > 0) rumble(1, 1, Math.min(10_000, count * 250));
    }

    public synchronized void stopRumble() { rumble(0, 0, 0); }

    public synchronized boolean isRumbling() { return rumbling; }

    public synchronized RumbleCommand consumeRumbleCommandForSimulator() {
        RumbleCommand command = pendingRumble;
        pendingRumble = null;
        if (command != null && command.durationMs != RUMBLE_DURATION_CONTINUOUS) rumbling = false;
        return command;
    }

    public synchronized boolean dpadUpWasPressed() { boolean result=pressed[0];pressed[0]=false;return result; }
    public synchronized boolean dpadUpWasReleased() { boolean result=released[0];released[0]=false;return result; }
    public synchronized boolean dpadDownWasPressed() { boolean result=pressed[1];pressed[1]=false;return result; }
    public synchronized boolean dpadDownWasReleased() { boolean result=released[1];released[1]=false;return result; }
    public synchronized boolean dpadLeftWasPressed() { boolean result=pressed[2];pressed[2]=false;return result; }
    public synchronized boolean dpadLeftWasReleased() { boolean result=released[2];released[2]=false;return result; }
    public synchronized boolean dpadRightWasPressed() { boolean result=pressed[3];pressed[3]=false;return result; }
    public synchronized boolean dpadRightWasReleased() { boolean result=released[3];released[3]=false;return result; }
    public synchronized boolean aWasPressed() { boolean result=pressed[4];pressed[4]=false;return result; }
    public synchronized boolean aWasReleased() { boolean result=released[4];released[4]=false;return result; }
    public synchronized boolean bWasPressed() { boolean result=pressed[5];pressed[5]=false;return result; }
    public synchronized boolean bWasReleased() { boolean result=released[5];released[5]=false;return result; }
    public synchronized boolean xWasPressed() { boolean result=pressed[6];pressed[6]=false;return result; }
    public synchronized boolean xWasReleased() { boolean result=released[6];released[6]=false;return result; }
    public synchronized boolean yWasPressed() { boolean result=pressed[7];pressed[7]=false;return result; }
    public synchronized boolean yWasReleased() { boolean result=released[7];released[7]=false;return result; }
    public synchronized boolean guideWasPressed() { boolean result=pressed[8];pressed[8]=false;return result; }
    public synchronized boolean guideWasReleased() { boolean result=released[8];released[8]=false;return result; }
    public synchronized boolean startWasPressed() { boolean result=pressed[9];pressed[9]=false;return result; }
    public synchronized boolean startWasReleased() { boolean result=released[9];released[9]=false;return result; }
    public synchronized boolean backWasPressed() { boolean result=pressed[10];pressed[10]=false;return result; }
    public synchronized boolean backWasReleased() { boolean result=released[10];released[10]=false;return result; }
    public synchronized boolean leftBumperWasPressed() { boolean result=pressed[11];pressed[11]=false;return result; }
    public synchronized boolean leftBumperWasReleased() { boolean result=released[11];released[11]=false;return result; }
    public synchronized boolean rightBumperWasPressed() { boolean result=pressed[12];pressed[12]=false;return result; }
    public synchronized boolean rightBumperWasReleased() { boolean result=released[12];released[12]=false;return result; }
    public synchronized boolean leftStickButtonWasPressed() { boolean result=pressed[13];pressed[13]=false;return result; }
    public synchronized boolean leftStickButtonWasReleased() { boolean result=released[13];released[13]=false;return result; }
    public synchronized boolean rightStickButtonWasPressed() { boolean result=pressed[14];pressed[14]=false;return result; }
    public synchronized boolean rightStickButtonWasReleased() { boolean result=released[14];released[14]=false;return result; }
    public synchronized boolean circleWasPressed() { boolean result=pressed[15];pressed[15]=false;return result; }
    public synchronized boolean circleWasReleased() { boolean result=released[15];released[15]=false;return result; }
    public synchronized boolean crossWasPressed() { boolean result=pressed[16];pressed[16]=false;return result; }
    public synchronized boolean crossWasReleased() { boolean result=released[16];released[16]=false;return result; }
    public synchronized boolean triangleWasPressed() { boolean result=pressed[17];pressed[17]=false;return result; }
    public synchronized boolean triangleWasReleased() { boolean result=released[17];released[17]=false;return result; }
    public synchronized boolean squareWasPressed() { boolean result=pressed[18];pressed[18]=false;return result; }
    public synchronized boolean squareWasReleased() { boolean result=released[18];released[18]=false;return result; }
    public synchronized boolean shareWasPressed() { boolean result=pressed[19];pressed[19]=false;return result; }
    public synchronized boolean shareWasReleased() { boolean result=released[19];released[19]=false;return result; }
    public synchronized boolean optionsWasPressed() { boolean result=pressed[20];pressed[20]=false;return result; }
    public synchronized boolean optionsWasReleased() { boolean result=released[20];released[20]=false;return result; }
    public synchronized boolean touchpadWasPressed() { boolean result=pressed[21];pressed[21]=false;return result; }
    public synchronized boolean touchpadWasReleased() { boolean result=released[21];released[21]=false;return result; }
    public synchronized boolean psWasPressed() { boolean result=pressed[22];pressed[22]=false;return result; }
    public synchronized boolean psWasReleased() { boolean result=released[22];released[22]=false;return result; }
    public synchronized boolean leftTriggerWasPressed() { boolean result=pressed[23];pressed[23]=false;return result; }
    public synchronized boolean leftTriggerWasReleased() { boolean result=released[23];released[23]=false;return result; }
    public synchronized boolean rightTriggerWasPressed() { boolean result=pressed[24];pressed[24]=false;return result; }
    public synchronized boolean rightTriggerWasReleased() { boolean result=released[24];released[24]=false;return result; }

    public synchronized void resetEdgeDetection() {
        java.util.Arrays.fill(last,false);java.util.Arrays.fill(pressed,false);java.util.Arrays.fill(released,false);
    }
    private void updateEdges() {
        boolean[] values={dpad_up,dpad_down,dpad_left,dpad_right,a,b,x,y,guide,start,back,left_bumper,right_bumper,left_stick_button,right_stick_button,circle,cross,triangle,square,share,options,touchpad,ps,left_trigger_pressed,right_trigger_pressed};
        for(int i=0;i<last.length;i++) { pressed[i]|=values[i]&&!last[i];released[i]|=!values[i]&&last[i];last[i]=values[i]; }
    }
    public synchronized void beginSimulatorUpdate() { resetValues();refreshTimestamp(); }

    public synchronized void updateButtonAliases() {
        cross = a;
        circle = b;
        square = x;
        triangle = y;
        share = back;
        options = start;
        ps = guide;
        left_trigger_pressed = left_trigger >= triggerThreshold;
        right_trigger_pressed = right_trigger >= triggerThreshold;
        updateEdges();
    }

    public boolean atRest() { return left_stick_x==0 && left_stick_y==0 && right_stick_x==0 && right_stick_y==0 && left_trigger==0 && right_trigger==0; }
    public void setTriggerThreshold(float threshold) { triggerThreshold=threshold; }
    public float getTriggerThreshold() { return triggerThreshold; }
    public void setGamepadId(int id) { this.id=id; }
    public int getGamepadId() { return id; }
    public void setTimestamp(long timestamp) { this.timestamp=timestamp; }
    public void refreshTimestamp() { timestamp=org.firstinspires.ftc.sim.SimulatorClock.nowMillis(); }
    /** Copy input state only; the destination owns its edge history and trigger threshold. */
    public synchronized void copy(Gamepad source) {
        if(source==null)throw new IllegalArgumentException("Gamepad cannot be null");
        left_stick_x=source.left_stick_x;
        left_stick_y=source.left_stick_y;
        right_stick_x=source.right_stick_x;
        right_stick_y=source.right_stick_y;
        left_trigger=source.left_trigger;
        right_trigger=source.right_trigger;
        a=source.a;
        b=source.b;
        x=source.x;
        y=source.y;
        dpad_up=source.dpad_up;
        dpad_down=source.dpad_down;
        dpad_left=source.dpad_left;
        dpad_right=source.dpad_right;
        left_bumper=source.left_bumper;
        right_bumper=source.right_bumper;
        left_stick_button=source.left_stick_button;
        right_stick_button=source.right_stick_button;
        start=source.start;
        back=source.back;
        guide=source.guide;
        touchpad=source.touchpad;
        id=source.id;
        timestamp=source.timestamp;
        updateButtonAliases();
    }
    public synchronized void reset() { copy(new Gamepad()); }

    private void resetValues() {
        left_stick_x = 0;
        left_stick_y = 0;
        right_stick_x = 0;
        right_stick_y = 0;
        left_trigger = 0;
        left_trigger_pressed = right_trigger_pressed = false;
        right_trigger = 0;
        a = false;
        b = false;
        x = false;
        y = false;
        dpad_up = false;
        dpad_down = false;
        dpad_left = false;
        dpad_right = false;
        left_bumper = false;
        right_bumper = false;
        left_stick_button = false;
        right_stick_button = false;
        start = false;
        back = false;
        guide = false;
        cross = circle = square = triangle = false;
        share = options = ps = touchpad = false;
    }
}
