package org.opencv.core;
import java.util.List;
import java.util.ArrayList;
public class MatOfInt extends Mat {
    public MatOfInt() {}
    public MatOfInt(int... values) { fromArray(values); }
    public MatOfInt(Mat source) { source.copyTo(this); }
    public void alloc(int elements) { create(elements,1,CvType.CV_32SC1); }
    public void fromArray(int... values) { alloc(values.length);put(0,0,values); }
    public int[] toArray() { int[] result=new int[rows()];get(0,0,result);return result; }
    public void fromList(List<Integer> values) { int[] array=new int[values.size()];for(int i=0;i<array.length;i++)array[i]=values.get(i);fromArray(array); }
    public List<Integer> toList() { List<Integer> result=new ArrayList<Integer>();for(int value:toArray())result.add(value);return result; }
}
