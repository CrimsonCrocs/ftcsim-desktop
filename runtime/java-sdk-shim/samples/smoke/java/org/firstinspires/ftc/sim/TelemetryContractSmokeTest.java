package org.firstinspires.ftc.sim;

import org.firstinspires.ftc.robotcore.external.Func;
import org.firstinspires.ftc.robotcore.external.Telemetry;

import java.util.List;

/** No-library contract checks for ordered FTC telemetry behavior. */
public final class TelemetryContractSmokeTest {
    private TelemetryContractSmokeTest() {}

    public static void main(String[] args) {
        SimulatorClock.reset();
        SimulatorTelemetry telemetry = new SimulatorTelemetry();
        telemetry.setMsTransmissionInterval(0);
        telemetry.setCaptionValueSeparator(" = ");
        telemetry.setItemSeparator(" / ");
        telemetry.setDisplayFormat(Telemetry.DisplayFormat.MONOSPACE);

        final int[] produced = { 0 };
        final int[] actions = { 0 };
        Telemetry.Item first = telemetry.addData("duplicate", 1);
        first.addData("inserted", "%.1f", 1.25);
        telemetry.addData("duplicate", 2);
        telemetry.addLine("pose ")
                .addData("x", "%.2f", 3.5)
                .addData("y", 7);
        telemetry.addData("lazy", new Func<Integer>() {
            @Override public Integer value() { return ++produced[0]; }
        });
        telemetry.addAction(new Runnable() {
            @Override public void run() { actions[0]++; }
        });

        require(telemetry.update(), "the first update should publish immediately");
        SimulatorTelemetry.FrameSnapshot initial = telemetry.getLatestFrameSnapshot();
        require(initial.getRevision() == 1, "the first publication needs revision 1");
        require(initial.getRows().size() == 5, "ordered rows were collapsed");
        require("duplicate = 1".equals(initial.getRows().get(0).getComposed()),
                "caption/value separator was not composed");
        require("inserted".equals(initial.getRows().get(1).getItems().get(0).getCaption()),
                "Item.addData did not insert immediately after its parent");
        require("duplicate".equals(initial.getRows().get(2).getItems().get(0).getCaption()),
                "duplicate captions did not remain distinct");
        require("pose x = 3.50 / y = 7".equals(initial.getRows().get(3).getComposed()),
                "Line.addData did not preserve grouping and formatting");
        require(initial.getRows().get(4).getItems().get(0).isRetained(),
                "functional telemetry should be retained by default");
        require(produced[0] == 1 && actions[0] == 1,
                "actions and producers should run exactly once per publication");
        require("1".equals(initial.getLegacyData().get("duplicate"))
                        && "2".equals(initial.getLegacyData().get("duplicate (2)")),
                "legacy transport should preserve duplicate captions without overwriting");

        telemetry.log().setCapacity(2);
        SimulatorClock.advance(1);
        telemetry.log().add("old");
        telemetry.log().add("middle");
        telemetry.log().add("new %d", 3);
        telemetry.log().setDisplayOrder(Telemetry.Log.DisplayOrder.NEWEST_FIRST);
        SimulatorClock.advance(1);
        SimulatorTelemetry.FrameSnapshot withLog = telemetry.getLatestFrameSnapshot();
        require(withLog.getLog().size() == 2, "telemetry log capacity was not enforced");
        require("new 3".equals(withLog.getLog().get(0))
                        && "middle".equals(withLog.getLog().get(1)),
                "telemetry log display order was not honored");

        telemetry.addData("cycle", 2);
        SimulatorClock.advance(1);
        telemetry.update();
        SimulatorTelemetry.FrameSnapshot afterAutoClear = telemetry.getLatestFrameSnapshot();
        require(afterAutoClear.getRows().size() == 2,
                "auto-clear should remove non-retained items on the next add");
        require("lazy".equals(afterAutoClear.getRows().get(0).getItems().get(0).getCaption())
                        && "cycle".equals(afterAutoClear.getRows().get(1).getItems().get(0).getCaption()),
                "retained and current items are in the wrong order");

        telemetry.clear();
        SimulatorClock.advance(1);
        telemetry.update();
        List<SimulatorTelemetry.RowSnapshot> retainedRows =
                telemetry.getLatestFrameSnapshot().getRows();
        require(retainedRows.size() == 1
                        && "lazy".equals(retainedRows.get(0).getItems().get(0).getCaption()),
                "clear should retain functional items");

        telemetry.clearAll();
        SimulatorClock.advance(1);
        telemetry.update();
        require(telemetry.getLatestFrameSnapshot().getRows().isEmpty(),
                "clearAll should remove retained items too");

        SimulatorClock.reset();
        SimulatorTelemetry boundary = new SimulatorTelemetry();
        boundary.setMsTransmissionInterval(20);
        boundary.addData("tick", 1);
        require(boundary.update(), "boundary telemetry should publish its first frame");
        long firstRevision = boundary.getLatestFrameSnapshot().getRevision();
        SimulatorClock.advance(20);
        boundary.addData("tick", 2);
        require(boundary.update(), "an interval exactly equal to the tick should publish");
        require(boundary.getLatestFrameSnapshot().getRevision() == firstRevision + 1,
                "the exact transmission boundary was delayed by another control tick");

        System.out.println("java-sdk-shim telemetry contract tests passed");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
