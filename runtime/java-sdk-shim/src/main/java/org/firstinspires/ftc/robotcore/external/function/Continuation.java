package org.firstinspires.ftc.robotcore.external.function;

import java.util.concurrent.Executor;

/** FTC continuation dispatch without an Android Handler/Looper dependency. */
public class Continuation<T> {
    protected final T target;
    private final Executor executor;
    protected Continuation(T target) { this(target,null); }
    private Continuation(T target,Executor executor) {
        if(target==null) throw new IllegalArgumentException("Continuation target is required");
        this.target=target;this.executor=executor;
    }
    public static <T> Continuation<T> createTrivial(T target) { return new Continuation<T>(target); }
    public static <T> Continuation<T> create(Executor executor,T target) {
        if(executor==null) throw new IllegalArgumentException("Executor is required");
        return new Continuation<T>(target,executor);
    }
    public <U> Continuation<U> createForNewTarget(U target) { return new Continuation<U>(target,executor); }
    public T getTarget() { return target; }
    public void dispatch(final ContinuationResult<? super T> result) {
        if(result==null) throw new IllegalArgumentException("Continuation result is required");
        if(executor==null) result.handle(target);
        else executor.execute(new Runnable() { @Override public void run() { result.handle(target); } });
    }
    public void dispatchHere(ContinuationResult<? super T> result) { result.handle(target); }
    public boolean isTrivial() { return executor==null; }
    public boolean isHandler() { return false; }
    public boolean isDispatchSynchronous() { return isTrivial(); }
    public boolean canBorrowThread(Thread thread) { return isTrivial(); }
}
