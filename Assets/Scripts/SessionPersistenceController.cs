using UnityEngine;
using System.Threading.Tasks;

namespace VRMCompanion
{
    /// <summary>
    /// 1. SessionPersistenceController — Save/Load app state.
    /// Priority: 1 (easiest, immediate UX win)
    /// </summary>
    public class SessionPersistenceController : MonoBehaviour
    {
        public static SessionPersistenceController Instance { get; private set; }

        [Header("Current Session State")]
        public string lastAvatarSlotId = "";
        public string lastScene = "MainScene";
        public Vector3 lastAnchorPosition = Vector3.zero;
        public Quaternion lastAnchorRotation = Quaternion.identity;
        public string preferredPose = "idle_breathing";

        private const string ENDPOINT = "sessionManager";

        void Awake()
        {
            if (Instance == null) { Instance = this; DontDestroyOnLoad(gameObject); }
            else { Destroy(gameObject); }
        }

        async void Start()
        {
            await LoadSession();
        }

        async void OnApplicationPause(bool paused)
        {
            if (paused) await SaveSession();
        }

        async void OnApplicationQuit()
        {
            await SaveSession();
        }

        public async Task LoadSession()
        {
            var payload = new { action = "load" };
            var resp = await BackendApiClient.PostAsync<SessionResponse>(ENDPOINT, payload);

            if (resp?.success == true && resp.session != null)
            {
                lastAvatarSlotId = resp.session.last_avatar_slot_id ?? "";
                lastScene = resp.session.last_scene ?? "MainScene";
                preferredPose = resp.session.preferred_pose ?? "idle_breathing";

                if (resp.session.last_anchor_position != null)
                    lastAnchorPosition = new Vector3(
                        resp.session.last_anchor_position.x,
                        resp.session.last_anchor_position.y,
                        resp.session.last_anchor_position.z);

                Debug.Log($"[Session] Loaded: avatar={lastAvatarSlotId}, pose={preferredPose}");
            }
            else
            {
                Debug.Log("[Session] No saved session found");
            }
        }

        public async Task SaveSession()
        {
            var payload = new
            {
                action = "save",
                data = new
                {
                    last_avatar_slot_id = lastAvatarSlotId,
                    last_scene = lastScene,
                    last_anchor_position = new { x = lastAnchorPosition.x, y = lastAnchorPosition.y, z = lastAnchorPosition.z },
                    last_anchor_rotation = new { x = lastAnchorRotation.x, y = lastAnchorRotation.y, z = lastAnchorRotation.z, w = lastAnchorRotation.w },
                    preferred_pose = preferredPose
                }
            };

            await BackendApiClient.PostAsync<SessionResponse>(ENDPOINT, payload);
            Debug.Log("[Session] Saved");
        }

        public async Task UpdatePose(string poseName)
        {
            preferredPose = poseName;
            var payload = new { action = "update_pose", data = new { preferred_pose = poseName } };
            await BackendApiClient.PostAsync<SessionResponse>(ENDPOINT, payload);
        }

        public async Task UpdateAnchor(Vector3 pos, Quaternion rot)
        {
            lastAnchorPosition = pos;
            lastAnchorRotation = rot;
            var payload = new
            {
                action = "update_anchor",
                data = new
                {
                    last_anchor_position = new { x = pos.x, y = pos.y, z = pos.z },
                    last_anchor_rotation = new { x = rot.x, y = rot.y, z = rot.z, w = rot.w }
                }
            };
            await BackendApiClient.PostAsync<SessionResponse>(ENDPOINT, payload);
        }
    }

    [System.Serializable]
    public class SessionResponse
    {
        public bool success;
        public SessionData session;
    }

    [System.Serializable]
    public class SessionData
    {
        public string id;
        public string last_avatar_slot_id;
        public string last_scene;
        public AnchorPosition last_anchor_position;
        public AnchorRotation last_anchor_rotation;
        public string preferred_pose;
        public string last_session_date;
    }

    [System.Serializable]
    public class AnchorPosition { public float x, y, z; }
    [System.Serializable]
    public class AnchorRotation { public float x, y, z, w; }
}
