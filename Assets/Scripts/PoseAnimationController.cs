using UnityEngine;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace VRMCompanion
{
    /// <summary>
    /// 4. PoseAnimationController — Plays poses from PoseLibrary entity.
    /// Priority: 4 (content depth)
    /// </summary>
    public class PoseAnimationController : MonoBehaviour
    {
        public static PoseAnimationController Instance { get; private set; }

        [Header("Avatar Reference")]
        public Animator avatarAnimator;
        public Transform avatarRoot;

        [Header("Pose State")]
        public string currentPose = "idle_breathing";
        public List<PoseData> poseLibrary = new();

        [Header("Blending")]
        public float blendDuration = 0.5f;
        private bool isTransitioning = false;

        void Awake()
        {
            if (Instance == null) { Instance = this; }
            else { Destroy(gameObject); }
        }

        async void Start()
        {
            await LoadPoseLibrary();
            PlayPose(SessionPersistenceController.Instance?.preferredPose ?? "idle_breathing");
        }

        async Task LoadPoseLibrary()
        {
            // Poses are loaded from backend PoseLibrary entity
            // For now, seed with known poses
            poseLibrary = new List<PoseData>
            {
                new() { pose_name = "idle_breathing", category = "idle", loop = true },
                new() { pose_name = "idle_look_around", category = "idle", loop = true, duration_seconds = 8 },
                new() { pose_name = "sitting_relaxed", category = "sitting", loop = true },
                new() { pose_name = "sitting_lean_back", category = "sitting", loop = true },
                new() { pose_name = "wave_greeting", category = "waving", loop = false, duration_seconds = 2 },
                new() { pose_name = "wave_excited", category = "waving", loop = false, duration_seconds = 3 },
                new() { pose_name = "photo_stand", category = "photo", loop = true },
                new() { pose_name = "photo_peace", category = "photo", loop = true },
                new() { pose_name = "photo_casual", category = "photo", loop = true },
                new() { pose_name = "point_at_object", category = "interaction", loop = false, duration_seconds = 1.5f },
                new() { pose_name = "reach_out", category = "interaction", loop = false, duration_seconds = 1 }
            };
        }

        public void PlayPose(string poseName)
        {
            var pose = poseLibrary.Find(p => p.pose_name == poseName);
            if (pose == null)
            {
                Debug.LogWarning($"[Pose] Unknown pose: {poseName}");
                return;
            }

            currentPose = poseName;

            // If avatar has Animator, use animation clips
            if (avatarAnimator != null)
            {
                var stateHash = Animator.StringToHash(poseName);
                if (avatarAnimator.HasState(0, stateHash))
                {
                    avatarAnimator.CrossFade(stateHash, blendDuration);
                    Debug.Log($"[Pose] Playing: {poseName}");
                    return;
                }
            }

            // Fallback: procedural pose via bone manipulation
            ApplyProceduralPose(pose);
            Debug.Log($"[Pose] Procedural: {poseName}");
        }

        void ApplyProceduralPose(PoseData pose)
        {
            if (avatarRoot == null) return;

            switch (pose.pose_name)
            {
                case "sitting_relaxed":
                case "sitting_lean_back":
                    avatarRoot.position = new Vector3(
                        avatarRoot.position.x,
                        0.45f, // seat height
                        avatarRoot.position.z
                    );
                    break;

                case "wave_greeting":
                case "wave_excited":
                    TriggerWaveAnimation();
                    break;

                case "photo_stand":
                    avatarRoot.rotation = Quaternion.Euler(0, 0, 0);
                    break;

                case "photo_peace":
                    TriggerPeaceSign();
                    break;
            }
        }

        void TriggerWaveAnimation()
        {
            // Procedural wave via DOTween or direct bone rotation
            var rightArm = avatarRoot.Find("Armature/Hips/Spine/Chest/Shoulder.R/UpperArm.R");
            if (rightArm != null)
            {
                // Simple wave: raise arm and oscillate
                rightArm.localRotation = Quaternion.Euler(-120, 0, 30);
            }
        }

        void TriggerPeaceSign()
        {
            // VRM BlendShape for peace sign (if available)
            var blendShape = avatarRoot.GetComponentInChildren<VRMBlendShapeProxy>();
            // blendShape?.SetValues(new Dictionary<BlendShapeKey, float> { ... });
        }

        public void PlayFromDialog(string poseName)
        {
            PlayPose(poseName);
            SessionPersistenceController.Instance?.UpdatePose(poseName);
        }
    }

    [System.Serializable]
    public class PoseData
    {
        public string pose_name;
        public string category;
        public string description;
        public float duration_seconds;
        public bool loop;
    }
}
