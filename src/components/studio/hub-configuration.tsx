"use client";

import { CirclePlus, ExternalLink, Trash2 } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { FTC_11_1_MOTOR_MODELS, getMotorModelProfile, requiredDriveRoles, REV_HUB_ADDRESS_MIN, REV_HUB_ADDRESS_MAX,
  type DriveRole, type MotorDeviceConfiguration, type MotorModelProfile, type RobotConfigurationCommand,
  type RobotConfigurationDocument, type RobotControllerConfiguration } from "@/lib/robot-configuration";
import { RobotConfigurationPhysicalEditor } from "./robot-configuration-physical";
import styles from "./hub-configuration.module.css";

type DispatchCommand = (command: RobotConfigurationCommand) => void;
type Props = { document: RobotConfigurationDocument; disabled: boolean; onCommand: DispatchCommand };
const PORTS = [0, 1, 2, 3] as const;
const ROLE_LABELS: Record<DriveRole, string> = { frontLeft: "Front left", frontRight: "Front right", backLeft: "Back left", backRight: "Back right", center: "Center strafe" };
const PHOTO_MATCH_LABELS: Record<MotorModelProfile["imageMatch"], string> = { exact: "Exact product photo", family: "Representative family photo", "compatible-profile": "Compatible profile photo" };

function finishHubInput(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") event.currentTarget.blur();
  if (event.key === "Escape") {
    event.stopPropagation();
    event.currentTarget.value = event.currentTarget.defaultValue;
    event.currentTarget.blur();
  }
}

export function DrivetrainAssignments({ document, disabled, onCommand }: Props) {
  return <div className={styles.fields}>
    {requiredDriveRoles(document.configuration.drivetrain.kind).map((role) => <label key={role}>
      <span>{ROLE_LABELS[role]}</span>
      <select aria-label={`${ROLE_LABELS[role]} drivetrain motor`} value={document.configuration.drivetrain.bindings[role] ?? ""} disabled={disabled}
        onChange={(event) => onCommand({ type: "bind-drive-role", role, deviceId: event.target.value })}>
        <option value="">Choose motor…</option>
        {document.configuration.devices.map((motor) => <option key={motor.id} value={motor.id}>{motor.hardwareMapName || "Unnamed motor"}</option>)}
      </select>
    </label>)}
  </div>;
}

