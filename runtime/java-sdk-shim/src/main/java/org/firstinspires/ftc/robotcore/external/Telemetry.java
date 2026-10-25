package org.firstinspires.ftc.robotcore.external;

/**
 * FTC SDK 11.1 telemetry surface modeled by the simulator.
 *
 * <p>Speech is intentionally absent: the browser runner has no Driver Station text-to-speech
 * device, so TeamCode that references it receives a compile-time compatibility diagnostic rather
 * than a silent no-op.</p>
 */
public interface Telemetry {
    enum DisplayFormat { CLASSIC, MONOSPACE, HTML }

    interface Item {
        String getCaption();

        Item setCaption(String caption);

        Item setValue(String format, Object... args);

        Item setValue(Object value);

        <T> Item setValue(Func<T> valueProducer);

        <T> Item setValue(String format, Func<T> valueProducer);

        Item setRetained(Boolean retained);

        boolean isRetained();

        Item addData(String caption, String format, Object... args);

        Item addData(String caption, Object value);

        <T> Item addData(String caption, Func<T> valueProducer);

        <T> Item addData(String caption, String format, Func<T> valueProducer);
    }

    interface Line {
        Item addData(String caption, String format, Object... args);

        Item addData(String caption, Object value);

        <T> Item addData(String caption, Func<T> valueProducer);

        <T> Item addData(String caption, String format, Func<T> valueProducer);
    }

    interface Log {
        enum DisplayOrder { NEWEST_FIRST, OLDEST_FIRST }

        int getCapacity();

        void setCapacity(int capacity);

        DisplayOrder getDisplayOrder();

        void setDisplayOrder(DisplayOrder displayOrder);

        void add(String entry);

        void add(String format, Object... args);

        void clear();
    }

    Item addData(String caption, Object value);

    Item addData(String caption, String format, Object... args);

    <T> Item addData(String caption, Func<T> valueProducer);

    <T> Item addData(String caption, String format, Func<T> valueProducer);

    Line addLine();

    Line addLine(String lineCaption);

    boolean removeItem(Item item);

    boolean removeLine(Line line);

    Object addAction(Runnable action);

    boolean removeAction(Object token);

    boolean update();

    void clear();

    void clearAll();

    boolean isAutoClear();

    void setAutoClear(boolean autoClear);

    int getMsTransmissionInterval();

    void setMsTransmissionInterval(int msTransmissionInterval);

    String getItemSeparator();

    void setItemSeparator(String itemSeparator);

    String getCaptionValueSeparator();

    void setCaptionValueSeparator(String captionValueSeparator);

    void setDisplayFormat(DisplayFormat displayFormat);

    void setNumDecimalPlaces(int minDecimalPlaces, int maxDecimalPlaces);

    Log log();
}
