package org.firstinspires.ftc.sim;

import org.firstinspires.ftc.robotcore.external.Func;
import org.firstinspires.ftc.robotcore.external.Telemetry;

import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Thread-safe, ordered FTC SDK 11.1 telemetry implementation. */
public final class SimulatorTelemetry implements Telemetry {
    private static final int MAX_LINEABLES = 256;
    private static final int MAX_ACTIONS = 256;
    private static final int MAX_LOG_ENTRIES = 256;
    private static final int MAX_CAPTION_CHARACTERS = 256;
    private static final int MAX_VALUE_CHARACTERS = 8_192;
    private static final int DEFAULT_TRANSMISSION_INTERVAL_MILLIS = 250;

    /** One immutable item in a published telemetry row. */
    public static final class ItemSnapshot {
        private final String caption;
        private final String value;
        private final boolean retained;

        private ItemSnapshot(String caption, String value, boolean retained) {
            this.caption = caption;
            this.value = value;
            this.retained = retained;
        }

        public String getCaption() { return caption; }

        public String getValue() { return value; }

        public boolean isRetained() { return retained; }
    }

    /** One immutable display row, preserving addData/addLine order and grouping. */
    public static final class RowSnapshot {
        private final String kind;
        private final String caption;
        private final String composed;
        private final List<ItemSnapshot> items;

        private RowSnapshot(
                String kind, String caption, String composed, List<ItemSnapshot> items) {
            this.kind = kind;
            this.caption = caption;
            this.composed = composed;
            this.items = Collections.unmodifiableList(new ArrayList<ItemSnapshot>(items));
        }

        public String getKind() { return kind; }

        public String getCaption() { return caption; }

        public String getComposed() { return composed; }

        public List<ItemSnapshot> getItems() { return items; }
    }

    /** Immutable state published by the most recent successful telemetry transmission. */
    public static final class FrameSnapshot {
        private final long revision;
        private final long simulationTimeMillis;
        private final List<RowSnapshot> rows;
        private final List<String> log;
        private final DisplayFormat displayFormat;
        private final String captionValueSeparator;
        private final String itemSeparator;
        private final boolean autoClear;
        private final int transmissionIntervalMillis;
        private final Map<String, String> legacyData;

        private FrameSnapshot(
                long revision,
                long simulationTimeMillis,
                List<RowSnapshot> rows,
                List<String> log,
                DisplayFormat displayFormat,
                String captionValueSeparator,
                String itemSeparator,
                boolean autoClear,
                int transmissionIntervalMillis) {
            this.revision = revision;
            this.simulationTimeMillis = simulationTimeMillis;
            this.rows = Collections.unmodifiableList(new ArrayList<RowSnapshot>(rows));
            this.log = Collections.unmodifiableList(new ArrayList<String>(log));
            this.displayFormat = displayFormat;
            this.captionValueSeparator = captionValueSeparator;
            this.itemSeparator = itemSeparator;
            this.autoClear = autoClear;
            this.transmissionIntervalMillis = transmissionIntervalMillis;
            this.legacyData = composeLegacyData(rows, itemSeparator);
        }

        public long getRevision() { return revision; }

        public long getSimulationTimeMillis() { return simulationTimeMillis; }

        public List<RowSnapshot> getRows() { return rows; }

        public List<String> getLog() { return log; }

        public DisplayFormat getDisplayFormat() { return displayFormat; }

        public String getCaptionValueSeparator() { return captionValueSeparator; }

        public String getItemSeparator() { return itemSeparator; }

        public boolean isAutoClear() { return autoClear; }

        public int getTransmissionIntervalMillis() { return transmissionIntervalMillis; }

        public Map<String, String> getLegacyData() { return legacyData; }

        private static Map<String, String> composeLegacyData(
                List<RowSnapshot> rows, String itemSeparator) {
            LinkedHashMap<String, String> result = new LinkedHashMap<String, String>();
            int anonymousLine = 1;
            for (RowSnapshot row : rows) {
                if ("item".equals(row.kind) && row.items.size() == 1) {
                    ItemSnapshot item = row.items.get(0);
                    putUnique(result, item.caption, item.value);
                } else {
                    String key = row.caption.length() == 0
                            ? "line " + anonymousLine++ : row.caption;
                    StringBuilder value = new StringBuilder();
                    for (int index = 0; index < row.items.size(); index++) {
                        if (index > 0) value.append(itemSeparator);
                        ItemSnapshot item = row.items.get(index);
                        value.append(item.caption).append(" : ").append(item.value);
                    }
                    putUnique(result, key, value.toString());
                }
            }
            return Collections.unmodifiableMap(result);
        }

