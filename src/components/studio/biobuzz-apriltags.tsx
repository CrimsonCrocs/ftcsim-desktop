"use client";

import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import {
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Quaternion,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import layout from "@/lib/biobuzz-physics-layout.json";

const TARGET_SIZE_METERS = 0.08255;
const SURFACE_OFFSET_METERS = 0.00025;

type HiveLayout = (typeof layout.hives)[number];
type FieldTag = HiveLayout["cells"][number]["tags"][number];

const tagUrls = (hive: HiveLayout) => hive.cells.flatMap((cell) => cell.tags)
  .map((tag) => `/textures/biobuzz/tag36h11-${String(tag.id).padStart(3, "0")}.png`);

export function preloadHiveTags() {
  for (const hive of layout.hives) useLoader.preload(TextureLoader, tagUrls(hive));
}

export function clearHiveTags(hiveId: string) {
  const hive = layout.hives.find((candidate) => candidate.id === hiveId);
  if (hive) useLoader.clear(TextureLoader, tagUrls(hive));
}

function AprilTagPlane({ tag, texture }: { tag: FieldTag; texture: Texture }) {
  const { position, quaternion } = useMemo(() => {
    const right = new Vector3(tag.right.x, tag.right.y, tag.right.z).normalize();
    const up = new Vector3(tag.up.x, tag.up.y, tag.up.z).normalize();
    const normal = new Vector3(tag.normal.x, tag.normal.y, tag.normal.z).normalize();
    const orientation = new Matrix4().makeBasis(right, up, normal);
    const origin = new Vector3(tag.position.x, tag.position.y, tag.position.z)
      .addScaledVector(normal, SURFACE_OFFSET_METERS);

    return {
      position: [origin.x, origin.y, origin.z] as [number, number, number],
      quaternion: new Quaternion().setFromRotationMatrix(orientation),
    };
  }, [tag]);

  return (
    <mesh
      name={`BIOBUZZ AprilTag ${tag.id}`}
      position={position}
      quaternion={quaternion}
      castShadow={false}
      receiveShadow={false}
    >
      <planeGeometry args={[TARGET_SIZE_METERS, TARGET_SIZE_METERS]} />
      <meshBasicMaterial map={texture} side={FrontSide} toneMapped={false} />
    </mesh>
  );
}

function HiveTagPlanes({ hive }: { hive: HiveLayout }) {
  const tags = useMemo(() => hive.cells.flatMap((cell) => cell.tags), [hive]);
  const urls = useMemo(
    () => tagUrls(hive),
    [hive],
  );
  const loadedTextures = useLoader(TextureLoader, urls);
  const textures = useMemo(() => loadedTextures.map((texture) => {
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }), [loadedTextures]);

  return (
    <group name={`BIOBUZZ ${hive.id} AprilTags`}>
      {tags.map((tag, index) => (
        <AprilTagPlane key={tag.id} tag={tag} texture={textures[index]!} />
      ))}
    </group>
  );
}

/** Render this inside the moving HIVE group; tag poses use its pivot-local coordinates. */
export function ExportHiveAprilTags({ hiveId }: { hiveId: string }) {
  const hive = layout.hives.find((candidate) => candidate.id === hiveId);
  if (!hive) return null;
  return <HiveTagPlanes hive={hive} />;
}
