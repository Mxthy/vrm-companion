using UnityEngine;
using System.Threading.Tasks;

namespace VRMCompanion
{
    /// <summary>
    /// 3. AutoFittingWizard — Semi-automatic VRM calibration.
    /// Priority: 3 (calibration UX)
    /// </summary>
    public class AutoFittingWizard : MonoBehaviour
    {
        [Header("Fitting Parameters")]
        public float userHeight = 1.7f;
        public float sliderHeight = 1.7f;
        public float sliderArmReach = 0.6f;
        public float sliderEyeLine = 1.6f;

        [Header("Avatar Reference")]
        public Transform avatarRoot;
        public Transform headBone;
        public Transform leftHand;
        public Transform rightHand;

        private string currentSlotId = "";

        public void Initialize(string slotId, Transform root)
        {
            currentSlotId = slotId;
            avatarRoot = root;
            FindBones();
            LoadExistingFitting();
        }

        void FindBones()
        {
            if (avatarRoot == null) return;

            headBone = avatarRoot.Find("Armature/Hips/Spine/Chest/Neck/Head");
            leftHand = avatarRoot.Find("Armature/Hips/Spine/Chest/Shoulder.L/UpperArm.L/LowerArm.L/Hand.L");
            rightHand = avatarRoot.Find("Armature/Hips/Spine/Chest/Shoulder.R/UpperArm.R/LowerArm.R/Hand.R");

            if (headBone == null)
                Debug.LogWarning("[Fitting] Could not find Head bone — check VRM rig");
        }

        async void LoadExistingFitting()
        {
            var fitting = await AvatarSlotManager.Instance.GetFitting(currentSlotId);
            if (fitting != null)
            {
                sliderHeight = fitting.scale * userHeight;
                sliderArmReach = fitting.arm_reach;
                sliderEyeLine = fitting.eye_line_height;
                ApplyFitting();
            }
        }

        public void OnHeightSliderChanged(float value)
        {
            sliderHeight = value;
            ApplyFitting();
        }

        public void OnArmReachSliderChanged(float value)
        {
            sliderArmReach = value;
            ApplyFitting();
        }

        public void OnEyeLineSliderChanged(float value)
        {
            sliderEyeLine = value;
            ApplyFitting();
        }

        void ApplyFitting()
        {
            if (avatarRoot == null) return;

            float scale = sliderHeight / userHeight;
            avatarRoot.localScale = Vector3.one * scale;

            Debug.Log($"[Fitting] scale={scale:F2}, eyeLine={sliderEyeLine:F2}, armReach={sliderArmReach:F2}");
        }

        public async Task SaveFitting()
        {
            float scale = sliderHeight / userHeight;

            var payload = new
            {
                action = "update",
                avatar_slot_id = currentSlotId,
                data = new
                {
                    scale = scale,
                    eye_line_height = sliderEyeLine,
                    arm_reach = sliderArmReach,
                    seat_height = 0.45f
                }
            };

            await BackendApiClient.PostAsync<object>("avatarManager", payload);
            Debug.Log("[Fitting] Saved to backend");
        }

        public void AutoDetect()
        {
            if (headBone == null) return;

            float avatarHeight = Vector3.Distance(
                avatarRoot.position, headBone.position);
            sliderHeight = avatarHeight;
            sliderEyeLine = headBone.position.y - avatarRoot.position.y;

            if (leftHand != null && rightHand != null)
            {
                float armSpan = Vector3.Distance(leftHand.position, rightHand.position);
                sliderArmReach = armSpan * 0.5f;
            }

            ApplyFitting();
            Debug.Log("[Fitting] Auto-detected proportions");
        }
    }
}