        private static void putUnique(Map<String, String> target, String requested, String value) {
            String key = requested;
            for (int duplicate = 2; target.containsKey(key); duplicate++) {
                key = requested + " (" + duplicate + ")";
            }
            target.put(key, value);
        }
    }

    private interface Lineable {}

    private final class Value {
        private final String format;
        private final Object[] formatArgs;
        private final Object fixedValue;
        private final Func<?> valueProducer;

        private Value(String format, Object[] formatArgs, Object fixedValue, Func<?> producer) {
            this.format = format;
            this.formatArgs = formatArgs;
            this.fixedValue = fixedValue;
            this.valueProducer = producer;
        }

        String compose() {
            Object value = valueProducer == null ? fixedValue : valueProducer.value();
            if (format != null) {
                Object[] values = formatArgs == null ? new Object[] { value } : formatArgs;
                return limit(String.format(Locale.ROOT, format, values), MAX_VALUE_CHARACTERS);
            }
            return limit(value == null ? "" : value.toString(), MAX_VALUE_CHARACTERS);
        }

        boolean isProducer() { return valueProducer != null; }
    }

    private final class ItemImpl implements Item, Lineable {
        private final Container parent;
        private String caption;
        private Value value;
        private Boolean retained;

        private ItemImpl(Container parent, String caption, Value value) {
            this.parent = parent;
            this.caption = requireCaption(caption);
            this.value = value;
        }

        @Override
        public String getCaption() {
            synchronized (SimulatorTelemetry.this) { return caption; }
        }

        @Override
        public Item setCaption(String newCaption) {
            synchronized (SimulatorTelemetry.this) { caption = requireCaption(newCaption); }
            return this;
        }

        @Override
        public Item setValue(String format, Object... args) {
            synchronized (SimulatorTelemetry.this) { value = formattedValue(format, args); }
            return this;
        }

        @Override
        public Item setValue(Object newValue) {
            synchronized (SimulatorTelemetry.this) { value = fixedValue(newValue); }
            return this;
        }

        @Override
        public <T> Item setValue(Func<T> producer) {
            synchronized (SimulatorTelemetry.this) { value = producedValue(null, producer); }
            return this;
        }

        @Override
        public <T> Item setValue(String format, Func<T> producer) {
            synchronized (SimulatorTelemetry.this) { value = producedValue(format, producer); }
            return this;
        }

        @Override
        public Item setRetained(Boolean shouldRetain) {
            synchronized (SimulatorTelemetry.this) { retained = shouldRetain; }
            return this;
        }

        @Override
        public boolean isRetained() {
            synchronized (SimulatorTelemetry.this) {
                return retained == null ? value.isProducer() : retained.booleanValue();
            }
        }

        @Override
        public Item addData(String childCaption, String format, Object... args) {
            synchronized (SimulatorTelemetry.this) {
                return parent.addItemAfter(this, childCaption, formattedValue(format, args));
            }
        }

        @Override
        public Item addData(String childCaption, Object childValue) {
            synchronized (SimulatorTelemetry.this) {
                return parent.addItemAfter(this, childCaption, fixedValue(childValue));
            }
        }

        @Override
        public <T> Item addData(String childCaption, Func<T> producer) {
            synchronized (SimulatorTelemetry.this) {
                return parent.addItemAfter(this, childCaption, producedValue(null, producer));
            }
        }

        @Override
        public <T> Item addData(String childCaption, String format, Func<T> producer) {
            synchronized (SimulatorTelemetry.this) {
                return parent.addItemAfter(this, childCaption, producedValue(format, producer));
            }
        }

        private ItemSnapshot snapshot() {
            return new ItemSnapshot(caption, value.compose(), isRetained());
        }
    }

    private final class LineImpl implements Line, Lineable {
        private final Container parent;
        private final String caption;
        private final Container items = new Container();

        private LineImpl(Container parent, String caption) {
            this.parent = parent;
            this.caption = requireCaption(caption);
        }

        @Override
        public Item addData(String itemCaption, String format, Object... args) {
            synchronized (SimulatorTelemetry.this) {
                return items.addItemAfter(null, itemCaption, formattedValue(format, args));
            }
        }

        @Override
        public Item addData(String itemCaption, Object value) {
            synchronized (SimulatorTelemetry.this) {
                return items.addItemAfter(null, itemCaption, fixedValue(value));
            }
        }

