package org.firstinspires.ftc.robotcore.external.matrices;

/** FTC metadata vector ABI; tag field placement is absent from current camera observations. */
public class VectorF {
    protected float[] data;
    public VectorF(float[] data) { this.data = data; }
    public VectorF(float x) { this(new float[] { x }); }
    public VectorF(float x, float y) { this(new float[] { x, y }); }
    public VectorF(float x, float y, float z) { this(new float[] { x, y, z }); }
    public VectorF(float x, float y, float z, float w) { this(new float[] { x, y, z, w }); }
    public static VectorF length(int size) { return new VectorF(new float[size]); }
    public float[] getData() { return data; }
    public int length() { return data.length; }
    public float get(int index) { return data[index]; }
    public void put(int index, float value) { data[index] = value; }
    public float dotProduct(VectorF other) { requireLength(other);float result=0;for(int i=0;i<length();i++)result+=get(i)*other.get(i);return result; }
    public float magnitude() { return (float)Math.sqrt(dotProduct(this)); }
    public VectorF normalized3D() { if(length()==3)return this;if(length()==4)return new VectorF(get(0)/get(3),get(1)/get(3),get(2)/get(3));throw new IllegalArgumentException("Expected a 3D vector"); }
    public VectorF multiplied(float scale) { VectorF result=VectorF.length(length());for(int i=0;i<length();i++)result.put(i,get(i)*scale);return result; }
    public void multiply(float scale) { for(int i=0;i<length();i++)put(i,get(i)*scale); }
    public VectorF added(VectorF other) { requireLength(other);VectorF result=VectorF.length(length());for(int i=0;i<length();i++)result.put(i,get(i)+other.get(i));return result; }
    public VectorF subtracted(VectorF other) { return added(other.multiplied(-1)); }
    public void add(VectorF other) { requireLength(other);for(int i=0;i<length();i++)put(i,get(i)+other.get(i)); }
    public void subtract(VectorF other) { requireLength(other);for(int i=0;i<length();i++)put(i,get(i)-other.get(i)); }
    private void requireLength(VectorF other) { if(length()!=other.length())throw new IllegalArgumentException("Vector dimensions differ"); }
    @Override public String toString() { StringBuilder result=new StringBuilder("{");for(int i=0;i<length();i++) { if(i>0)result.append(' ');result.append(String.format(java.util.Locale.getDefault(),"%.2f",get(i))); }return result.append('}').toString(); }
}
