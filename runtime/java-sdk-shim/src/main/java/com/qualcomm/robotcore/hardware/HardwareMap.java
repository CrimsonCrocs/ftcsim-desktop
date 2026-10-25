package com.qualcomm.robotcore.hardware;

import java.util.*;
import com.qualcomm.hardware.lynx.LynxModule;

/** Typed, case-sensitive configured hardware and identity-based device enumeration. */
public final class HardwareMap implements Iterable<HardwareDevice> {
    private final Map<String,List<HardwareDevice>> devicesByName=new LinkedHashMap<String,List<HardwareDevice>>();
    public final DeviceMapping<VoltageSensor> voltageSensor=new DeviceMapping<VoltageSensor>(VoltageSensor.class);
    public final DeviceMapping<DcMotor> dcMotor=new DeviceMapping<DcMotor>(DcMotor.class);
    public final DeviceMapping<Servo> servo=new DeviceMapping<Servo>(Servo.class);
    public final DeviceMapping<AnalogInput> analogInput=new DeviceMapping<AnalogInput>(AnalogInput.class);
    public final DeviceMapping<DigitalChannel> digitalChannel=new DeviceMapping<DigitalChannel>(DigitalChannel.class);
    public final DeviceMapping<ColorSensor> colorSensor=new DeviceMapping<ColorSensor>(ColorSensor.class);
    public final DeviceMapping<TouchSensor> touchSensor=new DeviceMapping<TouchSensor>(TouchSensor.class);
    public HardwareMap() { put("Control Hub",new LynxModule()); }

    public final class DeviceMapping<T extends HardwareDevice> implements Iterable<T> {
        private final Class<T> type;
        public DeviceMapping(Class<T> type) { this.type=Objects.requireNonNull(type); }
        public Class<T> getDeviceTypeClass() { return type; }
        public T cast(Object value) { return type.cast(value); }
        public boolean contains(String name) { return tryGet(type,name)!=null; }
        public T get(String name) { return HardwareMap.this.get(type,name); }
        public void put(String name,T device) {
            Objects.requireNonNull(device);T old=tryGet(type,name);
            if(old!=null)HardwareMap.this.remove(name,old);HardwareMap.this.put(name,device);
        }
        public boolean remove(String name) { T old=tryGet(type,name);return old!=null && HardwareMap.this.remove(name,old); }
        public Set<Map.Entry<String,T>> entrySet() {
            synchronized(HardwareMap.this) {
                Map<String,T> snapshot=new LinkedHashMap<String,T>();
                for(String name:devicesByName.keySet()) { T value=tryGet(type,name);if(value!=null)snapshot.put(name,value); }
                return Collections.unmodifiableMap(snapshot).entrySet();
            }
        }
        public int size() { return entrySet().size(); }
        @Override public Iterator<T> iterator() {
            List<T> snapshot=new ArrayList<T>();for(Map.Entry<String,T> entry:entrySet())snapshot.add(entry.getValue());return Collections.unmodifiableList(snapshot).iterator();
        }
    }
    public synchronized void put(String name,HardwareDevice device) {
        Objects.requireNonNull(device,"device cannot be null");String key=normalizeName(name);
        List<HardwareDevice> devices=devicesByName.get(key);
        if(devices==null) { devices=new ArrayList<HardwareDevice>();devicesByName.put(key,devices); }
        for(HardwareDevice existing:devices)if(existing==device)return;
        devices.add(device);
    }
    public synchronized void put(String name,List<HardwareDevice> devices) { for(HardwareDevice device:devices)put(name,device); }
    public synchronized <T extends HardwareDevice> T putForSimulator(String name,T device) { put(name,device);return device; }
    public synchronized boolean remove(String name,HardwareDevice device) {
        String key=normalizeName(name);List<HardwareDevice> devices=devicesByName.get(key);if(devices==null)return false;
        for(int i=0;i<devices.size();i++)if(devices.get(i)==device) { devices.remove(i);if(devices.isEmpty())devicesByName.remove(key);return true; }return false;
    }
    public synchronized boolean contains(String name) { return devicesByName.containsKey(normalizeName(name)); }
    public synchronized HardwareDevice get(String name) { return get(HardwareDevice.class,name); }
    public synchronized <T> T get(Class<? extends T> type,String name) {
        T device=tryGet(type,name);if(device==null)throw new IllegalArgumentException("Unable to find a hardware device with name \""+normalizeName(name)+"\" and type "+type.getSimpleName());return device;
    }
    public synchronized <T> T tryGet(Class<? extends T> type,String name) {
        Objects.requireNonNull(type);List<HardwareDevice> devices=devicesByName.get(normalizeName(name));
        if(devices!=null)for(HardwareDevice device:devices)if(type.isInstance(device))return type.cast(device);return null;
    }
    public synchronized <T> List<T> getAll(Class<? extends T> type) {
        Objects.requireNonNull(type);List<T> result=new ArrayList<T>();Set<HardwareDevice> seen=Collections.newSetFromMap(new IdentityHashMap<HardwareDevice,Boolean>());
        for(List<HardwareDevice> devices:devicesByName.values())for(HardwareDevice device:devices)if(seen.add(device)&&type.isInstance(device))result.add(type.cast(device));
        return Collections.unmodifiableList(result);
    }
    public synchronized Set<String> getNamesOf(HardwareDevice device) {
        Set<String> names=new LinkedHashSet<String>();for(Map.Entry<String,List<HardwareDevice>> entry:devicesByName.entrySet())for(HardwareDevice candidate:entry.getValue())if(candidate==device) { names.add(entry.getKey());break; }
        return Collections.unmodifiableSet(names);
    }
    public synchronized SortedSet<String> getAllNames(Class<? extends HardwareDevice> type) {
        SortedSet<String> names=new TreeSet<String>();for(HardwareDevice device:getAll(type))names.addAll(getNamesOf(device));return names;
    }
    public synchronized int size() { return getAll(HardwareDevice.class).size(); }
    @Override public synchronized Iterator<HardwareDevice> iterator() { return getAll(HardwareDevice.class).iterator(); }
    public Iterable<HardwareDevice> unsafeIterable() { return this; }
    public synchronized void advanceSimulation(double seconds) {
        if(!Double.isFinite(seconds)||seconds<0)throw new IllegalArgumentException("seconds must be finite and non-negative");
        for(SimDcMotorEx motor:getAll(SimDcMotorEx.class))motor.advanceSimulation(seconds);
    }
    public synchronized void applyMotorFeedback(String name,double position,double velocity,double currentAmps,boolean enabled) {
        get(SimDcMotorEx.class,name).applyFeedbackForSimulator(position,velocity,currentAmps,enabled);
    }
    private static String normalizeName(String name) {
        if(name==null||name.trim().isEmpty())throw new IllegalArgumentException("device name cannot be empty");return name.trim();
    }
}
