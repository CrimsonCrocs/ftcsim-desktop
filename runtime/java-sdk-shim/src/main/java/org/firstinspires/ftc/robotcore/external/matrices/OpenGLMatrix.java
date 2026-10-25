package org.firstinspires.ftc.robotcore.external.matrices;

import org.firstinspires.ftc.robotcore.external.navigation.*;

/** Column-major homogeneous transforms, implemented without android.opengl. */
public class OpenGLMatrix extends MatrixF {
    private final float[] data;
    public OpenGLMatrix() { super(4,4);data=new float[16];for(int i=0;i<4;i++)put(i,i,1); }
    public OpenGLMatrix(float[] values) { super(4,4);if(values.length!=16)throw new IllegalArgumentException("Expected sixteen values");data=values; }
    public OpenGLMatrix(MatrixF matrix) { this();if(matrix.numRows()!=4||matrix.numCols()!=4)throw new IllegalArgumentException("Expected a 4x4 matrix");assign(matrix); }
    private int index(int row,int col) { if(row<0||row>=4||col<0||col>=4)throw new IndexOutOfBoundsException();return col*4+row; }
    @Override public float get(int row,int col) { return data[index(row,col)]; }
    @Override public void put(int row,int col,float value) { data[index(row,col)]=value; }
    public float[] getData() { return data; }
    @Override public MatrixF emptyMatrix(int rows,int cols) { return rows==4&&cols==4?new OpenGLMatrix():super.emptyMatrix(rows,cols); }
    public static OpenGLMatrix identityMatrix() { return new OpenGLMatrix(); }
    public static OpenGLMatrix translation(float x,float y,float z) { OpenGLMatrix result=new OpenGLMatrix();result.put(0,3,x);result.put(1,3,y);result.put(2,3,z);return result; }
    public static OpenGLMatrix rotation(AxesReference reference,AxesOrder order,AngleUnit unit,float first,float second,float third) { return Orientation.getRotationMatrix(reference,order,unit,first,second,third); }
    public static OpenGLMatrix rotation(AngleUnit unit,float angle,float x,float y,float z) {
        double length=Math.sqrt(x*x+y*y+z*z);OpenGLMatrix result=new OpenGLMatrix();if(length==0)return result;x/=length;y/=length;z/=length;
        double radians=unit.getUnnormalized().toRadians(angle),cos=Math.cos(radians),sin=Math.sin(radians),t=1-cos;
        result.put(0,0,(float)(t*x*x+cos));result.put(0,1,(float)(t*x*y-sin*z));result.put(0,2,(float)(t*x*z+sin*y));
        result.put(1,0,(float)(t*x*y+sin*z));result.put(1,1,(float)(t*y*y+cos));result.put(1,2,(float)(t*y*z-sin*x));
        result.put(2,0,(float)(t*x*z-sin*y));result.put(2,1,(float)(t*y*z+sin*x));result.put(2,2,(float)(t*z*z+cos));return result;
    }
    public OpenGLMatrix multiplied(OpenGLMatrix other) { return new OpenGLMatrix(super.multiplied(other)); }
    public void multiply(OpenGLMatrix other) { assign(multiplied(other)); }
    @Override public OpenGLMatrix inverted() { return new OpenGLMatrix(super.inverted()); }
    @Override public OpenGLMatrix transposed() { return new OpenGLMatrix(super.transposed()); }
    public void translate(float x,float y,float z) { multiply(translation(x,y,z)); }
    public OpenGLMatrix translated(float x,float y,float z) { return multiplied(translation(x,y,z)); }
    public void rotate(AxesReference reference,AxesOrder order,AngleUnit unit,float first,float second,float third) { multiply(rotation(reference,order,unit,first,second,third)); }
    public OpenGLMatrix rotated(AxesReference reference,AxesOrder order,AngleUnit unit,float first,float second,float third) { return multiplied(rotation(reference,order,unit,first,second,third)); }
    public void rotate(AngleUnit unit,float angle,float x,float y,float z) { multiply(rotation(unit,angle,x,y,z)); }
    public OpenGLMatrix rotated(AngleUnit unit,float angle,float x,float y,float z) { return multiplied(rotation(unit,angle,x,y,z)); }
    public void scale(float x,float y,float z) { OpenGLMatrix scale=new OpenGLMatrix();scale.put(0,0,x);scale.put(1,1,y);scale.put(2,2,z);multiply(scale); }
    public void scale(float scale) { scale(scale,scale,scale); }
    public OpenGLMatrix scaled(float x,float y,float z) { OpenGLMatrix result=new OpenGLMatrix(this);result.scale(x,y,z);return result; }
    public OpenGLMatrix scaled(float scale) { return scaled(scale,scale,scale); }
}