        @Override
        public <T> Item addData(String itemCaption, Func<T> producer) {
            synchronized (SimulatorTelemetry.this) {
                return items.addItemAfter(null, itemCaption, producedValue(null, producer));
            }
        }

        @Override
        public <T> Item addData(String itemCaption, String format, Func<T> producer) {
            synchronized (SimulatorTelemetry.this) {
                return items.addItemAfter(null, itemCaption, producedValue(format, producer));
            }
        }
    }

    private final class Container {
        private final ArrayList<Lineable> values = new ArrayList<Lineable>();

        private Item addItemAfter(Lineable previous, String caption, Value value) {
            onAddData();
            ItemImpl item = new ItemImpl(this, caption, value);
            if (countLineables(root) >= MAX_LINEABLES) return item;
            int previousIndex = previous == null ? values.size() - 1 : values.indexOf(previous);
            values.add(previousIndex < 0 ? 0 : previousIndex + 1, item);
            return item;
        }

        private Line addLineAfter(Lineable previous, String caption) {
            onAddData();
            LineImpl line = new LineImpl(this, caption);
            if (countLineables(root) >= MAX_LINEABLES) return line;
            int previousIndex = previous == null ? values.size() - 1 : values.indexOf(previous);
            values.add(previousIndex < 0 ? 0 : previousIndex + 1, line);
            return line;
        }

        private boolean remove(Lineable value) { return values.remove(value); }

        private void removeItems(boolean includeRetained) {
            Iterator<Lineable> iterator = values.iterator();
            while (iterator.hasNext()) {
                Lineable value = iterator.next();
                if (value instanceof ItemImpl) {
                    ItemImpl item = (ItemImpl) value;
                    if (includeRetained || !item.isRetained()) iterator.remove();
                } else if (value instanceof LineImpl) {
                    LineImpl line = (LineImpl) value;
                    line.items.removeItems(includeRetained);
                    if (line.items.values.isEmpty()) iterator.remove();
                }
            }
        }
    }

    private final class LogImpl implements Log {
        private final ArrayList<String> entries = new ArrayList<String>();
        private int capacity = 9;
        private DisplayOrder displayOrder = DisplayOrder.OLDEST_FIRST;

        @Override
        public int getCapacity() {
            synchronized (SimulatorTelemetry.this) { return capacity; }
        }

        @Override
        public void setCapacity(int newCapacity) {
            synchronized (SimulatorTelemetry.this) {
                capacity = Math.max(0, Math.min(MAX_LOG_ENTRIES, newCapacity));
                prune();
                logDirty = true;
                tryPublish(false);
            }
        }

        @Override
        public DisplayOrder getDisplayOrder() {
            synchronized (SimulatorTelemetry.this) { return displayOrder; }
        }

        @Override
        public void setDisplayOrder(DisplayOrder order) {
            if (order == null) throw new IllegalArgumentException("displayOrder cannot be null");
            synchronized (SimulatorTelemetry.this) {
                displayOrder = order;
                logDirty = true;
                tryPublish(false);
            }
        }

        @Override
        public void add(String entry) { add("%s", entry); }

        @Override
        public void add(String format, Object... args) {
            synchronized (SimulatorTelemetry.this) {
                entries.add(limit(String.format(Locale.ROOT, format, args), MAX_VALUE_CHARACTERS));
                prune();
                logDirty = true;
                tryPublish(false);
            }
        }

        @Override
        public void clear() {
            synchronized (SimulatorTelemetry.this) {
                entries.clear();
                logDirty = true;
            }
        }

        private void prune() {
            while (entries.size() > capacity) entries.remove(0);
        }

        private List<String> snapshot() {
            ArrayList<String> result = new ArrayList<String>(entries);
            if (displayOrder == DisplayOrder.NEWEST_FIRST) Collections.reverse(result);
            return result;
        }
    }

    private final Container root = new Container();
    private final ArrayList<Runnable> actions = new ArrayList<Runnable>();
    private final LogImpl log = new LogImpl();
    private final DecimalFormat decimalFormat = new DecimalFormat(
            "0.####", DecimalFormatSymbols.getInstance(Locale.ROOT));
    private FrameSnapshot latestFrame = new FrameSnapshot(
            0, 0, Collections.<RowSnapshot>emptyList(), Collections.<String>emptyList(),
            DisplayFormat.CLASSIC, " : ", " | ", true,
            DEFAULT_TRANSMISSION_INTERVAL_MILLIS);
    private long revision;
    private long lastTransmissionMillis;
    private long userUpdateCount;
    private boolean hasTransmitted;
    private boolean pendingUserUpdate;
    private boolean logDirty;
    private boolean autoClear = true;
    private boolean clearOnAdd;
    private int transmissionIntervalMillis = DEFAULT_TRANSMISSION_INTERVAL_MILLIS;
    private String captionValueSeparator = " : ";
    private String itemSeparator = " | ";
    private DisplayFormat displayFormat = DisplayFormat.CLASSIC;

