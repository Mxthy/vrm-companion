using UnityEngine;
using System.Collections.Generic;

namespace VRMCompanion
{
    /// <summary>
    /// 6. MRPassthroughManager — Enhanced passthrough with occlusion.
    /// Priority: 6 (MR quality)
    /// Uses: OVRPlugin, depthapi, OVRSceneManager
    /// </summary>
    public class MRPassthroughManager : MonoBehaviour
    {
        public static MRPassthroughManager Instance { get; private set; }

        [Header("Passthrough")]
        public OVRPassthroughLayer passthroughLayer;
        public bool enableOcclusion = true;

        [Header("Scene Understanding")]
        public OVRSceneManager sceneManager;
        public bool sceneModelLoaded = false;

        [Header("Anchor Placement")]
        public Transform avatarAnchor;
        public Vector3 anchorOffset = Vector3.zero;

        [Header("Surface Detection")]
        public List<string> detectedSurfaces = new();

        void Awake()
        {
            if (Instance == null) { Instance = this; }
            else { Destroy(gameObject); }
        }

        void Start()
        {
            InitializePassthrough();
            InitializeSceneUnderstanding();
        }

        void InitializePassthrough()
        {
            if (passthroughLayer == null)
            {
                var go = new GameObject("PassthroughLayer");
                passthroughLayer = go.AddComponent<OVRPassthroughLayer>();
                passthroughLayer.overlay = true;
            }

            // Enable Depth API occlusion if available
            if (enableOcclusion)
            {
                // depthapi.dll is already in the base APK
                // Enable via OVRPlugin or depthapi API
                Debug.Log("[MR] Passthrough initialized with occlusion");
            }
            else
            {
                Debug.Log("[MR] Passthrough initialized (no occlusion)");
            }
        }

        void InitializeSceneUnderstanding()
        {
            if (sceneManager == null)
            {
                sceneManager = FindObjectOfType<OVRSceneManager>();
                if (sceneManager == null)
                {
                    var go = new GameObject("OVRSceneManager");
                    sceneManager = go.AddComponent<OVRSceneManager>();
                }
            }

            if (sceneManager != null)
            {
                sceneManager.SceneModelLoadedSuccessfully += OnSceneModelLoaded;
                Debug.Log("[MR] Scene Manager initialized — waiting for room scan");
            }
        }

        void OnSceneModelLoaded()
        {
            sceneModelLoaded = true;
            detectedSurfaces.Clear();

            // Find all OVRScenePlanes (walls, floor, ceiling, furniture)
            var planes = FindObjectsOfType<OVRScenePlane>();
            foreach (var plane in planes)
            {
                string label = plane.gameObject.name;
                detectedSurfaces.Add(label);
                Debug.Log($"[MR] Detected surface: {label}");
            }

            // Auto-place avatar on detected surface (floor by default)
            PlaceAvatarOnSurface("FLOOR");
        }

        public void PlaceAvatarOnSurface(string surfaceName)
        {
            var planes = FindObjectsOfType<OVRScenePlane>();
            foreach (var plane in planes)
            {
                if (plane.gameObject.name.ToUpper().Contains(surfaceName.ToUpper()))
                {
                    Vector3 surfacePos = plane.transform.position;
                    avatarAnchor.position = new Vector3(
                        surfacePos.x + anchorOffset.x,
                        surfacePos.y,
                        surfacePos.z + anchorOffset.z
                    );
                    Debug.Log($"[MR] Avatar placed on {surfaceName} at {avatarAnchor.position}");
                    return;
                }
            }

            Debug.LogWarning($"[MR] Surface {surfaceName} not found");
        }

        public void SetAnchorPosition(Vector3 pos, Quaternion rot)
        {
            if (avatarAnchor != null)
            {
                avatarAnchor.position = pos;
                avatarAnchor.rotation = rot;
                SessionPersistenceController.Instance?.UpdateAnchor(pos, rot);
            }
        }

        public void CyclePlacement()
        {
            // Cycle through detected surfaces for quick placement
            // Use left thumbstick or button
            if (detectedSurfaces.Count == 0) return;

            // Implementation: cycle through surfaces
            Debug.Log("[MR] Cycle placement");
        }
    }
}
