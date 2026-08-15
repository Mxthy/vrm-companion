using UnityEngine;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace VRMCompanion
{
    /// <summary>
    /// 2. AvatarSlotManager — Multi-avatar management.
    /// Priority: 2 (UX win)
    /// </summary>
    public class AvatarSlotManager : MonoBehaviour
    {
        public static AvatarSlotManager Instance { get; private set; }

        [Header("State")]
        public List<AvatarSlot> slots = new();
        public string activeSlotId = "";

        private const string ENDPOINT = "avatarManager";

        void Awake()
        {
            if (Instance == null) { Instance = this; }
            else { Destroy(gameObject); }
        }

        async void Start()
        {
            await RefreshSlots();
        }

        public async Task RefreshSlots()
        {
            var payload = new { action = "list" };
            var resp = await BackendApiClient.PostAsync<AvatarListResponse>(ENDPOINT, payload);

            if (resp?.success == true && resp.avatar_slots != null)
            {
                slots = new List<AvatarSlot>(resp.avatar_slots);
                Debug.Log($"[AvatarSlots] Loaded {slots.Count} slots");
            }
            else
            {
                slots.Clear();
                Debug.Log("[AvatarSlots] No slots found");
            }
        }

        public async Task<string> CreateSlot(string name, string vrmPath, string thumbnailUrl = "")
        {
            var payload = new
            {
                action = "create",
                data = new
                {
                    avatar_name = name,
                    vrm_file_path = vrmPath,
                    thumbnail_url = thumbnailUrl,
                    is_favorite = false,
                    scale = 1.0,
                    eye_line_height = 1.6,
                    arm_reach = 0.6,
                    seat_height = 0.45
                }
            };

            var resp = await BackendApiClient.PostAsync<AvatarCreateResponse>(ENDPOINT, payload);
            if (resp?.success == true)
            {
                await RefreshSlots();
                return resp.avatar_slot.id;
            }
            return null;
        }

        public async Task ToggleFavorite(string slotId)
        {
            var payload = new { action = "favorite", avatar_slot_id = slotId };
            await BackendApiClient.PostAsync<AvatarResponse>(ENDPOINT, payload);
            await RefreshSlots();
        }

        public async Task<FittingData> GetFitting(string slotId)
        {
            var payload = new { action = "get_fitting", avatar_slot_id = slotId };
            var resp = await BackendApiClient.PostAsync<FittingResponse>(ENDPOINT, payload);
            if (resp?.success == true)
                return resp.fitting;
            return null;
        }

        public void SwitchAvatar(string slotId)
        {
            activeSlotId = slotId;
            SessionPersistenceController.Instance.lastAvatarSlotId = slotId;
            Debug.Log($"[AvatarSlots] Switched to {slotId}");
        }
    }

    [System.Serializable]
    public class AvatarSlot
    {
        public string id;
        public string avatar_name;
        public string vrm_file_path;
        public string thumbnail_url;
        public string[] tags;
        public bool is_favorite;
        public string preset_name;
        public float scale;
        public float eye_line_height;
        public float arm_reach;
        public float floor_contact_offset;
        public float seat_height;
    }

    [System.Serializable]
    public class AvatarListResponse
    {
        public bool success;
        public AvatarSlot[] avatar_slots;
    }

    [System.Serializable]
    public class AvatarCreateResponse
    {
        public bool success;
        public AvatarSlot avatar_slot;
    }

    [System.Serializable]
    public class AvatarResponse
    {
        public bool success;
        public AvatarSlot avatar_slot;
    }

    [System.Serializable]
    public class FittingResponse
    {
        public bool success;
        public FittingData fitting;
    }

    [System.Serializable]
    public class FittingData
    {
        public float scale;
        public float eye_line_height;
        public float arm_reach;
        public float seat_height;
    }
}