    @Override
    public synchronized Item addData(String caption, Object value) {
        return root.addItemAfter(null, caption, fixedValue(value));
    }

    @Override
    public synchronized Item addData(String caption, String format, Object... args) {
        return root.addItemAfter(null, caption, formattedValue(format, args));
    }

    @Override
    public synchronized <T> Item addData(String caption, Func<T> producer) {
        return root.addItemAfter(null, caption, producedValue(null, producer));
    }

    @Override
    public synchronized <T> Item addData(String caption, String format, Func<T> producer) {
        return root.addItemAfter(null, caption, producedValue(format, producer));
    }

    @Override
    public synchronized Line addLine() { return addLine(""); }

    @Override
    public synchronized Line addLine(String lineCaption) {
        return root.addLineAfter(null, lineCaption);
    }

    @Override
    public synchronized boolean removeItem(Item item) {
        return item instanceof ItemImpl && ((ItemImpl) item).parent.remove((ItemImpl) item);
    }

    @Override
    public synchronized boolean removeLine(Line line) {
        return line instanceof LineImpl && ((LineImpl) line).parent.remove((LineImpl) line);
    }

    @Override
    public synchronized Object addAction(Runnable action) {
        if (action == null) throw new IllegalArgumentException("action cannot be null");
        if (actions.size() < MAX_ACTIONS) actions.add(action);
        return action;
    }

    @Override
    public synchronized boolean removeAction(Object token) { return actions.remove(token); }

    @Override
    public synchronized boolean update() {
        userUpdateCount++;
        boolean transmitted = tryPublish(true);
        clearOnAdd = autoClear;
        return transmitted;
    }

    @Override
    public synchronized void clear() {
        clearOnAdd = false;
        pendingUserUpdate = false;
        root.removeItems(false);
    }

    @Override
    public synchronized void clearAll() {
        clearOnAdd = false;
        pendingUserUpdate = false;
        actions.clear();
        root.removeItems(true);
    }

    @Override
    public synchronized boolean isAutoClear() { return autoClear; }

    @Override
    public synchronized void setAutoClear(boolean shouldAutoClear) {
        autoClear = shouldAutoClear;
    }

    @Override
    public synchronized int getMsTransmissionInterval() { return transmissionIntervalMillis; }

    @Override
    public synchronized void setMsTransmissionInterval(int intervalMillis) {
        transmissionIntervalMillis = intervalMillis;
    }

    @Override
    public synchronized String getItemSeparator() { return itemSeparator; }

    @Override
    public synchronized void setItemSeparator(String separator) {
        itemSeparator = requireSeparator(separator, "itemSeparator");
    }

    @Override
    public synchronized String getCaptionValueSeparator() { return captionValueSeparator; }

    @Override
    public synchronized void setCaptionValueSeparator(String separator) {
        captionValueSeparator = requireSeparator(separator, "captionValueSeparator");
    }

    @Override
    public synchronized void setDisplayFormat(DisplayFormat format) {
        if (format == null) throw new IllegalArgumentException("displayFormat cannot be null");
        displayFormat = format;
    }

    @Override
    public synchronized void setNumDecimalPlaces(int minimum, int maximum) {
        if (minimum < 0 || maximum < minimum) {
            throw new IllegalArgumentException("decimal places must satisfy 0 <= minimum <= maximum");
        }
        decimalFormat.setMinimumFractionDigits(minimum);
        decimalFormat.setMaximumFractionDigits(maximum);
    }

    @Override
    public synchronized Log log() { return log; }

    /** Legacy caption/value projection retained while the UI migrates to ordered rows. */
    public synchronized Map<String, String> getLatestFrame() {
        flushPendingIfDue();
        return latestFrame.getLegacyData();
    }

    /** Full ordered frame. The returned object and every collection it owns are immutable. */
    public synchronized FrameSnapshot getLatestFrameSnapshot() {
        flushPendingIfDue();
        return latestFrame;
    }

