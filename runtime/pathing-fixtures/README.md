# Real-library path acceptance programs

These are original simulator acceptance programs, compiled against the real resolved Pedro/Road Runner libraries and official FTC SDK. Run them with `bun tools/gradle/verify-pathing.ts --run`; see `docs/PATHING_COMPATIBILITY.md` for pinned upstream versions and coverage.

The Road Runner drive and sequence implementations come from temporary upstream checkouts and remain unchanged. The legacy `DriveConstants` file here supplies an explicit virtual-robot calibration, replacing placeholder quickstart calibration only in the disposable test output. These files are not added to a user's repository.