export function HubConfiguration({ document, disabled, onCommand }: Props) {
  const [category, setCategory] = useState<"motors" | "servos" | "sensors">("motors");
  const [hubId, setHubId] = useState(document.configuration.controllers[0]?.id ?? "");
  const hub = document.configuration.controllers.find((candidate) => candidate.id === hubId) ?? document.configuration.controllers[0];
  const devices = document.configuration.devices;
  const hubHasDevices = hub && (devices.some((device) => device.controllerId === hub.id)
    || document.configuration.servoPorts.some((device) => device.controllerId === hub.id)
    || document.configuration.sensorPorts.some((device) => device.controllerId === hub.id));
  return <div className={styles.root}>
    <div className={styles.categories} role="group" aria-label="Hardware category">
      {(["motors", "servos", "sensors"] as const).map((value) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
    </div>
    {category !== "motors" ? <RobotConfigurationPhysicalEditor document={document} disabled={disabled} section={category} onCommand={onCommand} /> : hub && <>
      <label className={styles.hubSelect}><span>Hub</span><select aria-label="Hub" value={hub.id} onChange={(event) => setHubId(event.target.value)}>
        {document.configuration.controllers.map((controller) => <option key={controller.id} value={controller.id}>{controller.name}</option>)}
      </select></label>
      {hub.kind === "rev-expansion-hub" && <details className={styles.hubDetails}>
        <summary>Hub settings</summary>
        <div className={styles.fields}>
          <label><span>Name</span><input key={`${hub.id}:${hub.name}`} defaultValue={hub.name} disabled={disabled} onKeyDown={finishHubInput} onBlur={(event) => { if (event.target.value !== hub.name) onCommand({type: "set-expansion-hub-name", controllerId: hub.id, name: event.target.value}); }} /></label>
          <label><span>Address</span><input type="number" min={REV_HUB_ADDRESS_MIN} max={REV_HUB_ADDRESS_MAX} key={`${hub.id}:${hub.address}`} defaultValue={hub.address} disabled={disabled} onKeyDown={finishHubInput} onBlur={(event) => {
            const address = event.target.valueAsNumber;
            if (Number.isInteger(address) && address >= REV_HUB_ADDRESS_MIN && address <= REV_HUB_ADDRESS_MAX) onCommand({type: "set-expansion-hub-address", controllerId: hub.id, address});
            else event.target.value = String(hub.address);
          }} /></label>
        </div>
        <button type="button" disabled={disabled || Boolean(hubHasDevices)} title={hubHasDevices ? "Remove this hub’s devices first" : "Remove Expansion Hub"} onClick={() => onCommand({type: "remove-expansion-hub", controllerId: hub.id})}><Trash2 aria-hidden="true" />Remove hub</button>
      </details>}
      <div className={styles.ports}>
        {PORTS.map((port) => {
          const motor = devices.find((device) => device.controllerId === hub.id && device.port === port);
          return motor ? <details className={styles.device} key={motor.id}>
            <summary><span>Port {port}</span><strong>{motor.hardwareMapName || "Unnamed motor"}</strong><small>{getMotorModelProfile(motor.motorModelId)?.label ?? motor.motorModelId}</small></summary>
            <div className={styles.deviceFields}><MotorInspector controllers={document.configuration.controllers} disabled={disabled} motor={motor} onCommand={onCommand} /></div>
          </details> : <div className={styles.emptyPort} key={port}><span>Port {port}</span><span>Empty</span><button type="button" disabled={disabled} title={`Add motor to port ${port}`} onClick={() => onCommand({type: "add-motor", controllerId: hub.id, port})}><CirclePlus aria-hidden="true" />Add motor</button></div>;
        })}
      </div>
    </>}
  </div>;
}

function MotorProductProfile({ profile }: { profile: MotorModelProfile | undefined }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  if (!profile) return <p className="hub-configuration__unknown-profile">Unknown FTC motor profile</p>;

  return (
    <div className="hub-configuration__motor-profile">
      <div className="hub-configuration__motor-media">
        <div className="hub-configuration__motor-image">
          {failedImageUrl === profile.imageUrl ? <span>Photo unavailable</span> : (
            // Product photos intentionally come from their cited manufacturer/documentation source.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.imageUrl}
              alt={profile.imageAlt}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailedImageUrl(profile.imageUrl)}
            />
          )}
        </div>
        <small>{PHOTO_MATCH_LABELS[profile.imageMatch]}</small>
      </div>
      <div className="hub-configuration__motor-specifications">
        <dl>
          <div><dt>Manufacturer</dt><dd>{profile.manufacturer}</dd></div>
          <div><dt>Model</dt><dd>{profile.modelNumber}</dd></div>
          <div><dt>Gear ratio</dt><dd>{profile.gearRatio.toLocaleString()}:1</dd></div>
          <div><dt>Encoder</dt><dd>{profile.ticksPerRevolution.toLocaleString()} CPR</dd></div>
          <div><dt>Free speed</dt><dd>{profile.maxRpm.toLocaleString()} RPM</dd></div>
          <div><dt>SDK rotation</dt><dd>{profile.orientation}</dd></div>
        </dl>
        <a
          className="nodrag nopan nowheel"
          href={profile.productUrl}
          target="_blank"
          rel="noreferrer"
          title={`Open ${profile.imageSourceLabel} source in a new tab`}
          aria-label={`Open ${profile.imageSourceLabel} source for ${profile.label} in a new tab`}
        >
          <span>Source: {profile.imageSourceLabel}</span><ExternalLink aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

function encodedPortChoice(controllerId: string, port: number): string {
  return JSON.stringify([controllerId, port]);
}

function parsePortChoice(value: string): { controllerId: string; port: number } | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    if (typeof parsed[0] !== "string" || !Number.isInteger(parsed[1])) return null;
    const port = Number(parsed[1]);
    return port >= 0 && port <= 3 ? { controllerId: parsed[0], port } : null;
  } catch {
    return null;
  }
}

function MotorInspector({
  controllers,
  disabled,
  motor,
  onCommand,
}: {
  controllers: readonly RobotControllerConfiguration[];
  disabled: boolean;
  motor: MotorDeviceConfiguration;
  onCommand: DispatchCommand;
}) {
  const profile = getMotorModelProfile(motor.motorModelId);

  return (
    <>
      <div className="hub-configuration__node-fields">
        <label>
          <span>HardwareMap name</span>
          <input
            key={`${motor.id}:name:${motor.hardwareMapName}`}
            type="text"
            defaultValue={motor.hardwareMapName}
            disabled={disabled}
            aria-label={`HardwareMap name for ${profile?.label ?? "motor"}`}
            onBlur={(event) => {
              if (event.currentTarget.value !== motor.hardwareMapName) {
                onCommand({ type: "set-motor-name", deviceId: motor.id, name: event.currentTarget.value });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.stopPropagation();
                event.currentTarget.value = motor.hardwareMapName;
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <label>
          <span>Hub and motor port</span>
          <select
            value={encodedPortChoice(motor.controllerId, motor.port)}
            disabled={disabled}
            aria-label={`REV hub and motor port for ${motor.hardwareMapName || "unnamed motor"}`}
            onChange={(event) => {
              const choice = parsePortChoice(event.target.value);
              if (!choice) return;
              onCommand({ type: "connect-motor-port", deviceId: motor.id, controllerId: choice.controllerId, port: choice.port });
            }}
          >
            {controllers.flatMap((controller) => PORTS.map((port) => (
              <option key={`${controller.id}:${port}`} value={encodedPortChoice(controller.id, port)}>
                {controller.name || "Unnamed REV hub"} · motor {port}
              </option>
            )))}
          </select>
        </label>
        <label>
          <span>Motor type</span>
          <select
            value={motor.motorModelId}
            disabled={disabled}
            aria-label={`Motor type for ${motor.hardwareMapName || "unnamed motor"}`}
            onChange={(event) => onCommand({
              type: "set-motor-model",
              deviceId: motor.id,
              motorModelId: event.target.value,
            })}
          >
            {FTC_11_1_MOTOR_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
        </label>
        <button
          className="hub-configuration__remove-button"
          type="button"
          disabled={disabled}
          title={`Remove ${motor.hardwareMapName || "unnamed motor"}`}
          aria-label={`Remove ${motor.hardwareMapName || "unnamed motor"}`}
          onClick={() => onCommand({ type: "remove-motor", deviceId: motor.id })}
        >
          <Trash2 aria-hidden="true" /> Remove motor
        </button>
      </div>
      <details className={styles.profileDetails}>
        <summary>Motor model details</summary>
        <MotorProductProfile profile={profile} />
      </details>
    </>
  );
}

