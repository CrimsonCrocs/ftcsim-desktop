package org.opencv.core;
public class TermCriteria {
    public static final int COUNT=1, MAX_ITER=1, EPS=2;
    public int type,maxCount;public double epsilon;
    public TermCriteria() { this(0,0,0); }
    public TermCriteria(int type,int maxCount,double epsilon) { this.type=type;this.maxCount=maxCount;this.epsilon=epsilon; }
    public TermCriteria(double[] values) { set(values); }
    public void set(double[] values) { type=values.length>0?(int)values[0]:0;maxCount=values.length>1?(int)values[1]:0;epsilon=values.length>2?values[2]:0; }
    @Override public TermCriteria clone() { return new TermCriteria(type,maxCount,epsilon); }
}
