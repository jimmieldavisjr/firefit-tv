// MediaPipe Pose Landmarker on the phone. Full model on the GPU delegate first; Lite on CPU as the fallback.
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export type PoseModel = { landmarker: PoseLandmarker; label: string };

export async function loadPose(prefer: "full" | "lite" = "full"): Promise<PoseModel> {
  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const attempts: { model: "full" | "lite"; delegate: "GPU" | "CPU" }[] =
    prefer === "full"
      ? [
          { model: "full", delegate: "GPU" },
          { model: "lite", delegate: "GPU" },
          { model: "lite", delegate: "CPU" },
        ]
      : [
          { model: "lite", delegate: "GPU" },
          { model: "lite", delegate: "CPU" },
        ];
  let lastErr: unknown;
  for (const a of attempts) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `/models/pose_landmarker_${a.model}.task`, delegate: a.delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      return { landmarker, label: `${a.model}/${a.delegate}` };
    } catch (err) {
      console.warn(`pose ${a.model}/${a.delegate} failed`, err);
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function openCamera(facing: "user" | "environment"): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
}