    /** Lets the iterative OpMode host avoid issuing a second user update in the same loop. */
    public synchronized long getUserUpdateCountForSimulator() { return userUpdateCount; }

    /** Publishes pending user telemetry at a simulator lifecycle boundary, independent of rate limit. */
    synchronized void flushPendingForSimulatorLifecycle() {
        if (pendingUserUpdate || logDirty) publish(pendingUserUpdate);
    }

    private void onAddData() {
        if (clearOnAdd) {
            root.removeItems(false);
            clearOnAdd = false;
            pendingUserUpdate = false;
        }
    }

    private boolean tryPublish(boolean userRequested) {
        long now = SimulatorClock.nowMillis();
        boolean intervalElapsed = !hasTransmitted
                || now - lastTransmissionMillis >= transmissionIntervalMillis;
        if (intervalElapsed) {
            publish(userRequested);
            return true;
        }
        if (userRequested) pendingUserUpdate = true;
        else logDirty = true;
        return false;
    }

    private void flushPendingIfDue() {
        if (!pendingUserUpdate && !logDirty) return;
        long now = SimulatorClock.nowMillis();
        if (!hasTransmitted || now - lastTransmissionMillis >= transmissionIntervalMillis) {
            publish(pendingUserUpdate);
        }
    }

    private void publish(boolean recomposeRows) {
        for (Runnable action : new ArrayList<Runnable>(actions)) action.run();
        List<RowSnapshot> rows = recomposeRows ? composeRows() : latestFrame.getRows();
        latestFrame = new FrameSnapshot(
                ++revision,
                SimulatorClock.nowMillis(),
                rows,
                log.snapshot(),
                displayFormat,
                captionValueSeparator,
                itemSeparator,
                autoClear,
                transmissionIntervalMillis);
        hasTransmitted = true;
        lastTransmissionMillis = SimulatorClock.nowMillis();
        pendingUserUpdate = false;
        logDirty = false;
    }

    private List<RowSnapshot> composeRows() {
        ArrayList<RowSnapshot> rows = new ArrayList<RowSnapshot>();
        for (Lineable value : root.values) {
            if (value instanceof ItemImpl) {
                ItemSnapshot item = ((ItemImpl) value).snapshot();
                rows.add(new RowSnapshot(
                        "item", "", composeItem(item), Collections.singletonList(item)));
            } else if (value instanceof LineImpl) {
                LineImpl line = (LineImpl) value;
                ArrayList<ItemSnapshot> items = new ArrayList<ItemSnapshot>();
                StringBuilder composed = new StringBuilder(line.caption);
                for (Lineable nested : line.items.values) {
                    if (!(nested instanceof ItemImpl)) continue;
                    ItemSnapshot item = ((ItemImpl) nested).snapshot();
                    if (!items.isEmpty()) composed.append(itemSeparator);
                    composed.append(composeItem(item));
                    items.add(item);
                }
                rows.add(new RowSnapshot("line", line.caption,
                        limit(composed.toString(), MAX_VALUE_CHARACTERS), items));
            }
        }
        return rows;
    }

    private String composeItem(ItemSnapshot item) {
        return limit(item.caption + captionValueSeparator + item.value, MAX_VALUE_CHARACTERS);
    }

    private Value fixedValue(Object value) {
        Object stored = value;
        if (value instanceof Double || value instanceof Float) stored = decimalFormat.format(value);
        return new Value(null, null, stored, null);
    }

    private Value formattedValue(String format, Object[] args) {
        if (format == null) throw new IllegalArgumentException("format cannot be null");
        return new Value(format, args == null ? new Object[0] : args.clone(), null, null);
    }

    private Value producedValue(String format, Func<?> producer) {
        if (producer == null) throw new IllegalArgumentException("valueProducer cannot be null");
        return new Value(format, null, null, producer);
    }

    private int countLineables(Container container) {
        int count = container.values.size();
        for (Lineable value : container.values) {
            if (value instanceof LineImpl) count += countLineables(((LineImpl) value).items);
        }
        return count;
    }

    private static String requireCaption(String value) {
        if (value == null) throw new IllegalArgumentException("caption cannot be null");
        return limit(value, MAX_CAPTION_CHARACTERS);
    }

    private static String requireSeparator(String value, String name) {
        if (value == null) throw new IllegalArgumentException(name + " cannot be null");
        return limit(value, MAX_CAPTION_CHARACTERS);
    }

    private static String limit(String value, int characters) {
        String safe = value == null ? "" : value;
        return safe.length() <= characters ? safe : safe.substring(0, characters);
    }
}
