package org.firstinspires.ftc.robotcore.external.matrices;

/** Bounded CPU matrix operations used by navigation and rigid transforms. */
public abstract class MatrixF {
    protected final int rows,cols;
    public MatrixF(int rows,int cols) {
        if(rows<1||cols<1||(long)rows*cols>1_048_576)throw new IllegalArgumentException("Invalid matrix dimensions");this.rows=rows;this.cols=cols;
    }
    public int numRows() { return rows; }
    public int numCols() { return cols; }
    public abstract float get(int row,int col);
    public abstract void put(int row,int col,float value);
    public MatrixF emptyMatrix(int rows,int cols) { return new Dense(rows,cols); }
    private static final class Dense extends MatrixF {
        final float[] values;
        Dense(int rows,int cols) { super(rows,cols);values=new float[rows*cols]; }
        private int index(int row,int col) { if(row<0||row>=rows||col<0||col>=cols)throw new IndexOutOfBoundsException();return row*cols+col; }
        @Override public float get(int row,int col) { return values[index(row,col)]; }
        @Override public void put(int row,int col,float value) { values[index(row,col)]=value; }
    }
    public static MatrixF identityMatrix(int size) { return diagonalMatrix(size,1); }
    public static MatrixF diagonalMatrix(int size,float value) { MatrixF result=new Dense(size,size);for(int i=0;i<size;i++)result.put(i,i,value);return result; }
    public static MatrixF diagonalMatrix(VectorF values) { MatrixF result=new Dense(values.length(),values.length());for(int i=0;i<values.length();i++)result.put(i,i,values.get(i));return result; }
    public VectorF getRow(int row) { VectorF result=VectorF.length(cols);for(int c=0;c<cols;c++)result.put(c,get(row,c));return result; }
    public VectorF getColumn(int col) { VectorF result=VectorF.length(rows);for(int r=0;r<rows;r++)result.put(r,get(r,col));return result; }
    public VectorF getTranslation() { if(rows<3||cols<4)throw new IllegalArgumentException("Translation requires a homogeneous matrix");return new VectorF(get(0,3),get(1,3),get(2,3)); }
    public MatrixF transposed() { MatrixF result=emptyMatrix(cols,rows);for(int r=0;r<rows;r++)for(int c=0;c<cols;c++)result.put(c,r,get(r,c));return result; }
    public MatrixF multiplied(MatrixF other) {
        if(cols!=other.rows)throw new IllegalArgumentException("Incompatible matrix dimensions");MatrixF result=emptyMatrix(rows,other.cols);
        for(int r=0;r<rows;r++)for(int c=0;c<other.cols;c++) { float sum=0;for(int k=0;k<cols;k++)sum+=get(r,k)*other.get(k,c);result.put(r,c,sum); }return result;
    }
    public VectorF multiplied(VectorF vector) {
        if(cols!=vector.length())throw new IllegalArgumentException("Incompatible vector dimensions");VectorF result=VectorF.length(rows);
        for(int r=0;r<rows;r++) { float sum=0;for(int c=0;c<cols;c++)sum+=get(r,c)*vector.get(c);result.put(r,sum); }return result;
    }
    public VectorF multiplied(float[] values) { return multiplied(new VectorF(values)); }
    public VectorF transform(VectorF vector) { VectorF input=vector;if(cols==4&&vector.length()==3)input=new VectorF(vector.get(0),vector.get(1),vector.get(2),1);return multiplied(input).normalized3D(); }
    public MatrixF multiplied(float scale) { MatrixF result=emptyMatrix(rows,cols);for(int r=0;r<rows;r++)for(int c=0;c<cols;c++)result.put(r,c,get(r,c)*scale);return result; }
    public void multiply(float scale) { for(int r=0;r<rows;r++)for(int c=0;c<cols;c++)put(r,c,get(r,c)*scale); }
    public void multiply(MatrixF other) { assign(multiplied(other)); }
    protected final void assign(MatrixF other) { requireSameShape(other);for(int r=0;r<rows;r++)for(int c=0;c<cols;c++)put(r,c,other.get(r,c)); }
    private void requireSameShape(MatrixF other) { if(rows!=other.rows||cols!=other.cols)throw new IllegalArgumentException("Incompatible matrix dimensions"); }
    public MatrixF added(MatrixF other) { requireSameShape(other);MatrixF result=emptyMatrix(rows,cols);for(int r=0;r<rows;r++)for(int c=0;c<cols;c++)result.put(r,c,get(r,c)+other.get(r,c));return result; }
    public MatrixF subtracted(MatrixF other) { return added(other.multiplied(-1)); }
    public void add(MatrixF other) { assign(added(other)); }
    public void subtract(MatrixF other) { assign(subtracted(other)); }
    public VectorF toVector() { if(rows==1)return getRow(0);if(cols==1)return getColumn(0);throw new IllegalArgumentException("Matrix is not a vector"); }
    public MatrixF inverted() {
        if(rows!=cols)throw new IllegalArgumentException("Matrix must be square");int n=rows;double[][] work=new double[n][2*n];
        for(int r=0;r<n;r++) { for(int c=0;c<n;c++)work[r][c]=get(r,c);work[r][n+r]=1; }
        for(int col=0;col<n;col++) {
            int pivot=col;for(int r=col+1;r<n;r++)if(Math.abs(work[r][col])>Math.abs(work[pivot][col]))pivot=r;
            if(Math.abs(work[pivot][col])<1e-15)throw new IllegalArgumentException("Matrix is singular");double[] swap=work[col];work[col]=work[pivot];work[pivot]=swap;
            double divisor=work[col][col];for(int c=0;c<2*n;c++)work[col][c]/=divisor;
            for(int r=0;r<n;r++)if(r!=col) { double scale=work[r][col];for(int c=0;c<2*n;c++)work[r][c]-=scale*work[col][c]; }
        }
        MatrixF result=emptyMatrix(n,n);for(int r=0;r<n;r++)for(int c=0;c<n;c++)result.put(r,c,(float)work[r][c+n]);return result;
    }
    @Override public String toString() { StringBuilder result=new StringBuilder("{");for(int r=0;r<rows;r++) { if(r>0)result.append(',');result.append(getRow(r)); }return result.append('}').toString(); }
}
